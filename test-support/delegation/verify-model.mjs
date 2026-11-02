// Opt-in S07 only. One objective prompt; never prompts the model to parallelize or wait.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { api, withServer } from "../opencode.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"

assert.equal(process.env.OPENCODE_TEST_MODEL_CONSENT, "yes", "Explicit opt-in required")
const source = fileURLToPath(new URL("../..", import.meta.url))
const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s07-model-")), host = join(root, "consumer"), config = join(host, ".opencode")
const home = process.env.USERPROFILE, model = { providerID: "openai", id: "gpt-6.1-sol" }
const hash = value => createHash("sha256").update(value).digest("hex")
function credential() {
  const status = opencode(["service", "status"], source)
  assert.ok(status.status === 0 && /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(status.stdout), "Shared service must already be active; read-only access only")
  const result = opencode(["api", "get", "/api/credential"], source)
  assert.equal(result.status, 0, "Active V2 credential lookup failed")
  const value = JSON.parse(result.stdout).data.find(c => c.integrationID === model.providerID && c.active)
  assert.equal(value?.value.type, "oauth", "No active OpenAI OAuth credential")
  return value
}
const auth = credential(), originalCredentialHash = hash(JSON.stringify(auth))
assert.ok(auth.value.expires > Date.now() + 600_000, "Insufficient token lifetime for the budgeted check; no refresh")
const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
  XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
  OPENCODE_CONFIG_DIR: join(root, "config/opencode"), OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}", OPENCODE_DISABLE_DEFAULT_PLUGINS: "0",
  OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
  TEMP: root, TMP: root, TMPDIR: root, npm_config_cache: join(process.env.LOCALAPPDATA, "npm-cache") }
delete env.OPENCODE_SESSION_ID
const json = (path, value) => writeFile(join(root, path), JSON.stringify(value, null, 2) + "\n")
const summary = { scope: "7.5 only", root, model, started: new Date().toISOString() }
const prompt = "Refina APP-1 en https://fixture.atlassian.net y entrega el borrador completo con sus incidencias y trazabilidad. Sitio y alcance confirmados: únicamente APP-1, el acuerdo vigente de cancelación APP-2 y el acuerdo vigente de plazo de abono APP-3. Son dos reglas independientes ya acordadas que hay que cotejar, no decisiones nuevas. No hay código ni documentación local en este encargo. El corpus confirmado es Jira fixture.atlassian.net APP-1/APP-2/APP-3; referencia acuerdos-vigentes-2026-11-02. Los originales completos están disponibles en ese Jira sintético. Aplica el flujo habitual del Refinador. Son datos ficticios. No hace falta revisión adicional del borrador en este encargo."
try {
  console.log(`Evidence: ${root}`)
  await mkdir(join(config, "agents"), { recursive: true })
  for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(config, dir === "plugin" ? "plugins" : dir), { recursive: true })
  await cp(join(source, ".apm/skills"), join(host, ".agents/skills"), { recursive: true })
  for (const agent of ["refinador", "investigador", "lector-codigo", "lector-documentacion", "revisor"])
    await cp(join(source, ".apm/agents", `${agent}.agent.md`), join(config, "agents", `${agent}.md`))
  for (const name of ["package.json", "agent-settings.example.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  execFileSync(process.execPath, [join(source, "scripts/setup-opencode.mjs")], { cwd: host, env, timeout: 240_000, stdio: "pipe" })
  await mkdir(join(root, "cache/opencode"), { recursive: true })
  await cp(join(home, ".cache/opencode/models.json"), join(root, "cache/opencode/models.json"))
  const settings = JSON.parse(await readFile(join(config, "opencode.json"), "utf8"))
  Object.assign(settings, { model: `${model.providerID}/${model.id}`, plugins: [new URL(".", import.meta.url).href, new URL("./model-fixture", import.meta.url).href] })
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  await json("case.json", { prompt, model })
  await withServer(host, env, async connected => {
    const headers = { "content-type": "application/json", "x-opencode-directory": host,
      authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }
    const post = async (path, input, timeout = 30_000) => {
      const response = await fetch(connected.OPENCODE_TEST_SERVER + path, { method: "POST", headers, body: JSON.stringify(input), signal: AbortSignal.timeout(timeout) })
      assert.ok(response.ok, `Private request ${path}: ${response.status}`)
      const text = await response.text()
      return text ? JSON.parse(text) : {}
    }
    // Only the access token enters the private in-memory server. Never read auth.json or refresh.
    const result = await post("/api/credential", { integrationID: model.providerID, value: { ...auth.value, refresh: "" } })
    assert.ok(result)
    const rpc = async input => (await post("/api/rpc/delegation-test/run", { input })).output
    const deadline = Date.now() + 360_000
    const wait = id => post(`/api/experimental/session/${id}/wait`, {}, Math.max(1, deadline - Date.now()))
    const parent = api("post", "/api/session", host, connected, { agent: "refinador", model, title: "S07 model" }).data
    summary.sessionID = parent.id
    await json("summary.json", summary)
    api("post", `/api/session/${parent.id}/prompt`, host, connected, { text: prompt })
    try {
      await wait(parent.id)
      const children = api("get", `/api/session?parentID=${parent.id}&limit=100&order=asc`, host, connected).data
      // Native waits only: no result requests, steering, polling or workflow repair.
      await Promise.all(children.map(child => wait(child.id)))
      await wait(parent.id)
      const sessions = [parent, ...children]
      summary.sessions = sessions.map(({ id, parentID, agent }) => ({ id, parentID, agent }))
      for (const session of sessions) {
        const context = api("get", `/api/session/${session.id}/context`, host, connected).data
        const safe = context.map(({ id, type, agent, model, time, finish, tokens, content, text }) => ({ id, type, agent, model, time, finish, tokens,
          ...(type === "user" || type === "synthetic" ? { text } : {}), content: content?.flatMap(part => part.type === "text" ? [{ type: "text", text: part.text }]
            : part.type === "tool" ? [{ type: "tool", id: part.id, name: part.name, state: part.state }] : []) }))
        await json(`${session.id}.json`, safe)
      }
      await json("events.json", (await rpc({ action: "events" })).events)
      const control = join(host, "informes-agente/sesiones/.control")
      const dirs = await readdir(control)
      const states = await Promise.all(dirs.map(async dir => JSON.parse(await readFile(join(control, dir, "state.json"), "utf8"))))
      await json("states.json", states)
      const works = states.flatMap(s => Object.values(s.work)), executions = works.flatMap(w => w.executions ?? [])
      assert.equal(executions.length, 2, "Two registered confirmations and native continuations required")
      assert.ok(executions.every(e => e.state === "integrado" && e.inputMessageID && e.result && e.integration), "Exact results must be integrated")
      const publications = states.flatMap(s => Object.values(s.operations)).filter(op => op.phase === "confirmed" && op.agent === "refinador")
      const candidate = publications.findLast(op => op.artifact.closure?.estado === "completo")
      assert.ok(candidate && candidate.artifact.closure.dependencias.length === 2, "Complete publication must cover both required investigations")
      for (const file of candidate.artifact.files) {
        const bytes = await readFile(join(candidate.result.sesion, file.path))
        assert.equal(hash(bytes), file.sha256)
        assert.match(bytes.toString("utf8"), /48/)
        assert.match(bytes.toString("utf8"), /7/)
      }
      const events = (await rpc({ action: "events" })).events
      const ranges = executions.map(e => {
        const start = events.filter(v => v.sessionID === e.sessionID && v.type === "session.execution.started")[1]
        const end = events.filter(v => v.sessionID === e.sessionID && v.type === "session.execution.succeeded")[1]
        assert.ok(start && end, "Native events required for each continuation")
        return { sessionID: e.sessionID, start: events.indexOf(start), end: events.indexOf(end) }
      })
      summary.ranges = ranges
      assert.ok(Math.max(...ranges.map(r => r.start)) < Math.min(...ranges.map(r => r.end)), "Model must choose overlapping continuations within configured limit two")
      summary.check = "passed"
    } catch (error) {
      summary.check = "failed"; summary.error = error.message
      await json("summary.json", summary)
      // Keep evidence even when the budgeted wait does not finish. No reasoning/raw native payloads.
      const children = api("get", `/api/session?parentID=${parent.id}&limit=100&order=asc`, host, connected).data
      for (const session of [parent, ...children]) {
        const context = api("get", `/api/session/${session.id}/context`, host, connected).data
        await json(`partial-${session.id}.json`, context.map(({ id, type, time, agent, finish, content }) => ({ id, type, time, agent, finish,
          content: content?.flatMap(part => part.type === "text" ? [{ type: "text", text: part.text }]
            : part.type === "tool" ? [{ type: "tool", name: part.name, state: part.state }] : []) })))
      }
      await json("events.json", (await rpc({ action: "events" })).events)
      await json("summary.json", summary)
      // No automatic model change, retry, replacement or completion claim.
      api("post", `/api/session/${parent.id}/interrupt`, host, connected, { resume: false })
      throw error
    }
  }, ["delegation-test", "delegation-model-fixture", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
} finally {
  summary.activeCredentialUnchanged = hash(JSON.stringify(credential())) === originalCredentialHash
  summary.finished = new Date().toISOString()
  await json("summary.json", summary)
  assert.ok(summary.activeCredentialUnchanged, "Shared credential changed during check")
}
