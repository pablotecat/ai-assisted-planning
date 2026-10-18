import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { jiraAliasStatus } from "./scripts/jira-aliases.mjs"

const source = fileURLToPath(new URL(".", import.meta.url))
const jiraAgents = ["planificador", "coordinador", "arquitecto", "refinamiento", "documentacion", "revisor"]
const reads = ["getAccessibleAtlassianResources", "getJiraIssue", "getJiraProjectIssueTypesMetadata",
  "listJiraIssueComments", "listJiraIssueTransitions", "listJiraIssueWorklogs", "lookupJiraAccountId",
  "search", "searchJiraIssuesUsingJql", "fetch", "discover", "executeRead"]
const writes = ["createJiraIssue", "editJiraIssue", "addCommentToJiraIssue", "addOrEditJiraIssueComment",
  "transitionJiraIssue", "addWorklogToJiraIssue", "addOrEditJiraIssueWorklog", "deleteJiraIssue",
  "executeWrite", "executeDestructive", "unknownOperation"]
const names = ["jira", "atlassian"].flatMap((alias) =>
  [...reads, ...writes, "atlassianUserInfo"].map((name) => `${alias}_${name}`))

function cli(command: string, args: string[], cwd?: string, env = process.env) {
  return spawnSync(process.platform === "win32" ? "cmd.exe" : command,
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args,
    { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
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

test("contrato documental: consulta puntual anterior al arranque y refinamiento completo conservado", async () => {
  for (const name of ["planificador", "coordinador", "arquitecto", "documentacion"]) {
    const text = await readFile(join(source, ".apm", "agents", `agente-${name}.agent.md`), "utf8")
    const branch = text.split("## Consulta puntual de solo lectura")[1]?.split(/\n## /)[0]
    assert.ok(branch, name)
    assert.match(branch, /fields: \["summary"\]/, name)
    assert.match(branch, /únicamente el valor literal de `summary`/, name)
    assert.match(branch, /getAccessibleAtlassianResources/, name)
    assert.match(branch, /imprescindible|indispensable/, name)
    assert.match(branch, /configuración/, name)
  }
  const planner = await readFile(join(source, ".apm", "agents", "agente-planificador.agent.md"), "utf8")
  const workflow = planner.split("## Encargo de refinamiento")[1]
  for (const required of ["user-stories", "planning_settings()", "write_planning_originals(historias)",
    "agente-refinamiento", "write_planning_deliverables", "agente-revisor", "nueva entrega completa"])
    assert.ok(workflow.includes(required), required)
})

const version = cli("opencode", ["--version"])
test("OpenCode autoriza efectivamente las lecturas y deniega escrituras para ambos alias", {
  skip: version.status !== 0 ? "Requiere la CLI opencode en PATH" : false,
  timeout: 240_000,
}, async (t) => {
  t.diagnostic(`Motor real: OpenCode ${version.stdout.trim()}; herramientas sintéticas, sin llamadas Jira ni LLM`)
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "jira-permissions-"))
  const configDir = join(root, ".opencode")
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "fixture/read-only",
      provider: { fixture: { npm: "@ai-sdk/openai-compatible", models: { "read-only": { name: "Permission fixture" } },
        options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "fixture" } } } }) }
  try {
    await mkdir(join(configDir, "agents"), { recursive: true })
    await mkdir(join(configDir, "tools"), { recursive: true })
    for (const name of [...jiraAgents, "codigo", "arquitecto-test"])
      await cp(join(source, ".apm", "agents", `agente-${name}.agent.md`), join(configDir, "agents", `agente-${name}.md`))
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
    for (const agent of [...jiraAgents, "codigo", "arquitecto-test"]) {
      const loaded = cli("opencode", ["debug", "agent", `agente-${agent}`], root, env)
      assert.equal(loaded.status, 0, loaded.stderr || loaded.stdout)
      const { tools } = JSON.parse(loaded.stdout)
      for (const alias of ["jira", "atlassian"]) {
        for (const name of [...reads, ...writes, "atlassianUserInfo"]) {
          const expected = jiraAgents.includes(agent) && (reads.includes(name) || name === "atlassianUserInfo" && agent !== "revisor")
          assert.equal(tools[`${alias}_${name}`], expected, `${agent}: ${alias}_${name}`)
        }
      }
      if (!jiraAgents.includes(agent)) continue
      const checked = cli("opencode", ["debug", "agent", `agente-${agent}`, "--tool", "jira_getPermissionProbe"], root, env)
      assert.equal(checked.status, 0, checked.stderr || checked.stdout)
      const decisions = JSON.parse(JSON.parse(checked.stdout).result.output)
      for (const name of names) assert.equal(decisions[name], tools[name] ? "allow" : "deny", `${agent}: ask ${name}`)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

const apmVersion = cli("apm", ["--version"])
test("distribución APM e instalación idempotente conservan permisos y ajustes del consumidor", {
  skip: apmVersion.status !== 0 || version.status !== 0 ? "Requiere las CLI apm y opencode en PATH" : false,
  timeout: 240_000,
}, async (t) => {
  t.diagnostic(apmVersion.stdout.trim())
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "jira-install-"))
  const project = join(root, "package")
  const host = join(root, "consumer")
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}" }
  function run(command: string, args: string[], cwd: string) {
    const result = cli(command, args, cwd, env)
    assert.equal(result.status, 0, result.stderr + result.stdout)
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
      const path = join(project, ".apm", "agents", `agente-${agent}.agent.md`)
      const text = await readFile(path, "utf8")
      await writeFile(path, text.replace(/^  (?:"jira_[^"]*"|jira_\w+|atlassian_fetch):[^\r\n]*\r?\n/gm, ""))
    }
    run("apm", ["install", project, "--target", "opencode"], host)
    const installedDir = join(host, ".opencode", "agents")
    const installed = await readdir(installedDir)
    async function checkAgents() {
      for (const agent of jiraAgents) {
        const filename = installed.find((name) => name.endsWith(`agente-${agent}.md`))
        assert.ok(filename, `${agent}: ${installed.join(", ")}`)
        const original = await readFile(join(source, ".apm", "agents", `agente-${agent}.agent.md`), "utf8")
        const deployed = await readFile(join(installedDir, filename), "utf8")
        const rules = (text: string) => text.split(/\r?\n/).filter((line) => /^  (?:"?(?:jira_|atlassian_))/.test(line))
        assert.deepEqual(rules(deployed), rules(original), `${agent}: reglas y orden de resolución`)
        assert.ok(deployed.includes(original.split("---")[2].trim()), `${agent}: instrucciones`)
      }
    }
    const previousPlanner = await readFile(join(installedDir, installed.find((name) => name.endsWith("agente-planificador.md"))!), "utf8")
    assert.ok(!previousPlanner.includes('"jira_get*": allow'))
    const modules = join(host, "apm_modules")
    const setupFile = (await readdir(modules, { recursive: true }))
      .find((name) => name.replaceAll("\\", "/").endsWith("/scripts/setup-opencode.mjs"))
    assert.ok(setupFile, "APM debe distribuir también el instalador y su helper de alias")
    const setup = join(modules, setupFile)
    assert.match(run("node", [setup], host), /Jira pendiente/)
    const settingsPath = join(host, ".opencode", "agent-settings.json")
    const settings = JSON.parse(await readFile(settingsPath, "utf8"))
    settings.proyecto.claveProyectoJira = "CONSUMIDOR"
    await writeFile(settingsPath, JSON.stringify(settings))
    const saved = await readFile(settingsPath, "utf8")
    for (const agent of jiraAgents)
      await cp(join(source, ".apm", "agents", `agente-${agent}.agent.md`), join(project, ".apm", "agents", `agente-${agent}.agent.md`))
    run("apm", ["install", project, "--target", "opencode"], host)
    run("apm", ["update", "--yes", "--target", "opencode"], host)
    await mkdir(env.OPENCODE_CONFIG_DIR, { recursive: true })
    await writeFile(join(env.OPENCODE_CONFIG_DIR, "opencode.jsonc"), `{
      // Global JSONC connection: setup must check the effective configuration.
      "mcp": { "jira": { "type": "remote", "url": "https://mcp.atlassian.com/v2/mcp", "enabled": true } }
    }`)
    const updated = run("node", [setup], host)
    assert.match(updated, /configurados: jira/)
    assert.match(updated, /Cierra y reinicia OpenCode/)
    await checkAgents()
    assert.equal(await readFile(settingsPath, "utf8"), saved)
  } finally { await rm(root, { recursive: true, force: true }) }
})
