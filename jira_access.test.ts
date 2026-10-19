import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { jiraAliasStatus } from "./scripts/jira-aliases.mjs"

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
const reads = ["getAccessibleAtlassianResources", "getJiraIssue", "getJiraProjectIssueTypesMetadata",
  "listJiraIssueComments", "listJiraIssueTransitions", "listJiraIssueWorklogs", "lookupJiraAccountId",
  "search", "searchJiraIssuesUsingJql", "fetch", "discover", "executeRead"]
const writes = ["createJiraIssue", "editJiraIssue", "addCommentToJiraIssue", "addOrEditJiraIssueComment",
  "transitionJiraIssue", "addWorklogToJiraIssue", "addOrEditJiraIssueWorklog", "deleteJiraIssue",
  "executeWrite", "executeDestructive", "unknownOperation"]
const names = ["jira", "atlassian"].flatMap((alias) =>
  [...reads, ...writes, "atlassianUserInfo"].map((name) => `${alias}_${name}`))

function cli(command: string, args: string[], cwd = source, env = process.env) {
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
  for (const name of [...sharedSkills, "domain-glossary", "meeting-coach"]) {
    const entry = join(skillsDir, name, "SKILL.md")
    const text = await readFile(entry, "utf8")
    assert.match(text, new RegExp(`^---\\r?\\nname: ${name}\\r?\\ndescription: .+`, "m"))
    assert.ok(!text.includes("disable-model-invocation:"))
    const files = [entry, ...(name === "operativa-comun" ? references.map(ref => join(skillsDir, name, "references", ref)) : [])]
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
    const effective = JSON.parse(run("opencode", ["debug", "config"]))
    assert.deepEqual(effective.agent.investigador.permission.task,
      { "*": "deny", "lector-codigo": "deny", "lector-documentacion": "allow", revisor: "allow" })
    const probe = join(host, "session-probe.mjs")
    await writeFile(probe, `import assert from "node:assert/strict";
      import plugin from "./.opencode/plugin/agent-session.ts";
      const agents = {s:"investigador", docs:"lector-documentacion", code:"lector-codigo"};
      const client = {session:{get:async({path})=>({data:{id:path.id,directory:"project",time:{created:1}}}),
        messages:async({path})=>({data:[{info:{role:"assistant",mode:"build",agent:agents[path.id]}}]})}};
      const before = (await plugin({client,directory:"project"}))["tool.execute.before"];
      const call = args => before({tool:"task",sessionID:"s",callID:"probe"},{args});
      await assert.rejects(call({subagent_type:"lector-codigo"}),/deshabilitado/);
      await call({subagent_type:"lector-documentacion"});
      await call({subagent_type:"revisor"});
      await call({subagent_type:"lector-codigo",task_id:"docs"});
      await assert.rejects(call({subagent_type:"lector-documentacion",task_id:"code"}),/deshabilitado/);
      console.log("Identidad real conservada al reanudar");`)
    assert.match(run("node", [probe]), /Identidad real conservada/)
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
  } finally { await rm(root, { recursive: true, force: true }) }
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
  assert.match(meeting, /aprobacion explicita/)
  assert.match(meeting, /consentimiento explicito/)
  const publication = await readFile(join(source, ".apm", "skills", "operativa-comun", "references", "publicacion-revision.md"), "utf8")
  for (const required of ["guardado:true", "devuelve siempre el contenido", "versión exacta", "aunque falle", "antes de solicitarla no consume", "Sin historial verificable"])
    assert.ok(publication.includes(required), required)
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
  const env = { ...isolated(root), XDG_CONFIG_HOME: join(root, "config"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "fixture/read-only",
      provider: { fixture: { npm: "@ai-sdk/openai-compatible", models: { "read-only": { name: "Permission fixture" } },
        options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "fixture" } } } }) }
  try {
    await mkdir(join(configDir, "agents"), { recursive: true })
    await mkdir(join(configDir, "tools"), { recursive: true })
    for (const name of [...jiraAgents, "lector-codigo", "arquitecto-test"])
      await cp(join(source, ".apm", "agents", `${name}.agent.md`), join(configDir, "agents", `${name}.md`))
    const skillsDir = join(root, ".agents", "skills")
    await cp(join(source, ".apm", "skills"), skillsDir, { recursive: true })
    // These definitions never contact a server or perform a write. debug agent uses
    // OpenCode's Permission.disabled and its context.ask uses Permission.evaluate.
    const probe = `export default { description: "Read-only permission probe", args: {},
      async execute(_, context) {
        const result = {};
        for (const permission of ${JSON.stringify(names)}) {
          try { await context.ask({ permission, patterns: ["*"], always: [], metadata: {} }); result[permission] = "allow"; }
          catch { result[permission] = "deny"; }
        }
        return JSON.stringify(result);
      } };`
    for (const name of names)
      await writeFile(join(configDir, "tools", `${name}.ts`), "export default { description: 'No-op fixture', args: {}, async execute() { return 'fixture'; } }")
    await writeFile(join(configDir, "tools", "jira_getPermissionProbe.ts"), probe)
    const paths = references.map(ref => join(skillsDir, "operativa-comun", "references", ref))
    const forbiddenPaths = [join(root, "src", "private.ts"), join(configDir, "agent-settings.json"),
      join(skillsDir, "user-stories", "references", "principles.md"),
      join(skillsDir, "operativa-comun", "references", "extra.md"),
      join(root, "other", "operativa-comun", "references", "fuentes-evidencias.md")]
    const sharedProbe = `export default {
      description: "Local permission probe, no publication", args: {}, async execute(_, context) {
        const result = { skill: {}, read: {} };
        for (const name of ${JSON.stringify([...sharedSkills, "plantillas-entregables", "user-stories", "domain-glossary", "meeting-coach", "unknown-skill"])}) {
          try { await context.ask({permission:"skill",patterns:[name],always:[],metadata:{}}); result.skill[name] = "allow"; }
          catch { result.skill[name] = "deny"; }
        }
        for (const path of ${JSON.stringify([...paths, ...forbiddenPaths])}) {
          try { await context.ask({permission:"read",patterns:[path],always:[],metadata:{}}); result.read[path] = "allow"; }
          catch { result.read[path] = "deny"; }
        }
        return JSON.stringify(result);
      } };`
    for (const name of ["publish_agent_deliverable", "write_planning_originals", "write_review_documents"])
      await writeFile(join(configDir, "tools", `${name}.ts`), sharedProbe)
    for (const agent of [...jiraAgents, "lector-codigo", "arquitecto-test"]) {
      const loaded = cli("opencode", ["debug", "agent", agent], root, env)
      assert.equal(loaded.status, 0, loaded.stderr || loaded.stdout)
      const { tools } = JSON.parse(loaded.stdout)
      for (const alias of ["jira", "atlassian"]) {
        for (const name of [...reads, ...writes, "atlassianUserInfo"]) {
          const expected = jiraAgents.includes(agent) && (reads.includes(name) || name === "atlassianUserInfo" && agent !== "revisor")
          assert.equal(tools[`${alias}_${name}`], expected, `${agent}: ${alias}_${name}`)
        }
      }
      {
        const tool = agent === "planificador" ? "write_planning_originals" : agent === "revisor" ? "write_review_documents" : "publish_agent_deliverable"
        const checked = cli("opencode", ["debug", "agent", agent, "--tool", tool], root, env)
        assert.equal(checked.status, 0, checked.stderr || checked.stdout)
        const decisions = JSON.parse(JSON.parse(checked.stdout).result.output)
        for (const [name, decision] of Object.entries(decisions.skill))
          assert.equal(decision, skillAccess[agent].includes(name) ? "allow" : "deny", `${agent}: skill ${name}`)
        for (const [path, decision] of Object.entries(decisions.read))
          assert.equal(decision, agent !== "investigador" || paths.includes(path) ? "allow" : "deny", `${agent}: read ${path}`)
      }
      if (!jiraAgents.includes(agent)) continue
      const checked = cli("opencode", ["debug", "agent", agent, "--tool", "jira_getPermissionProbe"], root, env)
      assert.equal(checked.status, 0, checked.stderr || checked.stdout)
      const decisions = JSON.parse(JSON.parse(checked.stdout).result.output)
      for (const name of names) assert.equal(decisions[name], tools[name] ? "allow" : "deny", `${agent}: ask ${name}`)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
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
    const contract = await readFile(join(host, ".opencode", "flujo-arquitectura.md"), "utf8")
    assert.ok(!contract.includes("](.apm/skills/"), "El contrato instalado debe enlazar las skills del consumidor")
    for (const [, target] of contract.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))
      assert.ok((await readFile(resolve(host, ".opencode", target), "utf8")).length, `Contrato instalado -> ${target}`)
    const loadedSkills = JSON.parse(run("opencode", ["debug", "skill"], host))
    for (const name of [...sharedSkills, "plantillas-entregables", "domain-glossary", "meeting-coach", "user-stories"])
      assert.equal(loadedSkills.find(skill => skill.name === name)?.location, join(host, ".agents", "skills", name, "SKILL.md"))
    const effective = JSON.parse(run("opencode", ["debug", "config"], host))
    assert.ok(effective.skills.paths.includes(join(host, ".agents", "skills")))
    const configPath = join(host, ".opencode", "opencode.json")
    const config = JSON.parse(await readFile(configPath, "utf8"))
    const customSkills = join(host, "custom-skills")
    await mkdir(customSkills)
    config.skills.paths.push(customSkills)
    await writeFile(configPath, JSON.stringify(config))
    const toolEnv = { ...env, OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "fixture/read-only",
      provider: { fixture: { npm: "@ai-sdk/openai-compatible", models: { "read-only": { name: "Permission fixture" } },
        options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "fixture" } } } }) }
    for (const name of ["consulta-jira", "operativa-comun"]) {
      const result = cli("opencode", ["debug", "agent", "investigador", "--tool", "skill", "--params", JSON.stringify({ name })], host, toolEnv)
      assert.equal(result.status, 0, result.stderr || result.stdout)
      assert.ok(JSON.parse(result.stdout).result.output.includes(`# ${name === "consulta-jira" ? "Consulta Jira" : "Operativa común"}`))
    }
    for (const ref of references) {
      const result = cli("opencode", ["debug", "agent", "investigador", "--tool", "read", "--params",
        JSON.stringify({ filePath: join(host, ".agents", "skills", "operativa-comun", "references", ref) })], host, toolEnv)
      assert.equal(result.status, 0, result.stderr || result.stdout)
      assert.ok(JSON.parse(result.stdout).result.output.includes("</"), ref)
    }
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
    const updated = run("node", [setup], host)
    assert.match(updated, /configurados: jira/)
    assert.match(updated, /Cierra y reinicia OpenCode/)
    await checkAgents()
    await checkPointers(join(host, ".agents", "skills"))
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).skills.paths,
      [join(host, ".agents", "skills"), customSkills])
    assert.equal(await readFile(settingsPath, "utf8"), saved)
  } finally { await rm(root, { recursive: true, force: true }) }
})
