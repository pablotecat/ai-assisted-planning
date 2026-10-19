import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { dirname, join, relative, resolve, toNamespacedPath } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const source = fileURLToPath(new URL(".", import.meta.url))
const skill = ".apm/skills/plantillas-entregables"
const formats = ["historia", "tarea", "encargo", "revision", "caso-test"]
const consumers: Record<string, string[]> = {
  planificador: ["historia"], refinador: ["historia"],
  arquitecto: ["encargo", "tarea", "caso-test", "revision"],
  "arquitecto-test": ["caso-test", "revision"], revisor: formats,
}
const common = ["fuentes-evidencias", "configuracion", "publicacion-revision"]
  .map(name => `.apm/skills/operativa-comun/references/${name}.md`)
const read = (name: string) => readFile(join(source, name), "utf8")

function links(markdown: string) {
  // Examples contain fictional paths; validate only navigable documentation links.
  return [...markdown.replace(/```[^\n]*\n[\s\S]*?```/g, "").matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(match => match[1]).filter(link => !/^(?:https?:|mailto:)/.test(link))
}
function headingId(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replaceAll(" ", "-")
}

test("formatos y catálogo tienen punteros locales resolubles, incluidos los destinos compartidos", async () => {
  const documents = ["README.md", "flujo-arquitectura.md", `${skill}/SKILL.md`,
    ...formats.map(name => `${skill}/references/${name}.md`),
    ".apm/skills/user-stories/SKILL.md", ".apm/skills/user-stories/references/drafting.md",
    ".apm/skills/user-stories/references/reviewing.md"]
  const missing = new Set<string>()
  for (const file of documents) {
    for (const link of links(await read(file))) {
      const [path, anchor] = link.split("#")
      const target = resolve(source, dirname(file), path || ".")
      assert.ok(!relative(source, target).startsWith(".."), `${file}: enlace fuera del paquete ${link}`)
      try { await access(target) } catch { missing.add(relative(source, target).replaceAll("\\", "/")); continue }
      if (anchor) {
        const headings = [...(await readFile(target, "utf8")).matchAll(/^#{1,6} (.+)$/gm)]
          .map(match => headingId(match[1].trim()))
        assert.ok(headings.includes(decodeURIComponent(anchor)), `${file}: ancla inexistente ${link}`)
      }
    }
  }
  assert.deepEqual([...missing].sort(), [], `Destinos pendientes de integración: ${[...missing].join(", ")}`)
})

test("consumidores comparten las referencias y el catálogo cubre los intercambios y salidas", async () => {
  const router = await read(`${skill}/SKILL.md`)
  assert.match(router, /^---\r?\nname: plantillas-entregables\r?\ndescription: .+\r?\n---/)
  assert.deepEqual((await readdir(join(source, skill, "references"))).sort(), formats.map(name => `${name}.md`).sort())
  for (const [agent, expected] of Object.entries(consumers)) {
    const text = await read(`.apm/agents/${agent}.agent.md`)
    assert.match(text.split("---")[1], /skill:[\s\S]*?plantillas-entregables: allow/, agent)
    assert.match(text.split("---")[1], /read: allow/, agent)
    for (const format of expected) assert.ok(text.includes(`references/${format}.md`), `${agent}: ${format}`)
  }
  const stories = await read(".apm/skills/user-stories/SKILL.md")
  assert.ok(links(stories).includes("../plantillas-entregables/references/historia.md"))
  assert.ok(links(router).includes("../user-stories/SKILL.md"))
  for (const path of common) assert.ok(links(router).some(link => link.endsWith(path.split("/references/")[1])))
  const catalog = (await read("README.md")).split("## Catálogo de entregables")[1]
  const destinations = links(catalog)
  for (const format of formats) assert.ok(destinations.includes(`${skill}/references/${format}.md`), format)
  for (const owner of ["planificador", "lector-codigo", "lector-documentacion", "investigador"])
    assert.ok(destinations.includes(`.apm/agents/${owner}.agent.md`), owner)
  for (const tool of ["write_planning_originals", "write_planning_deliverables", "write_review_documents", "write_report_pair", "session_store"])
    assert.ok(destinations.includes(`tools/${tool}.ts`), tool)
  for (const specialized of ["domain-glossary", "meeting-coach"])
    assert.ok(destinations.includes(`.apm/skills/${specialized}/SKILL.md`), specialized)
  for (const artifact of ["Originales/", "borrador.md", "incidencias-globales.md", "conclusion.md", "plan-implementacion.md",
    "Handoff", "indice.md", "profile.md", "prep.md", "sources.md", "outcome.md", "state.md"])
    assert.ok(catalog.includes(artifact), artifact)
})

test("plan integrado mantiene seis apartados y delega formatos sin perder continuidad", async () => {
  const contract = await read("flujo-arquitectura.md")
  const integrated = contract.split("## Entrega integrada: `plan-implementacion.md`")[1].split("\n## ")[0]
  assert.deepEqual([...integrated.matchAll(/^\d\. \*\*(.+?):\*\*/gm)].map(match => match[1]), [
    "Resumen y alcance", "Matriz de cobertura", "Borradores listos para copiar",
    "Encargos pendientes", "Bloqueos y cuestiones", "Decisiones y dependencias globales",
  ])
  for (const format of ["encargo", "tarea", "revision", "caso-test"])
    assert.ok(links(contract).some(link => link.startsWith(`${skill}/references/${format}.md`)), format)
  assert.match(contract, /solicitud enviada consume el intento/)
  assert.match(contract, /aprobación parcial no lo reinicia/)
  assert.match(contract, /Backend, Frontend y el proveedor siguen pendientes/)
  assert.match(contract, /handoff[\s\S]*task_id[\s\S]*respuesta/)
})

function isolated(root: string) {
  return { ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    APM_CONFIG_DIR: join(root, "apm-config"), APM_CACHE_DIR: join(root, "apm-cache"),
    npm_config_cache: join(root, "npm-cache"), npm_config_userconfig: join(root, ".npmrc"),
    TEMP: root, TMP: root, TMPDIR: root,
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1" }
}

test("APM distribuye plantillas y OpenCode las carga y lee desde cada consumidor real", { timeout: 240_000 }, async (t) => {
  const parent = join(source, "build")
  await access(source)
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "t"))
  const project = join(root, "p"), host = join(root, "h")
  const env = isolated(root)
  function run(command: string, args: string[], cwd = host) {
    const result = spawnSync(process.platform === "win32" ? "cmd.exe" : command,
      process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args,
      { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
    assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout)
    return result.stdout
  }
  try {
    await mkdir(project)
    await mkdir(host)
    for (const path of [".apm", "apm.yml"]) await cp(join(source, path), join(project, path), { recursive: true })
    t.diagnostic(`Node ${process.version}; OpenCode ${run("opencode", ["--version"]).trim()}; ${run("apm", ["--version"]).trim()}`)
    // APM stages nested paths; the Win32 namespace keeps this fixture within
    // the worktree even when its absolute path exceeds MAX_PATH.
    run("apm", ["install", project, "--target", "opencode", "--no-policy", "--root", toNamespacedPath(host)])
    const skillFiles = (await readdir(host, { recursive: true })).map(name => name.replaceAll("\\", "/")).filter(name => name.endsWith("/SKILL.md"))
    const deployed = skillFiles.find(name => /^\.(agents|opencode)\/skills\//.test(name) && name.includes("plantillas-entregables"))
    assert.ok(deployed, "APM debe distribuir la skill")
    assert.match(deployed.replaceAll("\\", "/"), /^\.(agents|opencode)\/skills\//)
    const installedSkill = dirname(join(host, deployed))
    // External auto-discovery is disabled for isolation; explicitly allow only
    // the skill directory just deployed in this local consumer.
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ skills: { paths: [dirname(installedSkill)] } })
    for (const name of ["SKILL.md", ...formats.map(name => `references/${name}.md`)]) {
      const text = await readFile(join(installedSkill, name), "utf8")
      // APM rewrites existing cross-skill links to its installed source package.
      const withoutDestinations = (value: string) => value.replace(/\]\([^)]+\)/g, "]")
      assert.equal(withoutDestinations(text), withoutDestinations(await read(`${skill}/${name}`)), name)
      for (const link of links(text)) {
        if (link.includes("operativa-comun/")) continue // Separate integration test reports missing plan 2.
        await access(resolve(installedSkill, dirname(name), link.split("#")[0]))
      }
    }
    t.diagnostic(`APM: ${deployed}; plantillas, ejemplos y referencias conservados tras reescritura de enlaces`)
    for (const [agent, expected] of Object.entries(consumers)) {
      const loaded = JSON.parse(run("opencode", ["debug", "agent", agent]))
      assert.equal(loaded.tools.skill, true, `${agent}: skill habilitada`)
      assert.equal(loaded.tools.read, true, `${agent}: read habilitado`)
      const invoked = run("opencode", ["debug", "agent", agent, "--tool", "skill", "--params", "{name:'plantillas-entregables'}"])
      assert.ok(invoked.includes("Plantillas de entregables"), `${agent}: carga efectiva de la skill`)
      for (const format of expected) {
        const path = relative(host, join(installedSkill, "references", `${format}.md`)).replaceAll("\\", "/")
        const reference = run("opencode", ["debug", "agent", agent, "--tool", "read", "--params", `{filePath:'${path}'}`])
        assert.ok(reference.includes("Plantilla copiable"), `${agent}: lectura efectiva de ${format}`)
      }
    }
    t.diagnostic("Cinco consumidores: skill invocada; 13 lecturas reales cubren las cinco referencias; sin llamadas LLM ni Jira")
  } finally { await rm(root, { recursive: true, force: true }) }
})
