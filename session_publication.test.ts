import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
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
  await mkdir(join(config, "agents"))
  for (const name of ["planificador", "refinador", "investigador", "lector-codigo", "lector-documentacion", "arquitecto", "arquitecto-test", "revisor"])
    await cp(join(source, ".apm", "agents", `${name}.agent.md`), join(config, "agents", `${name}.md`))
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

type PublicationCall = { agent: string; tool: string; args: any; result: any }
async function publishAll(call: (agent: string, tool: string, args: object) => Promise<any>, operations?: PublicationCall[]) {
  const check = async (agent: string, tool: string, args: object, name: string, content: string) => {
    const request = operations ? { ...args, operacion_id: `${tool}-1` } : args
    const result = await call(agent, tool, request)
    assert.equal(result.guardado, true, JSON.stringify(result))
    assert.equal(await readFile(result.rutas[name], "utf8"), content)
    if (operations) {
      operations.push({ agent, tool, args: request, result })
      assert.deepEqual(await call(agent, tool, request), result)
    }
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
    const resolved: string[] = []
    async function setup(title: string) {
      const tools: Record<string, any> = {}
      await plugin.setup({
        session: {
          get: async ({ sessionID }: any) => { resolved.push(title); return { id: sessionID, agent: sessionID,
            parentID: sessionID === "revisor" ? "planificador" : undefined, title,
            time: { created: 1 }, location: { directory: root } } },
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
    const operations: PublicationCall[] = []
    const delivery = await publishAll(first, operations)
    assert.match(delivery.sesion, /primera-instancia$/)
    const work = (await first("investigador", "session_work", { action: "create", pregunta: "Recuperar", criterios: [], corpus: "fixture", referencia: "v1" })).encargo
    const note = await first("investigador", "publish_agent_deliverable", { encargo_id: work.id, nombre: "nota.md", contenido: "Recuperable", operacion_id: "s06-note" })
    await setup("Tercera instancia")
    const count = resolved.length
    for (const operation of operations)
      assert.deepEqual(await first(operation.agent, operation.tool, operation.args), operation.result)
    assert.equal((await first("investigador", "session_artifacts", { action: "list", encargo_id: work.id, corpus: "fixture", referencia: "v1" })).artefactos[0].id, note.artefacto_id)
    assert.ok(resolved.length > count, "la recuperación vuelve a resolver identidad por runtime")
    assert.ok(resolved.every(title => title === "Primera instancia"))
    await assert.rejects(first("build", "write_report_pair", { slug: "consulta", resumen_ejecutivo: "Resumen",
      informe_detallado: "Detalle" }), /Solo investigador/)
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})

test("servicio OpenCode real: los cinco publicadores guardan antes y después de recargar el location", {
  skip: opencode(["--version"], source).status !== 0 ? "Requiere OpenCode en PATH" : false,
  timeout: 420_000,
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
      const deniedRole = probe(root, connected, { agent: "investigador", tool: "planning_settings", args: {}, captureError: true })
      assert.match(deniedRole.error, /Permission denied: planning_settings/)
      // Exercise the independent runtime role guard too, even if a consumer grants the tool.
      const grantedWrongRole = api("post", "/api/session", root, connected, { agent: "investigador", title: "Validación de rol",
        permissions: [{ action: "planning_settings", resource: "*", effect: "allow" }] }).data
      const roleError = probe(root, connected, { sessionID: grantedWrongRole.id, agent: "investigador", tool: "planning_settings", args: {}, captureError: true })
      assert.match(roleError.error, /Solo planificador/)
      const template = api("post", "/api/session", root, connected, { agent: "planificador", title: "Plantilla" }).data
      async function round(label: string, operations?: PublicationCall[]) {
        const ids = Object.fromEntries(["planificador", "investigador", "revisor"].map(agent => [agent, `${template.id}-${label}-${agent}`]))
        for (const agent of ["planificador", "investigador", "revisor"]) {
          // Import a real, attributed assistant message without contacting a model provider.
          api("post", "/api/experimental/session/import", root, connected, {
            info: { ...template, id: ids[agent], agent, title: label,
              ...(agent === "revisor" ? { parentID: ids.planificador } : {}) },
            messages: [{ id: `msg_user_${label}_${agent}`, type: "user", time: { created: template.time.created }, text: "Publica" },
              { id: `msg_${label}_${agent}`, type: "assistant", agent, time: { created: template.time.created + 1, completed: template.time.created + 2 },
                model: { providerID: "fixture", id: "fixture" }, finish: "stop", content: [{ type: "text", text: "Publicación de prueba" }] },
              { id: `msg_retry_${label}_${agent}`, type: "assistant", agent, time: { created: template.time.created + 3, completed: template.time.created + 4 },
                model: { providerID: "fixture", id: "fixture" }, finish: "stop", content: [{ type: "text", text: "Continuación sintética" }] }],
          })
          const context = api("get", `/api/session/${ids[agent]}/context`, root, connected)
          assert.ok(JSON.stringify(context).includes(`msg_${label}_${agent}`), JSON.stringify(context))
        }
        const call = async (agent: string, tool: string, args: object, retry = false) => {
          const result = probe(root, connected, { sessionID: ids[agent], messageID: `msg_${retry ? "retry_" : ""}${label}_${agent}`, agent, tool, args })
          return JSON.parse(result.result.content)
        }
        return { delivery: await publishAll(call, operations), call, ids }
      }
      const before = await round("antes")
      const invalid = probe(root, connected, { sessionID: `${template.id}-antes-investigador`,
        messageID: "msg_antes_investigador", agent: "investigador", tool: "publish_agent_deliverable",
        args: { nombre: "../nota.md", contenido: "Fuera de alcance" }, captureError: true })
      assert.match(invalid.error, /Nombre de archivo no permitido/)
      const operations: PublicationCall[] = []
      const stable = await round("idempotente", operations)
      assert.equal(operations.length, 5)
      async function s05Round(current: typeof stable, label: string, tracked?: PublicationCall[]) {
        const calls: PublicationCall[] = []
        const call = async (agent: string, tool: string, args: object) => {
          const result = await current.call(agent, tool, args, true)
          assert.ok(result.guardado)
          calls.push({ agent, tool, args, result })
          return result
        }
        const origin = (publication: any, name: string) => {
          const path = relative(publication.sesion, publication.rutas[name]).replace(/\\/g, "/")
          const file = publication.archivos.find((file: any) => file.path === path)
          assert.ok(file, "referencia obtenida del retorno del publicador, sin lectura adicional")
          return { artefacto_id: publication.artefacto_id, archivo: file.path, sha256: file.sha256 }
        }
        const promotionArgs = { operacion_id: `promocion-${label}`, historias: [{ clave: "APP-1",
          origen_contenido: await origin(current.delivery, "APP-1.md"),
          origen_incidencias: await origin(current.delivery, "APP-1-incidencias.md") }],
          origen_incidencias_globales: await origin(current.delivery, "incidencias-globales.md") }
        const promoted = await call("planificador", "write_planning_deliverables", promotionArgs)
        for (const name of Object.keys(current.delivery.rutas))
          assert.deepEqual(await readFile(promoted.rutas[name]), await readFile(current.delivery.rutas[name]))
        const latest = await call("planificador", "write_planning_deliverables", { operacion_id: `nueva-${label}`,
          historias: [{ clave: "APP-1", contenido: "Nueva versión completa", incidencias: "Ninguna" }], incidencias_globales: "Ninguna" })
        const verdict = { artefacto_id: promoted.artefacto_id, hash_manifiesto: promoted.hash_manifiesto,
          resultado: "parcial", alcance: ["CA-1", "CA-2"], aprobados: ["CA-1"], pendientes: ["CA-2"], bloqueados: [] }
        const reviewArgs = { operacion_id: `revision-${label}`, entrega: dirname(promoted.rutas["APP-1.md"]),
          sanidad: "CA-1 aprobado; CA-2 pendiente. Revisión tardía de la versión promovida.", dictamen: verdict }
        const reviewed = await call("revisor", "write_review_documents", reviewArgs)
        assert.deepEqual(await current.call("revisor", "write_review_documents", reviewArgs, true), reviewed)
        for (const name of Object.keys(current.delivery.rutas))
          assert.deepEqual(await readFile(promoted.rutas[name]), await readFile(current.delivery.rutas[name]))
        const invalid = probe(root, connected, { sessionID: current.ids.planificador, messageID: `msg_retry_${label === "antes" ? "idempotente" : "despues"}_planificador`,
          agent: "planificador", tool: "write_planning_deliverables", args: { ...promotionArgs, operacion_id: `hash-incorrecto-${label}`,
            historias: [{ ...promotionArgs.historias[0], origen_contenido: { ...promotionArgs.historias[0].origen_contenido, sha256: "0".repeat(64) } }] }, captureError: true })
        assert.match(invalid.error, /Hash de origen incorrecto/)
        const stateID = createHash("sha256").update(root + "\0" + current.ids.planificador).digest("hex")
        const state = JSON.parse(await readFile(join(root, "informes-agente", "sesiones", ".control", stateID, "state.json"), "utf8"))
        const version = Object.values<any>(state.versions).find(version => version.type === "write_planning_deliverables")
        assert.equal(version.published, latest.artefacto_id)
        assert.equal(version.reviewed, promoted.artefacto_id)
        assert.equal(version.approved, undefined)
        assert.deepEqual(state.reviews[reviewed.artefacto_id].verdict, verdict)
        assert.equal(state.artifacts[promoted.artefacto_id].manifestHash, promoted.hash_manifiesto)
        const index = await readFile(join(promoted.sesion, "indice.md"), "utf8")
        assert.match(index, /aprobación parcial; sin aprobación completa/)
        assert.match(index, /pendiente de revisión/)
        for (const match of index.matchAll(/\]\(\.\/([^)]*)\)/g)) assert.ok(await stat(join(promoted.sesion, decodeURI(match[1]))), match[1])
        // Exercise the other two promotion schemas through the installed registry too.
        const note = await call("investigador", "publish_agent_deliverable", { operacion_id: `nota-${label}`, nombre: "nota.md", contenido: "Nota íntegra\r\nñ" })
        await call("investigador", "publish_agent_deliverable", { operacion_id: `nota-promovida-${label}`, nombre: "nota.md", origen: await origin(note, "nota.md") })
        const pair = await call("investigador", "write_report_pair", { operacion_id: `par-${label}`, slug: "consulta",
          resumen_ejecutivo: "Resumen\r\nñ", informe_detallado: "Detalle\n" })
        const promotedPair = await call("investigador", "write_report_pair", { operacion_id: `par-promovido-${label}`, slug: "consulta",
          origen_resumen_ejecutivo: await origin(pair, "resumen-ejecutivo.md"), origen_informe_detallado: await origin(pair, "informe-detallado.md") })
        for (const name of Object.keys(pair.rutas)) assert.deepEqual(await readFile(promotedPair.rutas[name]), await readFile(pair.rutas[name]))
        tracked?.push(...calls)
      }
      await s05Round(stable, "antes", operations)
      // S06 uses a separate native tree; no work/corpus is inferred for the S04/S05 calls above.
      const recoveryIDs: Record<string, string> = {}
      for (const [id, agent, parent] of [["plan", "planificador"], ["ref", "refinador", "plan"], ["research", "investigador", "ref"],
        ["replacement", "investigador", "ref"], ["sibling", "refinador", "plan"], ["review", "revisor", "research"],
        ["code", "lector-codigo", "research"]]) {
        recoveryIDs[id] = `${template.id}-s06-${id}`
        api("post", "/api/experimental/session/import", root, connected, {
          info: { ...template, id: recoveryIDs[id], agent, title: `S06 ${id}`, ...(parent ? { parentID: recoveryIDs[parent] } : {}) },
          messages: [{ id: `msg_s06_${id}`, type: "assistant", agent, time: { created: template.time.created + 1, completed: template.time.created + 2 },
            model: { providerID: "fixture", id: "fixture" }, finish: "stop", content: [{ type: "text", text: "Resultado sintético S06" }] }],
        })
      }
      const recoveryCall = (id: string, agent: string, tool: string, args: object, captureError = false) => {
        const response = probe(root, connected, { sessionID: recoveryIDs[id], messageID: `msg_s06_${id}`, agent, tool, args, captureError })
        return captureError ? response : JSON.parse(response.result.content)
      }
      const createArgs = { action: "create", pregunta: "CA-1 y CA-2", criterios: ["CA-1", "CA-2"], corpus: "fixture-S06", referencia: "v1" }
      const ownWork = recoveryCall("ref", "refinador", "session_work", createArgs).encargo
      const work = recoveryCall("ref", "refinador", "session_work", { ...createArgs,
        padre_id: ownWork.id, responsable_session_id: recoveryIDs.research }).encargo
      const readerWork = recoveryCall("research", "investigador", "session_work", { ...createArgs,
        padre_id: work.id, responsable_session_id: recoveryIDs.code }).encargo
      const readerResult = recoveryCall("code", "lector-codigo", "publish_agent_deliverable", { encargo_id: readerWork.id,
        operacion_id: "s06-reader", nombre: "investigacion.md", contenido: "Conclusión del lector, no código crudo" })
      assert.match(work.id, /^work-/)
      assert.notEqual(work.id, recoveryIDs.research)
      const publicationArgs = { encargo_id: work.id, operacion_id: "s06-result", nombre: "conclusion.md", contenido: "CA-1 íntegro 😀\r\nCA-2 pendiente",
        fuentes: ["APP-1"], decisiones: ["No inferir CA-2"] }
      recoveryCall("research", "investigador", "publish_agent_deliverable", publicationArgs) // Discard the successful reply.
      recoveryCall("research", "investigador", "session_work", { action: "record", encargo_id: work.id, resultado: "CA-1 verificado", suficiencia: "parcial",
        pendientes: ["CA-2"], siguiente_accion: "Lector de CA-2", fuentes: ["APP-1"], decisiones: ["No inferir CA-2"],
        historial_revision: { intentos_consumidos: 2, limite: 3, referencias: ["informe-sintético"] } })
      const inventoryArgs = { action: "list", encargo_id: work.id, corpus: "fixture-S06", referencia: "v1" }
      const recoveryInventory = recoveryCall("ref", "refinador", "session_artifacts", inventoryArgs)
      const recoveredArtifact = recoveryInventory.artefactos[0]
      assert.equal(recoveredArtifact.operacion_id, "s06-result")
      assert.equal(recoveredArtifact.producerSessionID, recoveryIDs.research)
      assert.deepEqual(recoveredArtifact.fuentes, publicationArgs.fuentes)
      assert.match(recoveryCall("sibling", "refinador", "session_artifacts", inventoryArgs, true).error, /no asignado/)
      assert.match(recoveryCall("research", "investigador", "session_artifacts", { ...inventoryArgs, corpus: "otro" }, true).error, /Corpus/)
      assert.match(recoveryCall("research", "investigador", "session_artifacts", { ...inventoryArgs, path: root }, true).error, /Unrecognized/)
      const readArgs = { ...inventoryArgs, action: "read", artefacto_id: recoveredArtifact.id, archivo: recoveredArtifact.files[0].path, limite: 7 }
      const readRecovery = (id: string, agent: string) => {
        let content = "", cursor: string | null = null
        do {
          const page = recoveryCall(id, agent, "session_artifacts", { ...readArgs, ...(cursor ? { cursor } : {}) })
          content += page.contenido
          cursor = page.cursor
        } while (cursor)
        assert.equal(content, publicationArgs.contenido)
      }
      readRecovery("ref", "refinador")
      const deniedWork = api("post", "/api/session", root, connected, { agent: "investigador", title: "S06 denegada",
        permissions: [{ action: "session_work", resource: "*", effect: "deny" }] }).data
      assert.match(probe(root, connected, { sessionID: deniedWork.id, agent: "investigador", tool: "session_work",
        args: { action: "list" }, captureError: true }).error, /denied|permission|denegad/i)
      const snapshots = new Map<string, Buffer>()
      for (const operation of operations) for (const path of Object.values<string>(operation.result.rutas))
        snapshots.set(path, await readFile(path))
      // Simulate a lost response: deliberately discard a successful native result,
      // then retry from another attributed assistant message before and after reload.
      for (const operation of operations) {
        await stable.call(operation.agent, operation.tool, operation.args)
        assert.deepEqual(await stable.call(operation.agent, operation.tool, operation.args, true), operation.result)
      }
      const deliveryCall = operations.find(operation => operation.tool === "write_planning_deliverables")!
      const conflict = probe(root, connected, { sessionID: stable.ids.planificador, messageID: "msg_idempotente_planificador", agent: "planificador",
        tool: deliveryCall.tool, args: { ...deliveryCall.args, incidencias_globales: "Cambio con clave reutilizada" }, captureError: true })
      assert.match(conflict.error, /contenido distinto/)
      api("post", "/api/location/reload", root, connected, {})
      assert.deepEqual(recoveryCall("ref", "refinador", "session_artifacts", inventoryArgs), recoveryInventory)
      readRecovery("ref", "refinador")
      recoveryCall("ref", "refinador", "session_work", { action: "assign", encargo_id: work.id, responsable_session_id: recoveryIDs.replacement })
      const recoveredWork = recoveryCall("replacement", "investigador", "session_work", { action: "get", encargo_id: work.id }).encargo
      assert.equal(recoveredWork.events[1].historial_revision.intentos_consumidos, 2)
      assert.deepEqual(recoveredWork.events[1].pendientes, ["CA-2"])
      readRecovery("replacement", "investigador")
      assert.equal(recoveryCall("replacement", "investigador", "session_artifacts", inventoryArgs).artefactos[0].producerSessionID, recoveryIDs.research)
      const readerInventory = recoveryCall("replacement", "investigador", "session_artifacts", { ...inventoryArgs, encargo_id: readerWork.id })
      assert.equal(readerInventory.artefactos[0].id, readerResult.artefacto_id)
      assert.equal(readerInventory.artefactos[0].producerSessionID, recoveryIDs.code)
      const after = await round("despues")
      assert.notEqual(after.delivery.sesion, before.delivery.sesion)
      await s05Round(after, "despues")
      for (const operation of operations) {
        assert.deepEqual(await stable.call(operation.agent, operation.tool, operation.args, true), operation.result)
        const stateID = createHash("sha256").update(root + "\0" + (operation.agent === "investigador" ? stable.ids.investigador : stable.ids.planificador)).digest("hex")
        const state = JSON.parse(await readFile(join(root, "informes-agente", "sesiones", ".control", stateID, "state.json"), "utf8"))
        const artifact = state.artifacts[operation.result.artefacto_id]
        assert.equal(createHash("sha256").update(JSON.stringify(artifact.files)).digest("hex"), operation.result.hash_manifiesto)
        for (const file of artifact.files) {
          const bytes = await readFile(join(operation.result.sesion, file.path))
          assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256)
          assert.equal(bytes.length, file.bytes)
        }
      }
      const unattributed = probe(root, connected, { sessionID: stable.ids.planificador, messageID: "msg_user_idempotente_planificador",
        agent: "planificador", tool: deliveryCall.tool, args: deliveryCall.args, captureError: true })
      assert.match(unattributed.error, /atribuible/)
      const correction = await stable.call("planificador", deliveryCall.tool, { ...deliveryCall.args, operacion_id: "correccion-1",
        historias: [{ clave: "APP-1", contenido: "Corrección completa", incidencias: "Ninguna" }] }, true)
      assert.notEqual(correction.artefacto_id, deliveryCall.result.artefacto_id)
      assert.match(correction.rutas["APP-1.md"], /entrega-04/)
      assert.equal(await readFile(correction.rutas["APP-1-incidencias.md"], "utf8"), "Ninguna")
      for (const [path, bytes] of snapshots) assert.deepEqual(await readFile(path), bytes)

      const settingsPath = join(config, "agent-settings.json")
      const savedSettings = JSON.parse(await readFile(settingsPath, "utf8"))
      const disabled = structuredClone(savedSettings)
      for (const agent of ["investigador", "planificador", "revisor"]) disabled.agentes[agent].guardarEntregablesEnSesion = false
      await writeFile(settingsPath, JSON.stringify(disabled))
      const controlRoot = join(root, "informes-agente", "sesiones", ".control")
      const controls = await Promise.all((await readdir(controlRoot)).map(async name => ({ path: join(controlRoot, name, "state.json"),
        content: await readFile(join(controlRoot, name, "state.json")) })))
      for (const reload of [false, true]) {
        if (reload) api("post", "/api/location/reload", root, connected, {})
        for (const operation of operations)
          assert.deepEqual(await stable.call(operation.agent, operation.tool, operation.args, true), { guardado: false })
        for (const control of controls) assert.deepEqual(await readFile(control.path), control.content)
        assert.deepEqual(recoveryCall("replacement", "investigador", "session_work", { action: "record", encargo_id: work.id,
          resultado: "Parcial sin guardar", suficiencia: "parcial", pendientes: ["CA-2"], siguiente_accion: "Conservar contexto", fuentes: [], decisiones: [] }), { guardado: false })
        readRecovery("replacement", "investigador")
        for (const control of controls) assert.deepEqual(await readFile(control.path), control.content)
      }
      await writeFile(settingsPath, JSON.stringify(savedSettings))
      const continued = await before.call("investigador", "publish_agent_deliverable", { nombre: "nota.md", contenido: "Tras recarga" })
      assert.equal(continued.guardado, true)
      assert.equal(await readFile(continued.rutas["nota.md"], "utf8"), "Tras recarga")
      assert.equal(await readFile(before.delivery.rutas["APP-1.md"], "utf8"), "Refinada")
    }, ["planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})
