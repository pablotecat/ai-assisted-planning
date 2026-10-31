import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { parse } from "jsonc-parser"
import { jiraAliasStatus } from "./scripts/jira-aliases.mjs"
import { api, opencode, probe, probePlugin, withServer } from "./test-support/opencode.mjs"

const source = fileURLToPath(new URL(".", import.meta.url))
const jiraAgents = ["planificador", "investigador", "arquitecto", "refinador", "lector-documentacion", "revisor"]
const sharedSkills = ["consulta-jira", "consulta-codegraph", "lectura-documental", "operativa-comun"]
const skillAccess: Record<string, string[]> = {
  investigador: ["consulta-jira", "operativa-comun"],
  "lector-codigo": ["consulta-codegraph", "operativa-comun"],
  "lector-documentacion": ["consulta-jira", "lectura-documental", "operativa-comun"],
  planificador: ["user-stories", "consulta-jira", "operativa-comun", "plantillas-entregables"],
  refinador: ["user-stories", "consulta-jira", "operativa-comun", "plantillas-entregables"],
  arquitecto: ["consulta-jira", "operativa-comun", "plantillas-entregables"],
  "arquitecto-test": ["operativa-comun", "plantillas-entregables"],
  revisor: ["consulta-jira", "operativa-comun", "plantillas-entregables", "user-stories"],
}
const references = ["fuentes-evidencias.md", "configuracion.md", "publicacion-revision.md"]
const researchChain: Record<string, Record<string, string>> = {
  planificador: { "*": "deny", refinador: "allow", revisor: "allow" },
  refinador: { "*": "deny", investigador: "allow", revisor: "allow" },
  investigador: { "*": "deny", "lector-codigo": "allow", "lector-documentacion": "allow", revisor: "allow" },
}
const researchTargets = ["refinador", "investigador", "lector-codigo", "lector-documentacion", "revisor", "general"]
const reads = ["getAccessibleAtlassianResources", "getJiraIssue", "getJiraProjectIssueTypesMetadata",
  "listJiraIssueComments", "listJiraIssueTransitions", "listJiraIssueWorklogs", "lookupJiraAccountId",
  "search", "searchJiraIssuesUsingJql", "fetch", "discover", "executeRead"]
const writes = ["createJiraIssue", "editJiraIssue", "addCommentToJiraIssue", "addOrEditJiraIssueComment",
  "transitionJiraIssue", "addWorklogToJiraIssue", "addOrEditJiraIssueWorklog", "deleteJiraIssue",
  "executeWrite", "executeDestructive", "unknownOperation"]
const names = ["jira", "atlassian"].flatMap((alias) =>
  [...reads, ...writes, "atlassianUserInfo"].map((name) => `${alias}_${name}`))

function cli(command: string, args: string[], cwd = source, env = process.env) {
  if (command === "opencode") return opencode(args, cwd, env)
  return spawnSync(process.platform === "win32" ? "cmd.exe" : command,
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args,
    { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
}

function isolated(root: string) {
  return { ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    APM_CONFIG_DIR: join(root, "apm-config"), APM_CACHE_DIR: join(root, "apm-cache"),
    npm_config_cache: join(root, "npm-cache"), npm_config_userconfig: join(root, ".npmrc"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1" }
}

const versionRoot = await mkdtemp(join(tmpdir(), "shared-rules-cli-"))
const version = cli("opencode", ["--version"], source, isolated(versionRoot))
const apmVersion = cli("apm", ["--version"], source, isolated(versionRoot))
await rm(versionRoot, { recursive: true, force: true })

async function checkPointers(skillsDir: string) {
  // Resolve from the installed file, not the repository: APM must preserve both
  // references within a skill and links between sibling skills.
  for (const name of [...sharedSkills, "plantillas-entregables", "user-stories", "domain-glossary", "meeting-coach"]) {
    const entry = join(skillsDir, name, "SKILL.md")
    const text = await readFile(entry, "utf8")
    assert.match(text, new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription: .+`, "m"))
    assert.ok(!text.includes("disable-model-invocation:"))
    const files = (await readdir(join(skillsDir, name), { recursive: true }))
      .filter(file => file.endsWith(".md")).map(file => join(skillsDir, name, file))
    for (const file of files) {
      const body = await readFile(file, "utf8")
      for (const [, target] of body.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))
        assert.ok((await readFile(resolve(dirname(file), target), "utf8")).length, `${file} -> ${target}`)
    }
  }
}

test("instalación reconoce ambos alias, configuraciones globales resueltas y Jira pendiente", () => {
  for (const alias of ["jira", "atlassian"]) {
    const server = { type: "remote", url: "https://mcp.atlassian.com/v2/mcp" }
    assert.match(jiraAliasStatus({ mcp: { [alias]: server } }), new RegExp(`configurados: ${alias}`))
    assert.match(jiraAliasStatus({ mcp: { servers: { [alias]: server } } }), new RegExp(`configurados: ${alias}`))
  }
  assert.match(jiraAliasStatus({}), /Jira pendiente/)
  assert.match(jiraAliasStatus([{ type: "document", info: { mcp: { servers: { jira: { type: "remote", url: "https://mcp.atlassian.com/v2/mcp" } } } } }]), /configurados: jira/)
  assert.match(jiraAliasStatus({ mcp: { jira: { enabled: false } } }), /Jira pendiente/)
  assert.match(jiraAliasStatus({ mcp: { servers: { jira: { disabled: true } } } }), /Jira pendiente/)
  assert.throws(() => jiraAliasStatus({ mcp: { otro: { url: "https://mcp.atlassian.com/v2/mcp" } } }), /sin permisos/)
  assert.throws(() => jiraAliasStatus({ mcp: { otro: { command: ["npx", "mcp-remote", "https://mcp.atlassian.com/v1/sse"] } } }), /sin permisos/)
  assert.match(jiraAliasStatus({ mcp: { ado: { command: ["npx", "@azure-devops/mcp"] } } }), /Jira pendiente/)
})

test("actualización APM retira identidades antiguas, migra antes del plugin y conserva históricos y colisiones", {
  skip: apmVersion.status !== 0 || version.status !== 0 ? "Requiere las CLI apm y opencode en PATH" : false,
  timeout: 240_000,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "n-"))
  const project = join(root, "p"), host = join(root, "c")
  const env = isolated(root)
  const renamed: Record<string, string> = { coordinador: "investigador", codigo: "lector-codigo",
    documentacion: "lector-documentacion", planificador: "planificador", refinamiento: "refinador",
    arquitecto: "arquitecto", "arquitecto-test": "arquitecto-test", revisor: "revisor" }
  function run(command: string, args: string[], cwd = host) {
    const result = cli(command, args, cwd, env)
    assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout)
    return result.stdout
  }
  try {
    await mkdir(project)
    await mkdir(host)
    for (const path of [".apm", "apm.yml", "scripts", "tools", "plugin", "package.json", "flujo-arquitectura.md", "agent-settings.example.json"])
      await cp(join(source, path), join(project, path), { recursive: true })
    for (const [old, current] of Object.entries(renamed)) {
      const path = join(project, ".apm", "agents", `${current}.agent.md`)
      await cp(path, join(project, ".apm", "agents", `agente-${old}.agent.md`))
      await rm(path)
    }
    run("apm", ["install", project, "--target", "opencode"])
    const configDir = join(host, ".opencode"), agentsDir = join(configDir, "agents")
    assert.deepEqual((await readdir(agentsDir)).sort(), Object.keys(renamed).map(name => `agente-${name}.md`).sort())
    const customizedHost = join(root, "u")
    await mkdir(customizedHost)
    run("apm", ["install", project, "--target", "opencode"], customizedHost)
    const customizedOld = join(customizedHost, ".opencode", "agents", "agente-codigo.md")
    const customizedText = await readFile(customizedOld, "utf8") + "\nInstrucción personalizada del consumidor.\n"
    await writeFile(customizedOld, customizedText)
    const settings = JSON.parse(await readFile(join(source, "agent-settings.example.json"), "utf8"))
    for (const [old, current] of Object.entries(renamed)) {
      if (old === current) continue
      settings.agentes[old] = settings.agentes[current]
      delete settings.agentes[current]
    }
    settings.agentes.coordinador.especialistasPermitidos = ["documentacion"]
    settings.agentes.coordinador.maxRepreguntasEspecialistas = 0
    settings.agentes.codigo.guardarEntregablesEnSesion = false
    settings.proyecto.claveProyectoJira = "ANTERIOR"
    settings.proyecto.referencia = "release"
    settings.sesiones.carpetaRaiz = "historial/sesiones"
    const settingsPath = join(configDir, "agent-settings.json")
    await writeFile(settingsPath, JSON.stringify(settings))
    await mkdir(join(configDir, "tools"))
    const legacyTool = (await readFile(join(source, "tools", "investigator_defaults.ts"), "utf8"))
      .replaceAll('context.agent !== "investigador"', 'context.agent !== "agente-coordinador"')
      .replaceAll("Solo investigador", "Solo agente-coordinador").replaceAll("agentes.investigador", "agentes.coordinador")
    await writeFile(join(configDir, "tools", "coordinator_defaults.ts"), legacyTool)
    const historicalDir = join(host, "historial", "sesiones", "01-coordinador", ".control")
    await mkdir(historicalDir, { recursive: true })
    const historical = join(historicalDir, "state.json")
    const history = '{"agent":"coordinador","decisions":["confirmada"],"intentosConsumidos":2}'
    await writeFile(historical, history)
    for (const old of Object.keys(renamed)) await rm(join(project, ".apm", "agents", `agente-${old}.agent.md`))
    await cp(join(source, ".apm", "agents"), join(project, ".apm", "agents"), { recursive: true })
    run("apm", ["install", project, "--target", "opencode"])
    run("apm", ["update", "--yes", "--target", "opencode"])
    assert.deepEqual((await readdir(agentsDir)).sort(), Object.values(renamed).map(name => `${name}.md`).sort())
    const retirement = run("apm", ["install", project, "--target", "opencode"], customizedHost)
    assert.equal(await readFile(customizedOld, "utf8"), customizedText)
    assert.match(retirement, /modif|preserv|custom|skip/i)
    const setupRelative = (await readdir(join(host, "apm_modules"), { recursive: true }))
      .find(name => name.replaceAll("\\", "/").endsWith("/scripts/setup-opencode.mjs"))!
    assert.ok(setupRelative)
    const setup = join(host, "apm_modules", setupRelative)
    assert.match(run("node", [setup]), /Ajustes migrados/)
    const saved = await readFile(settingsPath, "utf8"), migrated = JSON.parse(saved)
    assert.deepEqual(migrated.proyecto, settings.proyecto)
    assert.deepEqual(migrated.sesiones, settings.sesiones)
    assert.equal(migrated.agentes.investigador.maxRepreguntasEspecialistas, 0)
    assert.deepEqual(migrated.agentes.investigador.especialistasPermitidos, ["lector-documentacion"])
    assert.equal(migrated.agentes["lector-codigo"].guardarEntregablesEnSesion, false)
    assert.ok(!(await readdir(join(configDir, "tools"))).includes("coordinator_defaults.ts"))
    await withServer(host, { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [probePlugin] }) }, connected => {
      const { decisions } = probe(host, connected, { agent: "investigador", checks:
        ["lector-codigo", "lector-documentacion", "revisor", "general"].map(resource => ({ action: "subagent", resource })) })
      assert.deepEqual(decisions, { "subagent:lector-codigo": "deny", "subagent:lector-documentacion": "allow",
        "subagent:revisor": "allow", "subagent:general": "deny" })
    }, ["planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
    const sessionProbe = join(host, "session-probe.mjs")
    await writeFile(sessionProbe, `import assert from "node:assert/strict";
      import plugin from "./.opencode/plugins/agent-session.ts";
      const agents = {s:"investigador", docs:"lector-documentacion", code:"lector-codigo"};
      let before;
      await plugin.setup({agent:{transform:async()=>{}},permission:{hook:async()=>{}},
        session:{get:async({sessionID})=>({id:sessionID,agent:agents[sessionID],location:{directory:"project"},time:{created:1}}),hook:async()=>{}},
        tool:{transform:async()=>{},hook:async(_,fn)=>{before=fn;}}});
      const call = input => before({tool:"subagent",sessionID:"s",agent:"investigador",input});
      await assert.rejects(call({agent:"lector-codigo"}),/deshabilitado/);
      await call({agent:"lector-documentacion"});
      await call({agent:"revisor"});
      await call({agent:"lector-codigo",sessionID:"docs"});
      await assert.rejects(call({agent:"lector-documentacion",sessionID:"code"}),/deshabilitado/);
      console.log("Identidad real conservada al reanudar");`)
    assert.match(run("node", [sessionProbe]), /Identidad real conservada/)
    run("node", [setup])
    assert.equal(await readFile(settingsPath, "utf8"), saved)
    assert.equal(await readFile(historical, "utf8"), history)
    // APM owns agent deployment: a custom short name must survive a collision.
    const collisionHost = join(root, "x")
    await mkdir(join(collisionHost, ".opencode", "agents"), { recursive: true })
    const custom = join(collisionHost, ".opencode", "agents", "investigador.md")
    await writeFile(custom, "---\ndescription: Personalizado\nmode: all\n---\nMi investigador\n")
    const previous = await readFile(custom, "utf8")
    const collision = cli("apm", ["install", project, "--target", "opencode"], collisionHost, env)
    assert.equal(await readFile(custom, "utf8"), previous)
    assert.match(collision.stdout + collision.stderr, /collision|colisi|conflict|skip|custom|local/i)
    t.diagnostic(`APM colisión: ${collision.status}; se conserva investigador.md personalizado`)
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})

test("contrato documental: consulta puntual anterior al arranque y refinamiento completo conservado", async () => {
  const jira = await readFile(join(source, ".apm", "skills", "consulta-jira", "SKILL.md"), "utf8")
  const punctual = jira.split("## Dato puntual de una historia conocida")[1]?.split(/\n## /)[0]
  assert.match(punctual, /fields: \["summary"\]/)
  assert.match(punctual, /únicamente el valor literal de `summary`/)
  assert.match(punctual, /Cierra al devolver el dato/)
  assert.match(punctual, /no requiere.*configuración/)
  assert.match(jira, /getAccessibleAtlassianResources/)
  assert.match(jira, /indispensable/)
  for (const required of ["## Búsqueda y selección", "## Recuperación completa de originales", "## Investigación o cotejo",
    "todos los comentarios paginados", "adjuntos y vínculos", "nextPageToken", "isLast", "ARI"])
    assert.ok(jira.includes(required), required)
  for (const name of ["planificador", "investigador", "arquitecto", "lector-documentacion"]) {
    const text = await readFile(join(source, ".apm", "agents", `${name}.agent.md`), "utf8")
    const branch = text.split("## Consulta puntual de solo lectura")[1]?.split(/\n## /)[0]
    assert.ok(branch, name)
    assert.match(branch, /carga `consulta-jira`/, name)
    assert.match(branch, /Dato puntual de una historia conocida/, name)
    assert.match(branch, /Cierra con ese dato/, name)
    assert.ok(text.indexOf("## Consulta puntual") < text.indexOf("## " + (name === "planificador" ? "Encargo de refinamiento" : name === "arquitecto" ? "Encargo de planificación" : "Investigación completa")))
    assert.ok(!branch.includes("planning_settings()") && !branch.includes("agent_settings("), name)
  }
  const planner = await readFile(join(source, ".apm", "agents", "planificador.agent.md"), "utf8")
  const workflow = planner.split("## Encargo de refinamiento")[1]
  for (const required of ["user-stories", "planning_settings()", "write_planning_originals(historias)",
    "refinador", "write_planning_deliverables", "revisor", "nueva entrega completa"])
    assert.ok(workflow.includes(required), required)
  await checkPointers(join(source, ".apm", "skills"))
  for (const [agent, allowed] of Object.entries(skillAccess)) {
    const body = await readFile(join(source, ".apm", "agents", `${agent}.agent.md`), "utf8")
    const skills = body.split(/  skill:\r?\n/)[1]?.split(/\r?\n(?=  \S|---)/)[0]
    assert.ok(skills, agent)
    assert.deepEqual([...skills.matchAll(/^    ([\w-]+): allow\r?$/gm)].map(match => match[1]).sort(), [...allowed].sort(), agent)
    assert.ok(body.includes("`operativa-comun`"), agent)
  }
  const skill = (name: string) => readFile(join(source, ".apm", "skills", name, "SKILL.md"), "utf8")
  const reading = await skill("lectura-documental")
  for (const required of ["Salida estándar", "Conversión temporal", "lectura parcial", "Elimina solo los temporales propios", "nunca el temporal"])
    assert.ok(reading.includes(required), required)
  const meeting = await skill("meeting-coach")
  assert.match(meeting, /invocación manual/)
  assert.match(meeting, /\]\(references\/fuentes-privacidad\.md\)/)
  const privacy = await readFile(join(source, ".apm", "skills", "meeting-coach", "references", "fuentes-privacidad.md"), "utf8")
  assert.match(privacy, /aprobación explícita/)
  assert.match(privacy, /consentimiento explícito/)
  assert.match(privacy, /\]\(\.\.\/\.\.\/lectura-documental\/SKILL\.md\)/)
  const publication = await readFile(join(source, ".apm", "skills", "operativa-comun", "references", "publicacion-revision.md"), "utf8")
  for (const required of ["guardado:true", "devuelve siempre el contenido", "versión exacta", "aunque falle", "antes de solicitarla no consume", "Sin historial verificable"])
    assert.ok(publication.includes(required), required)
})

test("contrato documental: interfaz directa, catálogo parcial y estados de publicación diferenciados", async () => {
  const rules = await readFile(join(source, ".apm", "skills", "operativa-comun", "references", "configuracion.md"), "utf8")
  for (const state of ["Declarada, no invocada", "Inventario parcial", "Denegada", "Error de invocación o ejecución",
    "Guardado desactivado", "Publicada", "guardado:false", "guardado:true"])
    assert.ok(rules.includes(state), state)
  assert.match(rules, /se invocan directamente/)
  assert.match(rules, /no requiere escrituras de prueba/)
  assert.match(rules, /Si una operación no se ha invocado/)
  const publication = await readFile(join(source, ".apm", "skills", "operativa-comun", "references", "publicacion-revision.md"), "utf8")
  assert.ok(publication.includes("configuracion.md#herramientas-y-autorizaciones"))
  await checkPointers(join(source, ".apm", "skills"))
})

test("contrato documental: corpus vigente, fuerza de evidencia y expansión por pregunta en sus propietarios", async () => {
  // These are documentary regressions, not evidence that a model follows the rules.
  const cases = JSON.parse(await readFile(join(source, "test-support", "operation-cases.json"), "utf8"))
  assert.deepEqual(Object.fromEntries(Object.entries(cases).map(([group, cases]: [string, any]) => [group, cases.length])),
    { corpus: 4, evidencia: 4, preguntas: 2 })
  const scenarios = Object.values(cases).flat() as { id: string; entrada: string; esperado: string }[]
  assert.equal(new Set(scenarios.map(c => c.id)).size, scenarios.length)
  for (const scenario of scenarios) assert.ok(scenario.entrada.trim() && scenario.esperado.trim(), scenario.id)
  const code = await readFile(join(source, ".apm", "skills", "consulta-codegraph", "SKILL.md"), "utf8")
  for (const rule of [/workdir/, /Cero pendientes.*avisos relevantes/, /antigüedad por sí sola/, /corpus es anterior/,
    /NO DETERMINADO/, /un cambio relevante exige renovar/, /git branch --show-current/, /git rev-parse HEAD/])
    assert.match(code, rule)
  const report = await readFile(join(source, ".apm", "skills", "consulta-codegraph", "references", "informe.md"), "utf8")
  for (const field of ["Commit y relación", "avisos relevantes", "reutilizada o renovada", "siguiente fuente"])
    assert.ok(report.includes(field), field)
  const evidence = await readFile(join(source, ".apm", "skills", "operativa-comun", "references", "fuentes-evidencias.md"), "utf8")
  for (const field of ["Requisito documental", "Inferencia de código", "Comprobación escrita en un test", "Resultado de ejecución",
    "Comportamiento observado", "RowVersion", "mínimo y máximo", "fuentes comunes", "condición de parada", "responsable humano"])
    assert.ok(evidence.includes(field), field)
  assert.match(evidence, /comentario general no revoca una excepción/)
  assert.match(evidence, /en los apartados existentes/)
  assert.match(evidence, /enlaces remotos de todas las historias por defecto/)
  assert.match(evidence, /Sin presupuesto numérico/)
  for (const name of ["consulta-codegraph", "consulta-jira"]) {
    const text = await readFile(join(source, ".apm", "skills", name, "SKILL.md"), "utf8")
    assert.ok(text.includes("fuentes-evidencias.md#investigación-por-pregunta"), name)
  }
})

test("OpenCode autoriza efectivamente las lecturas y deniega escrituras para ambos alias", {
  skip: version.status !== 0 ? "Requiere la CLI opencode en PATH" : false,
  timeout: 240_000,
}, async (t) => {
  t.diagnostic(`Motor real: OpenCode ${version.stdout.trim()}; herramientas sintéticas, sin llamadas Jira ni LLM`)
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "jira-permissions-"))
  const configDir = join(root, ".opencode")
  const env = { ...isolated(root), OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [probePlugin] }) }
  try {
    await mkdir(join(configDir, "agents"), { recursive: true })
    await mkdir(join(configDir, "tools"), { recursive: true })
    for (const name of [...jiraAgents, "lector-codigo", "arquitecto-test"])
      await cp(join(source, ".apm", "agents", `${name}.agent.md`), join(configDir, "agents", `${name}.md`))
    const skillsDir = join(root, ".agents", "skills")
    await cp(join(source, ".apm", "skills"), skillsDir, { recursive: true })
    const absolutePaths = references.map(ref => join(skillsDir, "operativa-comun", "references", ref))
    // ReadTool asks with a path relative to the worktree; direct context.ask
    // probes with only absolute paths miss denials in real model sessions.
    const paths = [...absolutePaths, ...absolutePaths.map(path => relative(root, path))]
    const forbiddenAbsolutePaths = [join(root, "src", "private.ts"), join(configDir, "agent-settings.json"),
      join(skillsDir, "user-stories", "references", "principles.md"),
      join(skillsDir, "operativa-comun", "references", "extra.md"),
      join(root, "other", "operativa-comun", "references", "fuentes-evidencias.md")]
    const forbiddenPaths = [...forbiddenAbsolutePaths, ...forbiddenAbsolutePaths.map(path => relative(root, path))]
    const checks = [...names.map(action => ({ action, resource: "*" })),
      ...researchTargets.map(resource => ({ action: "subagent", resource })),
      ...[...sharedSkills, "plantillas-entregables", "user-stories", "domain-glossary", "meeting-coach", "unknown-skill"]
        .map(resource => ({ action: "skill", resource })),
      ...[...paths, ...forbiddenPaths].map(resource => ({ action: "read", resource })),
      { action: "execute", resource: "*" }]
    await withServer(root, env, async connected => {
    for (const agent of [...jiraAgents, "lector-codigo", "arquitecto-test"]) {
      const { decisions } = probe(root, connected, { agent, checks })
      assert.equal(decisions["execute:*"], jiraAgents.includes(agent) ? "allow" : "deny", agent)
      for (const alias of ["jira", "atlassian"]) {
        for (const name of [...reads, ...writes, "atlassianUserInfo"]) {
          const expected = jiraAgents.includes(agent) && (reads.includes(name) || name === "atlassianUserInfo" && agent !== "revisor")
          assert.equal(decisions[`${alias}_${name}:*`], expected ? "allow" : "deny", `${agent}: ${alias}_${name}`)
        }
      }
      if (researchChain[agent]) {
        for (const target of researchTargets)
          assert.equal(decisions[`subagent:${target}`], researchChain[agent][target] ?? "deny", `${agent}: subagent ${target}`)
      }
      for (const { action, resource } of checks.filter(check => check.action === "skill"))
        assert.equal(decisions[`${action}:${resource}`], skillAccess[agent].includes(resource) ? "allow" : "deny", `${agent}: skill ${resource}`)
      for (const path of [...paths, ...forbiddenPaths])
        assert.equal(decisions[`read:${path}`], agent !== "investigador" || paths.includes(path) ? "allow" : "deny", `${agent}: read ${path}`)
    }
    })
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})

test("distribución APM e instalación idempotente conservan permisos y ajustes del consumidor", {
  skip: apmVersion.status !== 0 || version.status !== 0 ? "Requiere las CLI apm y opencode en PATH" : false,
  timeout: 240_000,
}, async (t) => {
  t.diagnostic(apmVersion.stdout.trim())
  const parent = tmpdir()
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "i-"))
  const project = join(root, "p")
  const host = join(root, "c")
  const env = { ...isolated(root), XDG_CONFIG_HOME: join(root, "config"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}" }
  function run(command: string, args: string[], cwd: string) {
    const result = cli(command, args, cwd, env)
    assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout)
    return result.stdout
  }
  try {
    await mkdir(project)
    await mkdir(host)
    for (const path of [".apm", "apm.yml", "scripts", "tools", "plugin", "package.json", "flujo-arquitectura.md", "agent-settings.example.json"])
      await cp(join(source, path), join(project, path), { recursive: true })
    // Local snapshots have no upstream Git ref: re-install the corrected snapshot,
    // then verify that the normal update command does not restore stale rules.
    for (const agent of jiraAgents) {
      const path = join(project, ".apm", "agents", `${agent}.agent.md`)
      const text = await readFile(path, "utf8")
      await writeFile(path, text.replace(/^  (?:"jira_[^"]*"|jira_\w+|atlassian_fetch):[^\r\n]*\r?\n/gm, ""))
    }
    run("apm", ["install", project, "--target", "opencode"], host)
    const installedDir = join(host, ".opencode", "agents")
    await checkPointers(join(host, ".agents", "skills"))
    const installed = await readdir(installedDir)
    async function checkAgents() {
      for (const agent of jiraAgents) {
        const filename = installed.find((name) => name === `${agent}.md`)
        assert.ok(filename, `${agent}: ${installed.join(", ")}`)
        const original = await readFile(join(source, ".apm", "agents", `${agent}.agent.md`), "utf8")
        const deployed = await readFile(join(installedDir, filename), "utf8")
        const rules = (text: string) => text.split(/\r?\n/).filter((line) => /^  (?:"?(?:jira_|atlassian_))/.test(line))
        assert.deepEqual(rules(deployed), rules(original), `${agent}: reglas y orden de resolución`)
        assert.ok(deployed.replaceAll("\r\n", "\n").includes(original.split("---")[2].trim().replaceAll("\r\n", "\n")), `${agent}: instrucciones`)
      }
    }
    const previousPlanner = await readFile(join(installedDir, "planificador.md"), "utf8")
    assert.ok(!previousPlanner.includes('"jira_get*": allow'))
    const modules = join(host, "apm_modules")
    const setupFile = (await readdir(modules, { recursive: true }))
      .find((name) => name.replaceAll("\\", "/").endsWith("/scripts/setup-opencode.mjs"))
    assert.ok(setupFile, "APM debe distribuir también el instalador y su helper de alias")
    const setup = join(modules, setupFile)
    assert.match(run("node", [setup], host), /Jira pendiente/)
    assert.deepEqual((await readdir(join(host, ".opencode", "plugins"))).sort(), ["agent-session.ts", "markitdown-utf8.ts"])
    assert.ok(!(await readdir(join(host, ".opencode"))).includes("plugin"), "No se debe recrear el directorio V1")
    const contract = await readFile(join(host, ".opencode", "flujo-arquitectura.md"), "utf8")
    assert.ok(!contract.includes("](.apm/skills/"), "El contrato instalado debe enlazar las skills del consumidor")
    for (const [, target] of contract.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))
      assert.ok((await readFile(resolve(host, ".opencode", target), "utf8")).length, `Contrato instalado -> ${target}`)
    const { loadedSkills, agents } = await withServer(host, env, connected => ({
      loadedSkills: api("get", "/api/skill", host, connected).data,
      agents: api("get", "/api/agent", host, connected).data,
    }), ["ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
    for (const name of [...sharedSkills, "plantillas-entregables", "domain-glossary", "meeting-coach", "user-stories"])
      assert.equal(loadedSkills.find(skill => skill.id === name)?.path, join(host, ".agents", "skills", name, "SKILL.md"))
    const effective = api("get", "/api/config", host, env)
    const installedConfig = effective.find(entry => entry.path === join(host, ".opencode", "opencode.json")).info
    assert.ok(installedConfig.skills.includes(join(host, ".agents", "skills")))
    assert.ok(installedConfig.experimental.subagent_depth >= 4, "La cadena anidada conserva profundidad para el lector")
    assert.equal(agents.find(agent => agent.id === "investigador").mode, "all")
    assert.equal(agents.find(agent => agent.id === "refinador").mode, "subagent")
    assert.deepEqual(agents.find(agent => agent.id === "investigador").permissions.filter(rule => rule.action === "read").slice(-7),
      [{ action: "read", resource: "*", effect: "deny" }, ...references.flatMap(ref => [
        { action: "read", resource: `.agents/skills/operativa-comun/references/${ref}`, effect: "allow" },
      ]), ...references.map(ref => ({ action: "read", resource: `*/.agents/skills/operativa-comun/references/${ref}`, effect: "allow" }))],
      "Solo las tres referencias operativas, tanto relativas como con prefijo")
    for (const [agent, permissions] of Object.entries(researchChain))
      assert.deepEqual(Object.fromEntries(agents.find(item => item.id === agent).permissions
        .filter(rule => rule.action === "subagent").map(rule => [rule.resource, rule.effect])), permissions, `${agent}: cadena instalada sin atajos`)
    const configPath = join(host, ".opencode", "opencode.json")
    const config = JSON.parse(await readFile(configPath, "utf8"))
    const customSkills = join(host, "custom-skills")
    await mkdir(customSkills)
    config.skills.push(customSkills)
    config.plugins = [probePlugin]
    await writeFile(configPath, JSON.stringify(config))
    await withServer(host, env, async toolEnv => {
    const planning = probe(host, toolEnv, { agent: "planificador", tool: "planning_settings", args: {} })
    assert.ok(JSON.stringify(planning.result).includes("PROYECTO_JIRA"), "Herramientas de archivo V1 compatibles en V2")
    for (const tool of ["agent_settings", "investigator_defaults", "architecture_settings", "refinement_settings",
      "publish_agent_deliverable", "write_planning_originals", "write_planning_deliverables", "write_report_pair", "write_review_documents"])
      assert.ok(planning.tools.includes(tool), `Herramienta instalada: ${tool}`)
    for (const name of ["consulta-jira", "operativa-comun"]) {
      const result = probe(host, toolEnv, { agent: "investigador", tool: "skill", args: { id: name } })
      assert.ok(JSON.stringify(result.result).includes(`# ${name === "consulta-jira" ? "Consulta Jira" : "Operativa común"}`))
    }
    for (const ref of references) {
      const result = probe(host, toolEnv, { agent: "investigador", tool: "read",
        args: { path: join(host, ".agents", "skills", "operativa-comun", "references", ref) } })
      const title = (await readFile(join(host, ".agents", "skills", "operativa-comun", "references", ref), "utf8")).split(/\r?\n/)[0]
      assert.ok(JSON.stringify(result.result).includes(title), ref)
    }
    })
    const settingsPath = join(host, ".opencode", "agent-settings.json")
    const settings = JSON.parse(await readFile(settingsPath, "utf8"))
    settings.proyecto.claveProyectoJira = "CONSUMIDOR"
    await writeFile(settingsPath, JSON.stringify(settings))
    const saved = await readFile(settingsPath, "utf8")
    for (const agent of jiraAgents)
      await cp(join(source, ".apm", "agents", `${agent}.agent.md`), join(project, ".apm", "agents", `${agent}.agent.md`))
    run("apm", ["install", project, "--target", "opencode"], host)
    run("apm", ["update", "--yes", "--target", "opencode"], host)
    await mkdir(env.OPENCODE_CONFIG_DIR, { recursive: true })
    await writeFile(join(env.OPENCODE_CONFIG_DIR, "opencode.jsonc"), `{
      // Synthetic local endpoint: checks global JSONC alias resolution, without authenticating against Jira.
      "mcp": { "jira": { "type": "remote", "url": "http://127.0.0.1:1/mcp", "enabled": true } }
    }`)
    const jsoncPath = join(host, ".opencode", "opencode.jsonc")
    config.subagent_depth = 9
    config.experimental.subagent_depth = 6
    config.skills = { paths: config.skills }
    config.watcher = { ignore: ["private/**"] }
    await writeFile(jsoncPath, "// Configuración del consumidor: conservar comentario\n" + JSON.stringify(config, null, 2))
    const updated = run("node", [setup], host)
    assert.match(updated, /configurados: jira/)
    assert.match(updated, /Cierra y reinicia OpenCode/)
    await checkAgents()
    await checkPointers(join(host, ".agents", "skills"))
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).skills,
      [join(host, ".agents", "skills"), customSkills])
    const migratedText = await readFile(jsoncPath, "utf8"), migratedConfig = parse(migratedText)
    assert.match(migratedText, /conservar comentario/)
    assert.deepEqual(migratedConfig.skills, [join(host, ".agents", "skills"), customSkills])
    assert.equal(migratedConfig.experimental.subagent_depth, 6, "El valor nativo V2 tiene precedencia y se conserva")
    assert.ok(!Object.hasOwn(migratedConfig, "subagent_depth"))
    assert.deepEqual(migratedConfig.watcher, { ignore: ["private/**"] })
    assert.equal(await readFile(settingsPath, "utf8"), saved)
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) }
})
