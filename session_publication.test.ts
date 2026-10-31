import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { api, opencode, probe, probePlugin, withServer } from "./test-support/opencode.mjs"

const source = fileURLToPath(new URL(".", import.meta.url))

async function fixture(installed = false) {
  // Installed plugins must resolve their own dependencies, not this repository's node_modules.
  const parent = installed ? join(tmpdir(), "opencode") : join(source, "build", "tmp")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "publication-"))
  const config = join(root, ".opencode")
  await mkdir(config)
  await cp(join(source, "plugin"), join(config, "plugins"), { recursive: true })
  await cp(join(source, "tools"), join(config, "tools"), { recursive: true })
  for (const name of ["agent-settings.example.json", "package.json"])
    await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  const env = { ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    npm_config_cache: join(process.env.LOCALAPPDATA ?? tmpdir(), "npm-cache"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "",
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [probePlugin] }),
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1", OPENCODE_DISABLE_MODELS_FETCH: "1" }
  await writeFile(join(config, "opencode.json"), JSON.stringify({ agents: Object.fromEntries(
    ["investigador", "planificador", "revisor"].map(id => [id, { mode: "all", permissions:
      [{ action: "*", resource: "*", effect: "allow" }] }])) }))
  if (installed) {
    await writeFile(join(config, "package.json"), JSON.stringify({ type: "module",
      dependencies: { "jsonc-parser": "0.0.1", zod: "4.1.8" } }))
    const result = spawnSync(process.execPath, [join(source, "scripts", "setup-opencode.mjs")],
      { cwd: root, env, encoding: "utf8", timeout: 240_000 })
    assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout)
    assert.match(result.stdout, /plugins verificados/)
    const dependencies = JSON.parse(await readFile(join(config, "package.json"), "utf8")).dependencies
    assert.equal(dependencies["jsonc-parser"], "3.3.1")
    assert.equal(dependencies.zod, "4.1.8", "Dependencia ajena conservada")
  }
  return { root, config, env }
}

async function publishAll(call: (agent: string, tool: string, args: object) => Promise<any>) {
  const check = async (agent: string, tool: string, args: object, name: string, content: string) => {
    const result = await call(agent, tool, args)
    assert.equal(result.guardado, true, JSON.stringify(result))
    assert.equal(await readFile(result.rutas[name], "utf8"), content)
    return result
  }
  await check("investigador", "publish_agent_deliverable", { nombre: "nota.md", contenido: "Nota" }, "nota.md", "Nota")
  await check("investigador", "write_report_pair", { slug: "consulta", resumen_ejecutivo: "Resumen",
    informe_detallado: "Detalle" }, "informe-detallado.md", "Detalle")
  await check("planificador", "write_planning_originals", { historias: [{ clave: "APP-1", contenido: "Original" }] }, "APP-1.md", "Original")
  const delivery = await check("planificador", "write_planning_deliverables", { historias:
    [{ clave: "APP-1", contenido: "Refinada", incidencias: "Ninguna" }], incidencias_globales: "Ninguna" }, "APP-1.md", "Refinada")
  await check("revisor", "write_review_documents", { entrega: dirname(delivery.rutas["APP-1.md"]), sanidad: "Revisada" },
    "sanity-check.md", "Revisada")
  return delivery
}

test("los cinco publicadores conservan su resolvedor aunque se inicialice otra instancia del plugin", async () => {
  const { root, config } = await fixture()
  try {
    const { default: plugin } = await import(pathToFileURL(join(config, "plugins", "agent-session.ts")).href)
    async function setup(title: string) {
      const tools: Record<string, any> = {}
      await plugin.setup({
        session: {
          get: async ({ sessionID }: any) => ({ id: sessionID, agent: sessionID,
            parentID: sessionID === "revisor" ? "planificador" : undefined, title,
            time: { created: 1 }, location: { directory: root } }),
          context: async ({ sessionID }: any) => [{ id: "mensaje", type: "assistant", agent: sessionID }],
          hook: async () => {},
        },
        agent: { transform: async () => {} },
        permission: { assert: async () => {}, hook: async () => {} },
        tool: { transform: async (fn: any) => fn({ add: (tool: any) => { tools[tool.name] = tool } }), hook: async () => {} },
      } as never)
      return async (agent: string, tool: string, args: object) => JSON.parse((await tools[tool].execute(args,
        { sessionID: agent, messageID: "mensaje", id: "call", agent })).content)
    }
    const first = await setup("Primera instancia")
    await setup("Segunda instancia")
    const delivery = await publishAll(first)
    assert.match(delivery.sesion, /primera-instancia$/)
    await assert.rejects(first("build", "write_report_pair", { slug: "consulta", resumen_ejecutivo: "Resumen",
      informe_detallado: "Detalle" }), /Solo investigador/)
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})

test("servicio OpenCode real: los cinco publicadores guardan antes y después de recargar el location", {
  skip: opencode(["--version"], source).status !== 0 ? "Requiere OpenCode en PATH" : false,
  timeout: 300_000,
}, async () => {
  const { root, config, env } = await fixture(true)
  try {
    const broken = join(config, "plugins", "zz-broken.ts")
    await writeFile(broken, 'export default { id: "broken", setup() { throw new Error("Fallo de prueba") } }')
    const failed = spawnSync(process.execPath, [join(source, "scripts", "verify-opencode.mjs")],
      { cwd: root, env, encoding: "utf8", timeout: 120_000 })
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /Plugins que no cargan/)
    assert.ok(failed.stderr.includes(broken))
    await rm(broken)
    await withServer(root, env, async connected => {
      // Inspect the installed runtime's registry, not a model's choice of interface.
      const catalog = probe(root, connected, { agent: "planificador" })
      for (const name of ["planning_settings", "publish_agent_deliverable", "write_planning_deliverables"]) {
        assert.ok(catalog.tools.includes(name), name)
        assert.ok(!catalog.codeModeTools.includes(name), `${name} es directa, fuera de Code Mode`)
      }
      const settings = probe(root, connected, { agent: "planificador", tool: "planning_settings", args: {} })
      assert.equal(typeof JSON.parse(settings.result.content).MAX_REFINADORES_PARALELOS, "number")
      await assert.rejects(readdir(join(root, "informes-agente", "sesiones")), { code: "ENOENT" },
        "Consultar catálogo y configuración no intenta publicar")
      const denied = api("post", "/api/session", root, connected, { agent: "planificador", title: "Denegación real",
        permissions: [{ action: "planning_settings", resource: "*", effect: "deny" }] }).data
      const rejection = probe(root, connected, { sessionID: denied.id, agent: "planificador", tool: "planning_settings",
        args: {}, captureError: true })
      assert.match(rejection.error, /denied|permission|denegad/i)
      const roleError = probe(root, connected, { agent: "investigador", tool: "planning_settings", args: {}, captureError: true })
      assert.match(roleError.error, /Solo planificador/)
      const template = api("post", "/api/session", root, connected, { agent: "planificador", title: "Plantilla" }).data
      async function round(label: string) {
        const ids = Object.fromEntries(["planificador", "investigador", "revisor"].map(agent => [agent, `${template.id}-${label}-${agent}`]))
        for (const agent of ["planificador", "investigador", "revisor"]) {
          // Import a real, attributed assistant message without contacting a model provider.
          api("post", "/api/experimental/session/import", root, connected, {
            info: { ...template, id: ids[agent], agent, title: label,
              ...(agent === "revisor" ? { parentID: ids.planificador } : {}) },
            messages: [{ id: `msg_user_${label}_${agent}`, type: "user", time: { created: template.time.created }, text: "Publica" },
              { id: `msg_${label}_${agent}`, type: "assistant", agent, time: { created: template.time.created + 1, completed: template.time.created + 2 },
                model: { providerID: "fixture", id: "fixture" }, finish: "stop", content: [{ type: "text", text: "Publicación de prueba" }] }],
          })
          const context = api("get", `/api/session/${ids[agent]}/context`, root, connected)
          assert.ok(JSON.stringify(context).includes(`msg_${label}_${agent}`), JSON.stringify(context))
        }
        const call = async (agent: string, tool: string, args: object) => {
          const result = probe(root, connected, { sessionID: ids[agent], messageID: `msg_${label}_${agent}`, agent, tool, args })
          return JSON.parse(result.result.content)
        }
        return { delivery: await publishAll(call), call }
      }
      const before = await round("antes")
      const invalid = probe(root, connected, { sessionID: `${template.id}-antes-investigador`,
        messageID: "msg_antes_investigador", agent: "investigador", tool: "publish_agent_deliverable",
        args: { nombre: "../nota.md", contenido: "Fuera de alcance" }, captureError: true })
      assert.match(invalid.error, /Nombre de archivo no permitido/)
      api("post", "/api/location/reload", root, connected, {})
      const after = await round("despues")
      assert.notEqual(after.delivery.sesion, before.delivery.sesion)
      const continued = await before.call("investigador", "publish_agent_deliverable", { nombre: "nota.md", contenido: "Tras recarga" })
      assert.equal(continued.guardado, true)
      assert.equal(await readFile(continued.rutas["nota.md"], "utf8"), "Tras recarga")
      assert.equal(await readFile(before.delivery.rutas["APP-1.md"], "utf8"), "Refinada")
    }, ["planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})
