// S02 2.4 only. Importing is inert. The CLI needs separate explicit consent and budgets.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { withServer } from "../opencode.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"
import { captureSessions, nativeWait, privateRequest, recoverFailure, runBounded, verifyPublicationBytes } from "../delegation/verify-model.mjs"
import { descriptions, model as defaultModel, prompt, reviewConditions, unavailable } from "./data.mjs"

const source = fileURLToPath(new URL("../..", import.meta.url))
export const hash = value => createHash("sha256").update(value).digest("hex")
export const textOf = message => message?.content?.filter(p => p.type === "text").map(p => p.text).join("\n") ?? ""

export function consent(env) {
  assert.equal(env.OPENCODE_EVIDENCE_MODEL_CONSENT, "s02-2.4", "Explicit S02 2.4 opt-in required; no credential lookup performed")
  const flow = Number(env.OPENCODE_EVIDENCE_FLOW_MS), window = Number(env.OPENCODE_EVIDENCE_WINDOW_MS)
  assert.ok(Number.isSafeInteger(flow) && flow > 0 && Number.isSafeInteger(window) && window > flow + 30_000 && window <= 3_600_000,
    "Explicit flow/window budgets required (window > flow + 30000; max window 3600000 ms)")
  return { flow, window }
}

// The model to exercise 2.4 stays a declared parameter, never executed by this
// file or its tests. Only the authorized CLI invocation may select it.
export function resolveModel(env) {
  const value = env.OPENCODE_EVIDENCE_MODEL
  if (value === undefined || value === "") return defaultModel
  assert.match(value, /^[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    "OPENCODE_EVIDENCE_MODEL must be 'providerID/modelID' with safe characters")
  const [providerID, id] = value.split("/")
  return { providerID, id }
}

// Synthetic content is retained, never reasoning/native provider payloads or credentials.
export function sanitize(value, secrets = []) {
  const clean = text => secrets.filter(Boolean).reduce((v, secret) => v.split(secret).join("[REDACTED]"), text)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(/https?:\/\/[^\s"<>]+[?][^\s"<>]+/gi, "[URL_WITH_QUERY_REDACTED]")
  if (typeof value === "string") return clean(value)
  if (Array.isArray(value)) return value.map(v => sanitize(v, secrets))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(authorization|headers|password|access|refresh|apiKey|native|reasoning|encryptedContent)$/i.test(key))
    .map(([key, v]) => [key, sanitize(v, secrets)]))
  return value
}

export function evidenceWriter(root, secrets = []) {
  return {
    secrets,
    save: (name, value) => writeFile(join(root, name), JSON.stringify(sanitize(value, secrets), null, 2) + "\n"),
    record: value => appendFile(join(root, "driver-events.jsonl"), JSON.stringify(sanitize(value, secrets)) + "\n"),
  }
}

// The V2 consumer preparation from delegation/verify-model.mjs is intentionally
// kept local because its main() is not exported; its helpers/teardown are reused.
// No credential/cache access here: deterministic tests use this same installation.
export async function prepareConsumer(root, model = defaultModel) {
  const host = join(root, "consumer"), config = join(host, ".opencode")
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config/opencode"), OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}", OPENCODE_DISABLE_DEFAULT_PLUGINS: "0",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    TEMP: root, TMP: root, TMPDIR: root, npm_config_cache: join(process.env.LOCALAPPDATA, "npm-cache") }
  delete env.OPENCODE_SESSION_ID
  await mkdir(join(config, "agents"), { recursive: true })
  for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(config, dir === "plugin" ? "plugins" : dir), { recursive: true })
  await cp(join(source, ".apm/skills"), join(host, ".agents/skills"), { recursive: true })
  for (const agent of ["refinador", "investigador", "lector-codigo", "lector-documentacion", "revisor"])
    await cp(join(source, ".apm/agents", `${agent}.agent.md`), join(config, "agents", `${agent}.md`))
  for (const name of ["package.json", "agent-settings.example.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  execFileSync(process.execPath, [join(source, "scripts/setup-opencode.mjs")], { cwd: host, env, timeout: 240_000, stdio: "pipe" })
  const settings = JSON.parse(await readFile(join(config, "opencode.json"), "utf8"))
  Object.assign(settings, { model: `${model.providerID}/${model.id}`, plugins: [new URL("../delegation", import.meta.url).href, new URL("./fixture", import.meta.url).href] })
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  await evidenceWriter(root).save("preparation.json", { node: process.version,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(),
    sourceStatus: execFileSync("git", ["status", "--porcelain"], { cwd: source, encoding: "utf8" }).trim(),
    files: await Promise.all([".apm/agents/investigador.agent.md", ".apm/skills/operativa-comun/references/fuentes-evidencias.md",
      ".apm/skills/operativa-comun/references/configuracion.md", ".apm/skills/operativa-comun/references/publicacion-revision.md",
      ".apm/skills/consulta-jira/SKILL.md", "test-support/evidence-model/verify-model.mjs", "test-support/evidence-model/data.mjs",
      "test-support/evidence-model/fixture/index.ts", "test-support/delegation/verify-model.mjs", "test-support/opencode.mjs"]
      .map(async path => ({ path, sha256: hash(await readFile(join(source, path))) }))) })
  return { host, config, env, settings }
}

export async function loadStates(host) {
  const control = join(host, "informes-agente/sesiones/.control")
  const dirs = await readdir(control).catch(error => { if (error.code === "ENOENT") return []; throw error })
  return Promise.all(dirs.map(async dir => JSON.parse(await readFile(join(control, dir, "state.json"), "utf8"))))
}

export async function loadCalls(host) {
  const text = await readFile(join(host, "fixture-calls.jsonl"), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error })
  return text.trim() ? text.trim().split("\n").map(JSON.parse) : []
}

export function verifyReads(calls, sessions) {
  const completed = calls.filter(call => call.state === "completed" && call.name === "getJiraIssue" &&
    sessions.some(s => s.id === call.sessionID && s.messages.some(m => m.id === call.messageID && m.type === "assistant" &&
      m.content?.some(p => p.type === "tool" && p.name === "execute" && p.id === call.callID && p.state?.status === "completed"))) &&
    calls.some(start => start.state === "started" && ["sessionID", "messageID", "callID", "name", "key"].every(k => start[k] === call[k]) && start.time <= call.time))
  for (const key of Object.keys(descriptions)) {
    const expected = descriptions[key]
    assert.ok(completed.some(c => c.key === key && c.outcome === "available" && c.result?.fields?.description === expected &&
      hash(JSON.stringify(c.result)) === c.resultSha256), `Exact completed common source read required: ${key}`)
  }
  for (const [key, error] of Object.entries(unavailable)) assert.ok(completed.some(c => c.key === key && c.outcome === "source_unavailable" &&
    JSON.stringify(c.result) === JSON.stringify({ key, error }) && hash(JSON.stringify(c.result)) === c.resultSha256), `Observed unavailability required: ${key}`)
  assert.ok(calls.every(c => !c.key || Object.hasOwn(descriptions, c.key) || Object.hasOwn(unavailable, c.key)), "Out-of-scope fixture read")
  return completed.map(({ sessionID, messageID, callID, key, outcome, resultSha256 }) => ({ sessionID, messageID, callID, key, outcome, resultSha256 }))
}

export async function verifyReport(states, parentID, sessions, read = readFile) {
  const operations = states.flatMap(s => Object.values(s.operations ?? {}))
  const candidate = operations.findLast(op => op.phase === "confirmed" && op.type === "write_report_pair" && op.producerSessionID === parentID)
  assert.ok(candidate, "Confirmed report pair by this investigator required")
  const artifact = candidate.artifact, session = sessions.find(s => s.id === parentID)
  assert.ok(session?.agent === "investigador" && artifact.agent === session.agent && candidate.agent === session.agent &&
    artifact.rootSessionID === parentID && artifact.producerSessionID === parentID && artifact.type === candidate.type, "Exact report producer/root required")
  const records = states.flatMap(s => Object.values(s.artifacts ?? {})).filter(a => a.id === artifact.id)
  assert.equal(records.length, 1); assert.deepEqual(records[0], artifact)
  const message = session.messages.find(m => m.id === artifact.producerMessageID && m.type === "assistant")
  const tool = message?.content?.find(p => p.type === "tool" && p.name === candidate.type && p.state?.status === "completed" &&
    p.state.content?.some(c => c.type === "text" && c.text.includes(artifact.id)))
  assert.ok(tool, "Completed exact native report publication call required")
  const { indice, ...result } = JSON.parse(tool.state.content.filter(c => c.type === "text").map(c => c.text).join("\n"))
  assert.deepEqual(result, candidate.result)
  if (indice !== undefined) assert.ok(indice?.actualizado === false && typeof indice.aviso === "string" && Object.keys(indice).length === 2)
  assert.equal(result.guardado, true); assert.equal(result.artefacto_id, artifact.id)
  assert.equal(result.hash_manifiesto, artifact.manifestHash); assert.equal(hash(JSON.stringify(artifact.files)), artifact.manifestHash)
  assert.deepEqual(result.archivos, artifact.files); assert.deepEqual(result.rutas, candidate.paths)
  const args = tool.state.input, files = { "resumen-ejecutivo.md": args.resumen_ejecutivo, "informe-detallado.md": args.informe_detallado }
  assert.ok(Object.values(files).every(value => typeof value === "string"), "This case must publish its own complete literal reports")
  assert.deepEqual(Object.keys(candidate.paths).sort(), Object.keys(files).sort())
  assert.equal(result.operacion_id, candidate.logicalID)
  if (args.operacion_id !== undefined) assert.equal(args.operacion_id, candidate.logicalID)
  assert.equal(artifact.workID, args.encargo_id)
  assert.equal(candidate.digest, hash(JSON.stringify({ type: candidate.type, topic: args.slug, group: "consulta", delivery: null,
    files: Object.keys(files).sort().map(name => [name, files[name]]), sources: args.fuentes ?? [], decisions: args.decisiones ?? [], keys: [],
    ...(args.encargo_id ? { workID: args.encargo_id } : {}), ...(args.parcial ? { partial: args.parcial } : {}) })), "Exact publication request digest required")
  const bytes = await verifyPublicationBytes(candidate, read)
  assert.equal(bytes.length, 2)
  for (const [name, content] of Object.entries(files)) assert.ok(bytes.some(file => file.content === content && file.sha256 === hash(content) &&
    candidate.paths[name] === join(result.sesion, file.path)), "Published bytes must equal the full native tool input")
  return { candidate, files: bytes }
}

export function reviewChecklist(candidate, files, sessions) {
  assert.equal(files.length, candidate.artifact.files.length)
  assert.ok(files.length && files.every(file => hash(file.content) === file.sha256 && candidate.artifact.files.some(expected =>
    expected.path === file.path && expected.sha256 === file.sha256 && expected.bytes === Buffer.byteLength(file.content))), "Verified complete report bytes required")
  const final = sessions.find(s => s.id === candidate.producerSessionID)?.messages.findLast(m => m.type === "assistant" && m.finish === "stop")
  assert.ok(textOf(final).trim(), "Final answer required for independent contradiction review")
  return { status: "review_required", sufficientFor24: false, artifactID: candidate.artifact.id, manifestHash: candidate.artifact.manifestHash,
    final: { sessionID: candidate.producerSessionID, messageID: final.id, sha256: hash(textOf(final)) },
    files: files.map(({ path, sha256, content }) => ({ path, sha256, lines: content.split(/\r?\n/).length })),
    conditions: reviewConditions.map(([question, source, condition]) => ({ question, source, sourceText: descriptions[source] ?? unavailable[source],
      condition, verdict: "pending", reportReferences: [], nativeReferences: [], contradictionCheck: "pending" })),
    completion: "Separate reviewer must inspect all reports, final answer, work states and calls; cite exact file/hash/lines and native message/tool IDs for every condition, record reviewer and verdict. Never auto-approve by word/number matches. Preserve this generated checklist; write acceptance-review.json separately.",
    evidence: ["case.json", "preparation.json", "states.json", "events.json", "notification-events.json", "fixture-calls.json", "driver-events.jsonl", "tool-inputs.json", "<sessionID>.json", "report-files.json"],
    correlation: "Fixture callID is the native execute-container call ID, not a unique internal Jira call ID; key/name/time distinguish synthetic invocations." }
}

export async function runCase({ root, host, request, writer, summary, flow }) {
  const { save, record } = writer
  let deadline = Date.now() + flow
  const inputs = new Map()
  const post = (path, input, timeout = 30_000) => request("POST", path, input, Math.min(timeout, deadline - Date.now()))
  const read = async path => {
    const page = await request("GET", path, undefined, Math.min(30_000, deadline - Date.now()))
    const sessionID = new URL(path, "http://private").pathname.match(/^\/api\/session\/(ses_[a-zA-Z0-9]+)\/message$/)?.[1]
    if (sessionID && Array.isArray(page.data)) {
      for (const message of page.data) for (const part of message.content ?? []) if (part.type === "tool")
        inputs.set(JSON.stringify([sessionID, message.id, part.id]), { sessionID, messageID: message.id, callID: part.id, name: part.name,
          input: part.state?.input, status: part.state?.status, ...(part.state?.error ? { errorBody: "omitted; status retained" } : {}) })
      await save("tool-inputs.json", [...inputs.values()])
    }
    return page
  }
  const rpc = async input => (await post("/api/rpc/delegation-test/run", { input })).output
  const observe = async input => (await post("/api/rpc/evidence-model-observer/run", { input }, deadline - Date.now())).output
  const parent = (await post("/api/session", { agent: "investigador", model: summary.model, title: "S02 evidence" })).data
  summary.sessionID = parent.id
  await save("summary.json", summary)
  try {
    await post(`/api/session/${parent.id}/prompt`, { text: prompt })
    await record({ type: "prompt.sent", sessionID: parent.id, at: Date.now() })
    const { admission } = await observe({ parentID: parent.id, inputType: "user" })
    await record({ type: "prompt.admitted", sessionID: parent.id, ...admission, at: Date.now() })
    await nativeWait(request, parent.id, deadline, record, "objective")
    const sessions = await captureSessions(read, parent, save, summary)
    await save("events.json", (await rpc({ action: "events" })).events)
    await save("notification-events.json", (await observe({ action: "events" })).events)
    const states = await loadStates(host), calls = await loadCalls(host)
    await save("states.json", states); await save("fixture-calls.json", calls)
    // Idle alone never proves a result. A background child not settled here fails
    // closed rather than being resumed/steered to repair the tested workflow.
    for (const session of sessions) {
      const last = session.messages.findLastIndex(m => ["user", "synthetic", "assistant"].includes(m.type))
      assert.ok(session.messages.findLastIndex(m => m.type === "idle") > last, "All observed sessions must be inactive")
      assert.ok(session.messages.some(m => m.type === "assistant" && m.finish === "stop" && textOf(m).trim()), "Native final result required, not just idle")
      for (const message of session.messages.filter(m => m.type === "assistant"))
        assert.deepEqual(message.model, summary.model, "Effective native model must equal the explicitly selected model")
    }
    const reads = verifyReads(calls, sessions)
    const { candidate, files } = await verifyReport(states, parent.id, sessions)
    await save("report-files.json", files)
    await save("review-required.json", reviewChecklist(candidate, files, sessions))
    Object.assign(summary, { mechanicalCheck: "passed", check: "review_required", sufficientFor24: false, reads,
      artifactID: candidate.artifact.id, manifestHash: candidate.artifact.manifestHash })
    await save("summary.json", summary)
    return { sessions, states, calls }
  } catch (error) {
    deadline = Date.now() + 30_000
    // Calls are durable even when the normal acquisition fails.
    try { await save("fixture-calls.json", await loadCalls(host)) }
    catch (failure) { (summary.evidenceErrors ??= []).push({ stage: "fixture-calls", error: failure.message }) }
    return recoverFailure({ error, summary, parent, read, rpc, observe, save, loadStates: () => loadStates(host),
      post: (path, input, timeout) => request("POST", path, input, timeout) })
  }
}

// Identical V2 credential preparation to S07: active official API, no auth.json,
// no refresh, no credential persistence. This function is unreachable in tests.
function credential(model) {
  const status = opencode(["service", "status"], source)
  assert.ok(status.status === 0 && /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(status.stdout), "Existing shared service required; will not start it")
  const result = opencode(["api", "get", "/api/credential"], source)
  assert.equal(result.status, 0, "Active V2 credential lookup failed")
  const auth = JSON.parse(result.stdout).data.find(c => c.integrationID === model.providerID && c.active)
  assert.equal(auth?.value.type, "oauth", "No active OAuth credential for the configured model provider")
  return auth
}

async function main(root, budgets, model) {
  const writer = evidenceWriter(root), summary = { scope: "S02 2.4 only", model, root, started: new Date().toISOString(),
    check: "in_progress", sufficientFor24: false, activeCredentialUnchanged: "unknown" }
  let original, failure
  try {
    await writer.save("summary.json", summary)
    await writer.save("case.json", { prompt, model, modelParameter: `${model.providerID}/${model.id}`, descriptions, unavailable, reviewConditions, budgets })
    original = credential(model)
    writer.secrets.push(original.value.access, original.value.refresh)
    assert.ok(original.value.expires > Date.now() + budgets.window, "Token lifetime insufficient; will not refresh")
    const { host, env } = await prepareConsumer(root, model)
    await mkdir(join(root, "cache/opencode"), { recursive: true })
    await cp(join(process.env.USERPROFILE, ".cache/opencode/models.json"), join(root, "cache/opencode/models.json"))
    await withServer(host, env, async connected => {
      writer.secrets.push(connected.OPENCODE_PASSWORD, Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64"))
      const request = privateRequest(connected, host)
      await request("POST", "/api/credential", { integrationID: model.providerID, value: { ...original.value, refresh: "" } })
      await runCase({ root, host, request, writer, summary, flow: budgets.flow })
    }, ["delegation-test", "evidence-model-fixture", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } catch (error) { failure = error; summary.check = "failed"; summary.error = error.message }
  finally {
    if (original) try {
      summary.activeCredentialUnchanged = hash(JSON.stringify(credential(model))) === hash(JSON.stringify(original))
      assert.ok(summary.activeCredentialUnchanged, "Shared credential changed during check")
    } catch (error) { summary.credentialCheckError = error.message; summary.check = "failed"; failure ??= error }
    summary.finished = new Date().toISOString()
    await writer.save("summary.json", summary)
  }
  if (failure) throw new Error("S02 driver failed; inspect sanitized summary.json")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgets = consent(process.env)
  const model = resolveModel(process.env)
  if (process.argv[2] === "--worker") await main(process.argv[3], budgets, model)
  else {
    assert.equal(process.argv.length, 2, "No arguments supported")
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s02-model-"))
    console.log(`Evidence: ${root}`)
    try { await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root],
      { cwd: source, timeout: budgets.window, env: { ...process.env, OPENCODE_EVIDENCE_MODEL: `${model.providerID}/${model.id}` } }) }
    catch (error) {
      const summary = await readFile(join(root, "summary.json"), "utf8").then(JSON.parse).catch(() => ({ scope: "S02 2.4 only", root }))
      summary.activeCredentialUnchanged ??= "unknown"
      Object.assign(summary, { check: "failed", sufficientFor24: false, supervisionError: error.message, cleanupError: error.cleanupError,
        finished: new Date().toISOString() })
      await evidenceWriter(root).save("summary.json", summary)
      throw error
    }
  }
}
