// Opt-in S07 only. One objective prompt; never prompts the model to parallelize or wait.
import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { withServer } from "../opencode.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"
import { acquireSessions } from "../../scripts/session-diagnostics.mjs"
import { descriptions, reviewConditions } from "./model-fixture/data.mjs"
import { notificationIdentity } from "./model-fixture/observer.mjs"

const hash = value => createHash("sha256").update(value).digest("hex")
const header = ({ id, parentID, agent }) => ({ id, parentID, agent })
const publishers = new Set(["publish_agent_deliverable", "write_report_pair"])
const safeMessage = ({ id, type, agent, model, time, finish, tokens, content, text, metadata }) => ({ id, type, agent,
  model: model && { providerID: model.providerID, id: model.id }, time, finish, tokens,
  ...(["user", "synthetic"].includes(type) ? { text } : {}),
  ...(type === "synthetic" && metadata?.source === "subagent" ? { metadata: { source: metadata.source, childID: metadata.childID, agent: metadata.agent, state: metadata.state } } : {}),
  content: content?.flatMap(part => part.type === "text" ? [{ type: "text", text: part.text }]
    : part.type === "tool" ? [{ type: "tool", id: part.id, name: part.name, time: part.time,
      state: { status: part.state?.status,
        ...(["subagent", "session_work", "execute"].includes(part.name) || publishers.has(part.name) ? { input: part.state?.input } : {}),
        content: part.state?.content?.filter(c => c.type === "text").map(({ text }) => ({ type: "text", text })) } }] : []) })

// The same private connection/authentication as withServer; no CLI subprocess per read.
export function privateRequest(connected, host) {
  const headers = { "content-type": "application/json", "x-opencode-directory": host,
    authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }
  return async (method, path, input, timeout = 30_000) => {
    assert.ok(timeout > 0, `Private request budget exhausted: ${path}`)
    const response = await fetch(connected.OPENCODE_TEST_SERVER + path, { method, headers,
      ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(Math.ceil(timeout)) })
    assert.ok(response.ok, `Private request ${path}: ${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : {}
  }
}

export async function captureSessions(read, parent, save, summary = {}) {
  const known = new Map([[parent.id, header(parent)], ...(summary.sessions ?? []).map(s => [s.id, header(s)])])
  const messages = new Map()
  const coverage = summary.coverage = { tree: "partial", messages: {}, consistency: "non-atomic-read" }
  summary.sessions = [...known.values()]
  const data = await acquireSessions(async path => {
    const page = await read(path), url = new URL(path, "http://private")
    if (url.pathname === "/api/session" && Array.isArray(page.data)) {
      for (const session of page.data) known.set(session.id, header(session))
      summary.sessions = [...known.values()]
    }
    const match = url.pathname.match(/^\/api\/session\/(ses_[a-zA-Z0-9]+)\/message$/)
    if (match && Array.isArray(page.data)) {
      const id = match[1], retained = messages.get(id) ?? new Map()
      for (const message of page.data) retained.set(message.id, safeMessage(message))
      messages.set(id, retained)
      coverage.messages[id] = page.cursor && !page.cursor.next ? "complete" : "partial"
      // Persist each page before requesting the next. A later timeout must not lose it.
      await save(`${id}.json`, [...retained.values()])
    }
    return page
  }, { rootID: parent.id })
  coverage.tree = "complete"
  coverage.acquisition = data.acquisition
  return data.sessions.map(session => ({ ...header(session), messages: [...(messages.get(session.id)?.values() ?? [])] }))
}

export function continuationRanges(executions, events) {
  return executions.map(e => {
    const exact = (type, id) => events.flatMap((v, i) => v.sessionID === e.sessionID && v.type === type && id && v.messageID === id ? [i] : [])
    const starts = exact("session.step.started", e.startMessageID), results = exact("session.step.ended", e.result?.messageID)
    assert.ok(starts.length === 1 && results.length === 1, "Native steps required for the exact continuation")
    const start = events.findLastIndex((v, i) => i < starts[0] && v.sessionID === e.sessionID && v.type === "session.execution.started")
    const end = events.findIndex((v, i) => i > start && v.sessionID === e.sessionID &&
      /^session\.execution\.(started|succeeded|failed|interrupted)$/.test(v.type))
    assert.ok(start >= 0 && end > results[0] && results[0] >= starts[0] && events[end].type === "session.execution.succeeded",
      "Native execution boundaries must enclose both exact continuation messages")
    return { sessionID: e.sessionID, start, end }
  })
}

export async function recoverFailure({ error, summary, parent, read, post, rpc, save, loadStates, observe }) {
  summary.check = "failed"; summary.error = error.message
  const errors = summary.evidenceErrors ??= []
  const attempt = async (stage, run) => {
    try { return await run() } catch (failure) { errors.push({ stage, error: failure.message }) }
  }
  await attempt("summary", () => save("summary.json", summary))
  try {
    await Promise.all([
      attempt("history", () => captureSessions(read, parent, (name, value) => save(`partial-${name}`, value), summary)),
      attempt("events", async () => save("events.json", (await rpc({ action: "events" })).events)),
      ...(observe ? [attempt("notifications", async () => save("notification-events.json", (await observe({ action: "events" })).events))] : []),
      ...(loadStates ? [attempt("states", async () => save("states.json", await loadStates()))] : []),
    ])
  } finally {
    summary.interruptRequests = []
    await Promise.all([...new Set([parent.id, ...(summary.sessions ?? []).map(s => s.id)])].map(id => attempt(`interrupt:${id}`, async () => {
      const result = await post(`/api/session/${id}/interrupt?resume=false`, undefined, 5_000)
      summary.interruptRequests.push({ sessionID: id, request: "succeeded", interrupted: typeof result?.interrupted === "boolean" ? result.interrupted : "unknown" })
    })))
    await attempt("summary", () => save("summary.json", summary))
  }
  // Retain the original failure even if acquisition or interruption also failed.
  throw error
}

// Keep withServer/setup intact, but bound their teardown too. This process tree is
// owned by this invocation; never select processes by name or touch the shared service.
export async function runBounded(command, args, { cwd, env = process.env, timeout }) {
  const child = spawn(command, args, { cwd, env, stdio: "inherit", detached: process.platform !== "win32" })
  let timer
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`Driver exited: ${code ?? signal}`)))
      timer = setTimeout(() => {
        const error = new Error("Driver supervision budget exhausted")
        error.pid = child.pid
        if (child.pid) {
          if (process.platform === "win32") {
            const killed = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { timeout: 5_000, stdio: "ignore" })
            if (killed.status !== 0) error.cleanupError = "Private process tree termination failed"
          } else {
            try { process.kill(-child.pid, "SIGKILL") } catch (failure) { if (failure.code !== "ESRCH") error.cleanupError = failure.message }
          }
        }
        reject(error)
      }, timeout)
    })
  } finally { clearTimeout(timer) }
}

const messageText = message => message?.content?.filter(p => p.type === "text").map(p => p.text).join("\n")
function requireTool(sessions, sessionID, messageID, name, check) {
  const message = sessions.find(s => s.id === sessionID)?.messages.find(m => m.id === messageID && m.type === "assistant")
  const found = message?.content?.some(part => {
    if (part.type !== "tool" || part.name !== name || part.state?.status !== "completed") return false
    try { check(part.state.input, JSON.parse(part.state.content.filter(c => c.type === "text").map(c => c.text).join("\n"))); return true }
    catch { return false }
  })
  assert.ok(found, `Exact completed ${name} call/result required in ${sessionID}/${messageID}`)
}

function workOutput(output, work, execution) {
  assert.equal(output.guardado, true)
  for (const key of ["id", "rootSessionID", "ownerSessionID", "responsibleSessionID", "parentID", "pregunta", "corpus", "referencia"])
    assert.deepEqual(output.encargo?.[key], work[key])
  for (const key of ["id", "sessionID", "preparationMessageID", "confirmation"])
    assert.deepEqual(output.ejecucion?.[key], execution[key])
}

function publicationTrace(operation, work, sessions) {
  const { artifact, result } = operation
  assert.ok(publishers.has(operation.type), "Captured publisher contract required")
  assert.ok(artifact.type === operation.type && artifact.producerSessionID === operation.producerSessionID && artifact.agent === operation.agent &&
    sessions.find(s => s.id === artifact.producerSessionID)?.agent === artifact.agent, "Exact native publication producer required")
  assert.equal(result.guardado, true)
  assert.equal(result.artefacto_id, artifact.id)
  assert.equal(result.hash_manifiesto, artifact.manifestHash)
  assert.deepEqual(result.archivos, artifact.files)
  assert.deepEqual(result.rutas, operation.paths)
  assert.equal(hash(JSON.stringify(artifact.files)), artifact.manifestHash)
  requireTool(sessions, artifact.producerSessionID, artifact.producerMessageID, operation.type, (args, output) => {
    const { indice, ...confirmed } = output
    assert.deepEqual(confirmed, result)
    if (Object.hasOwn(output, "indice")) {
      assert.ok(indice && typeof indice === "object" && !Array.isArray(indice))
      assert.deepEqual(Object.keys(indice).sort(), ["actualizado", "aviso"])
      assert.equal(indice.actualizado, false)
      assert.equal(typeof indice.aviso, "string")
    }
    // The original tool content, including indice, remains in the captured evidence.
    assert.equal(args.encargo_id, work.id)
    if (args.operacion_id !== undefined) assert.equal(args.operacion_id, operation.logicalID)
    assert.equal(result.operacion_id, operation.logicalID)
    const files = operation.type === "publish_agent_deliverable" ? { [args.nombre]: args.contenido ?? args.origen }
      : { "resumen-ejecutivo.md": args.resumen_ejecutivo ?? args.origen_resumen_ejecutivo,
        "informe-detallado.md": args.informe_detallado ?? args.origen_informe_detallado }
    const digest = hash(JSON.stringify({ type: operation.type, topic: operation.type === "publish_agent_deliverable" ? args.nombre : args.slug,
      group: operation.type === "write_report_pair" ? "consulta" : null, delivery: null,
      files: Object.keys(files).sort().map(name => [name, typeof files[name] === "string" ? files[name] :
        { artefacto_id: files[name].artefacto_id, archivo: files[name].archivo, sha256: files[name].sha256 }]),
      sources: args.fuentes ?? [], decisions: args.decisiones ?? [], keys: [],
      workID: args.encargo_id, ...(args.parcial ? { partial: args.parcial } : {}) }))
    assert.equal(operation.digest, digest, "Publication args must match the registered request digest")
    assert.deepEqual(Object.keys(files).sort(), Object.keys(operation.paths).sort())
    assert.equal(artifact.files.length, Object.keys(files).length)
    for (const [name, content] of Object.entries(files)) {
      const path = relative(result.sesion, operation.paths[name]).replace(/\\/g, "/")
      const file = artifact.files.find(f => f.path === path)
      assert.ok(file, "Manifest must cover each published file")
      assert.equal(file.sha256, typeof content === "string" ? hash(content) : content.sha256)
      if (typeof content === "string") assert.equal(file.bytes, Buffer.byteLength(content))
      else assert.deepEqual(artifact.origin?.files?.[name], content)
    }
  })
}

export async function verifyPublicationBytes(operation, read = readFile) {
  return Promise.all(operation.artifact.files.map(async file => {
    const bytes = await read(join(operation.result.sesion, file.path))
    assert.equal(hash(bytes), file.sha256, "Registered publication bytes changed")
    assert.equal(bytes.length, file.bytes, "Registered publication byte count changed")
    return { ...file, content: bytes.toString("utf8") }
  }))
}

export function notificationTarget(session, result) {
  const text = messageText(result)
  assert.ok(result?.type === "assistant" && result.finish === "stop" && text?.trim(), "Final notification target required")
  const resultSha256 = hash(text)
  const matches = session.messages.filter(m => m.type === "assistant" && m.finish === "stop" && hash(messageText(m) ?? "") === resultSha256)
  assert.ok(matches.length === 1 && matches[0].id === result.id, "Notification content is ambiguous across native results; no exact message correlation")
  return { expectedResultMessageID: result.id, resultSha256 }
}

export function verifyNotification(admission, parent, child, result) {
  const target = notificationTarget(child, result)
  assert.equal(admission.correlation, "content_match", "Notification correlation remains indeterminate")
  const notice = parent.messages.find(m => m.id === admission.inboxID)
  const identity = notificationIdentity({ type: notice?.type, payload: { text: notice?.text, metadata: notice?.metadata } })
  assert.ok(identity?.source === "subagent" && identity.childID === child.id && identity.state === "completed", "Native notification provenance required")
  assert.equal(identity.resultSha256, target.resultSha256)
  assert.deepEqual(identity, admission.notification)
  assert.ok(parent.messages.some(m => m.type === "assistant" && m.id === admission.parentMessageID), "Native parent step after admission required")
  return { ...target, correlation: "unique-content-match-not-native-causal-id" }
}

export function verifyExecutions(works, sessions) {
  const executions = works.flatMap(w => w.executions ?? [])
  assert.equal(executions.length, 2, "Two registered confirmations and native continuations required")
  for (const work of works) for (const e of work.executions ?? []) {
    assert.ok(e.state === "integrado" && e.inputMessageID && e.result && e.integration, "Exact results must be integrated")
    const messages = sessions.find(s => s.id === e.sessionID)?.messages ?? []
    const index = id => messages.findIndex(m => m.id === id)
    const preparation = messages[index(e.preparationMessageID)], input = messages[index(e.inputMessageID)]
    const start = messages[index(e.startMessageID)], result = messages[index(e.result.messageID)]
    assert.ok(preparation?.finish === "stop" && preparation.content.some(c => c.type === "text" && c.text.includes("PENDIENTE_CONFIRMACION")), "Exact preparation required")
    assert.ok(input?.type === "user" && ["CONFIRMAR", work.id, e.id].every(text => input.text?.includes(text)), "Exact confirmation input required")
    assert.ok(start?.type === "assistant" && index(preparation.id) < index(input.id) && index(start.id) > index(input.id), "Exact native start required")
    const text = result?.content.filter(c => c.type === "text").map(c => c.text).join("\n")
    assert.ok(result?.type === "assistant" && result.finish === "stop" && result.time?.completed && text?.trim() && !text.includes("PENDIENTE_CONFIRMACION"), "Exact final result required")
    assert.equal(messages.slice(0, index(result.id) + 1).findLast(m => m.type === "user")?.id, e.inputMessageID)
    assert.equal(e.result.sha256, hash(JSON.stringify([e.sessionID, e.inputMessageID, result.id, text, e.result.artifactID ?? null, e.result.manifestHash ?? null])), "Exact result hash required")
    assert.equal(e.integration.sessionID, work.ownerSessionID)
    assert.ok(e.confirmation?.sessionID === work.ownerSessionID && e.confirmation.source === "declaracion_coordinador", "Registered confirmation receipt required")
    assert.equal(e.integration.source, "declaracion_coordinador")
    requireTool(sessions, work.ownerSessionID, e.confirmation.messageID, "session_work", (args, output) => {
      assert.deepEqual(args, { action: "confirm", encargo_id: work.id, pregunta: work.pregunta, corpus: work.corpus, referencia: work.referencia,
        preparacion_message_id: e.preparationMessageID })
      workOutput(output, work, e)
      assert.equal(output.ejecucion.state, "en_cola")
    })
    requireTool(sessions, e.sessionID, e.startMessageID, "session_work", (args, output) => {
      assert.deepEqual(args, { action: "start", encargo_id: work.id, ejecucion_id: e.id })
      workOutput(output, work, e)
      assert.equal(output.ejecucion.state, "en_curso")
      assert.equal(output.ejecucion.inputMessageID, e.inputMessageID)
      assert.equal(output.ejecucion.startMessageID, e.startMessageID)
    })
    requireTool(sessions, work.ownerSessionID, e.integration.messageID, "session_work", (args, output) => {
      assert.deepEqual(args, { action: "integrate", encargo_id: work.id, ejecucion_id: e.id, resultado_hash: e.result.sha256,
        efecto: e.integration.efecto, siguiente_accion: e.integration.siguiente_accion })
      workOutput(output, work, e)
      assert.equal(output.ejecucion.state, "integrado")
      assert.equal(output.ejecucion.inputMessageID, e.inputMessageID)
      assert.equal(output.ejecucion.startMessageID, e.startMessageID)
      assert.deepEqual(output.ejecucion.result, e.result)
      assert.deepEqual(output.ejecucion.integration, e.integration)
    })
    assert.ok(sessions.find(s => s.id === work.ownerSessionID)?.messages.some(m => m.type === "assistant" && m.content?.some(part => {
      if (part.type !== "tool" || part.name !== "session_work" || part.state?.status !== "completed") return false
      try {
        const args = part.state.input, output = JSON.parse(part.state.content.filter(c => c.type === "text").map(c => c.text).join("\n"))
        assert.deepEqual(args, { action: "result", encargo_id: work.id, ejecucion_id: e.id, resultado_message_id: e.result.messageID,
          ...(e.result.artifactID ? { artefacto_id: e.result.artifactID } : {}) })
        workOutput(output, work, e)
        assert.equal(output.ejecucion.state, "resultado_disponible")
        assert.equal(output.ejecucion.inputMessageID, e.inputMessageID)
        assert.equal(output.ejecucion.startMessageID, e.startMessageID)
        assert.deepEqual(output.ejecucion.result, e.result)
        return true
      } catch { return false }
    })), "Exact completed result registration call required")
  }
  return executions
}

export function verifyCandidate(states, parentID, sessions) {
  const works = states.flatMap(s => Object.values(s.work))
  assert.equal(new Set(works.map(w => w.id)).size, works.length, "Unambiguous work identities required")
  const publications = states.flatMap(s => Object.values(s.operations)).filter(op => op.phase === "confirmed" &&
    op.agent === "refinador" && op.producerSessionID === parentID)
  const candidate = publications.findLast(op => op.artifact.closure?.estado === "completo")
  assert.ok(candidate, "Complete publication by this coordinator required")
  const artifact = candidate.artifact, main = works.find(w => w.id === artifact.workID)
  assert.ok(main && !main.parentID && main.ownerSessionID === parentID && main.rootSessionID === parentID &&
    artifact.rootSessionID === parentID && artifact.producerSessionID === parentID, "Candidate must belong to this root work")
  const descendants = [], pending = [main.id]
  for (const id of pending) for (const work of works.filter(w => w.parentID === id)) {
    assert.ok(!pending.includes(work.id), "Work tree must be acyclic")
    pending.push(work.id); descendants.push(work)
  }
  const required = descendants.filter(w => w.required === true || w.required !== false && w.executions?.length)
  for (const work of required) {
    assert.ok(work.rootSessionID === parentID && work.corpus === main.corpus && work.referencia === main.referencia, "Required work must share the exact root/corpus/reference")
    const session = sessions.find(s => s.id === work.responsibleSessionID)
    assert.ok(session && session.parentID === work.ownerSessionID && session.agent === "investigador", "Required investigator must be a native child of its owner")
    assert.ok(work.executions?.every(e => e.sessionID === session.id), "Execution must belong to the responsible native session")
  }
  const executions = verifyExecutions(required, sessions)
  assert.equal(new Set(executions.map(e => e.sessionID)).size, 2, "Two independent native investigators required")
  const expected = required.flatMap(w => w.executions.map(e => [w.id, e.id, "integrado", e.result.sha256])).sort()
  assert.equal(artifact.closure.cobertura, "registrada")
  assert.deepEqual(artifact.closure.dependencias.map(d => [d.encargo_id, d.ejecucion_id, d.estado, d.resultado_hash]).sort(), expected,
    "Closure must cover the exact required integrated results, not unrelated works")
  assert.equal(candidate.result.artefacto_id, artifact.id)
  assert.equal(candidate.result.hash_manifiesto, artifact.manifestHash)
  assert.equal(hash(JSON.stringify(artifact.files)), artifact.manifestHash)
  assert.deepEqual(candidate.result.cierre, artifact.closure)
  const linked = []
  for (const work of required) for (const e of work.executions ?? []) if (e.result.artifactID) {
    const records = states.flatMap(s => Object.values(s.artifacts ?? {})).filter(a => a.id === e.result.artifactID)
    const operations = states.flatMap(s => Object.values(s.operations)).filter(op => op.phase === "confirmed" && op.artifact.id === e.result.artifactID)
    assert.ok(records.length === 1 && operations.length === 1, "Result artifact requires a unique registered confirmed publication")
    const source = records[0], operation = operations[0]
    assert.deepEqual(source, operation.artifact)
    assert.ok(source.workID === work.id && source.rootSessionID === parentID && source.producerSessionID === e.sessionID &&
      operation.producerSessionID === e.sessionID && source.manifestHash === e.result.manifestHash, "Result artifact work/producer/manifest mismatch")
    const messages = sessions.find(s => s.id === e.sessionID).messages, position = messages.findIndex(m => m.id === source.producerMessageID)
    assert.ok(position >= 0 && messages.slice(0, position + 1).findLast(m => m.type === "user")?.id === e.inputMessageID,
      "Result artifact producer must belong to the exact continuation")
    publicationTrace(operation, work, sessions)
    linked.push(operation)
  }
  const candidateRecords = states.flatMap(s => Object.values(s.artifacts ?? {})).filter(a => a.id === artifact.id)
  assert.equal(candidateRecords.length, 1, "Registered candidate artifact required")
  assert.deepEqual(candidateRecords[0], artifact)
  publicationTrace(candidate, main, sessions)
  for (const session of sessions) {
    const messages = session.messages
    assert.ok(messages.findLastIndex(m => m.type === "idle") > messages.findLastIndex(m => ["user", "synthetic", "assistant"].includes(m.type)), "All observed native sessions must be inactive")
  }
  return { candidate, executions, linked }
}

export function verifyFixtureReads(calls, executions, sessions) {
  const completed = calls.filter(c => c.name === "getJiraIssue" && c.state === "completed" && c.callID && c.messageID &&
    sessions.find(s => s.id === c.sessionID)?.messages.some(m => m.id === c.messageID && m.type === "assistant") && calls.some(start =>
    start.state === "started" && ["sessionID", "messageID", "callID", "name", "key"].every(k => start[k] === c[k]) && start.time <= c.time))
  for (const key of ["APP-1", "APP-2", "APP-3"]) assert.ok(completed.some(c => c.key === key && sessions.some(s => s.id === c.sessionID)), `Completed synthetic read required: ${key}`)
  const owners = ["APP-2", "APP-3"].map(key => executions.filter(e => completed.some(c => {
    if (c.key !== key || c.sessionID !== e.sessionID) return false
    const messages = sessions.find(s => s.id === e.sessionID)?.messages ?? [], at = messages.findIndex(m => m.id === c.messageID)
    return at > messages.findIndex(m => m.id === e.inputMessageID) && at <= messages.findIndex(m => m.id === e.result.messageID)
  })))
  assert.ok(owners.every(list => list.length > 0) && owners[0].some(a => owners[1].some(b => a.id !== b.id)), "Both agreements must be read in distinct exact continuations")
}

export function reviewChecklist(candidate, files) {
  assert.ok(files.length > 0 && files.length === candidate.artifact.files.length && files.every(file =>
    hash(file.content) === file.sha256 && candidate.artifact.files.some(expected => expected.path === file.path &&
      expected.sha256 === file.sha256 && expected.bytes === Buffer.byteLength(file.content))), "Review must bind complete verified candidate bytes")
  return { status: "review_required", sufficientFor75: false, artifactID: candidate.artifact.id, manifestHash: candidate.artifact.manifestHash,
    files: files.map(({ path, sha256, content }) => ({ path, sha256, lines: content.split(/\r?\n/).length })),
    semantic: reviewConditions.map(([source, condition]) => ({ source, sourceText: descriptions[source], sourceSha256: hash(descriptions[source]), condition,
      verdict: "pending", candidateReferences: [], contradictionCheck: "pending" })),
    workflow: ["No polling of investigations", "No redundant continuation to request an existing result", "Both results integrated once before complete publication"]
      .map(condition => ({ condition, verdict: "pending", nativeReferences: [] })),
    evidence: ["case.json", "states.json", "events.json", "notification-events.json", "fixture-calls.json", "driver-events.jsonl", "<sessionID>.json"],
    completion: "Separate review must cite exact file/hash/lines and native message/tool/event IDs for every condition, check contradictions and record reviewer/verdict. Mechanical checks alone never approve 7.5." }
}

export async function nativeWait(request, id, deadline, record, phase) {
  await record({ type: "wait.enter", sessionID: id, phase, at: Date.now() })
  try {
    await request("POST", `/api/experimental/session/${id}/wait`, {}, deadline - Date.now())
    await record({ type: "wait.exit", sessionID: id, phase, at: Date.now() })
  } catch (error) {
    await record({ type: "wait.error", sessionID: id, phase, error: error.message, at: Date.now() })
    throw error
  }
}

async function main(root) {
const source = fileURLToPath(new URL("../..", import.meta.url))
const host = join(root, "consumer"), config = join(host, ".opencode")
const home = process.env.USERPROFILE, model = { providerID: "openai", id: "gpt-6.1-sol" }
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
const record = value => appendFile(join(root, "driver-events.jsonl"), JSON.stringify(value) + "\n")
const summary = { scope: "7.5 only", root, model, activeCredentialUnchanged: "unknown", started: new Date().toISOString() }
const prompt = "Refina APP-1 en https://fixture.atlassian.net y entrega el borrador completo con sus incidencias y trazabilidad. Sitio y alcance confirmados: únicamente APP-1, el acuerdo vigente de cancelación APP-2 y el acuerdo vigente de plazo de abono APP-3. Son dos reglas independientes ya acordadas que hay que cotejar, no decisiones nuevas. No hay código ni documentación local en este encargo. El corpus confirmado es Jira fixture.atlassian.net APP-1/APP-2/APP-3; referencia acuerdos-vigentes-2026-11-02. Los originales completos están disponibles en ese Jira sintético. Aplica el flujo habitual del Refinador. Son datos ficticios. No hace falta revisión adicional del borrador en este encargo."
let failure
try {
  await json("summary.json", summary)
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
    const request = privateRequest(connected, host)
    let deadline = Date.now() + 360_000
    const post = (path, input, timeout = 30_000) => request("POST", path, input, Math.min(timeout, deadline - Date.now()))
    const read = path => request("GET", path, undefined, Math.min(30_000, deadline - Date.now()))
    // Only the access token enters the private in-memory server. Never read auth.json or refresh.
    const result = await post("/api/credential", { integrationID: model.providerID, value: { ...auth.value, refresh: "" } })
    assert.ok(result)
    const rpc = async input => (await post("/api/rpc/delegation-test/run", { input })).output
    const observe = async input => (await post("/api/rpc/delegation-model-observer/run", { input }, deadline - Date.now())).output
    const wait = (id, phase) => nativeWait(request, id, deadline, record, phase)
    const loadStates = async () => {
      const control = join(host, "informes-agente/sesiones/.control")
      return Promise.all((await readdir(control)).map(async dir => JSON.parse(await readFile(join(control, dir, "state.json"), "utf8"))))
    }
    const parent = (await post("/api/session", { agent: "refinador", model, title: "S07 model" })).data
    summary.sessionID = parent.id
    await json("summary.json", summary)
    try {
      await post(`/api/session/${parent.id}/prompt`, { text: prompt })
      await record({ type: "prompt.sent", sessionID: parent.id, at: Date.now() })
      const { admission: initialAdmission } = await observe({ parentID: parent.id, inputType: "user" })
      await record({ type: "prompt.admitted", sessionID: parent.id, ...initialAdmission, at: Date.now() })
      await wait(parent.id, "initial-parent")
      const initial = await captureSessions(read, parent, (name, value) => json(`initial-${name}`, value), summary)
      // Native waits only: no result requests, steering, polling or workflow repair.
      await Promise.all(initial.filter(s => s.id !== parent.id).map(child => wait(child.id, "descendant")))
      const settled = await captureSessions(read, parent, (name, value) => json(`settled-${name}`, value), summary)
      const background = new Set(settled.find(s => s.id === parent.id).messages.flatMap(m => m.content ?? [])
        .filter(p => p.type === "tool" && p.name === "subagent" && p.state?.input?.background === true && p.state.input.sessionID)
        .map(p => p.state.input.sessionID))
      const admissions = await Promise.all([...background].map(async childSessionID => {
        const child = settled.find(s => s.id === childSessionID)
        const result = child?.messages.findLast(m => m.type === "assistant" && m.finish === "stop")
        assert.ok(result, "Native child final message required before notification admission")
        const target = notificationTarget(child, result)
        await record({ type: "notification.wait", childSessionID, ...target, at: Date.now() })
        const { admission } = await observe({ parentID: parent.id, childSessionID, resultSha256: target.resultSha256 })
        assert.equal(admission.correlation, "content_match", "Notification correlation is indeterminate; no native result ID is supplied")
        await record({ type: "notification.admitted", childSessionID, ...target, ...admission, at: Date.now() })
        return { childSessionID, target, admission }
      }))
      await wait(parent.id, "after-admission")
      const sessions = await captureSessions(read, parent, json, summary)
      const events = (await rpc({ action: "events" })).events
      await json("events.json", events)
      const states = await loadStates()
      await json("states.json", states)
      const { candidate, executions, linked } = verifyCandidate(states, parent.id, sessions)
      for (const { childSessionID, target, admission } of admissions) {
        const child = sessions.find(s => s.id === childSessionID)
        assert.equal(executions.find(e => e.sessionID === childSessionID)?.result.messageID, target.expectedResultMessageID)
        verifyNotification(admission, sessions.find(s => s.id === parent.id), child,
          child.messages.find(m => m.id === target.expectedResultMessageID))
      }
      await Promise.all(linked.map(operation => verifyPublicationBytes(operation)))
      summary.verifiedResultArtifacts = linked.map(op => ({ artifactID: op.artifact.id, manifestHash: op.artifact.manifestHash }))
      const files = await verifyPublicationBytes(candidate)
      const calls = (await readFile(join(host, "fixture-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
      await json("fixture-calls.json", calls)
      verifyFixtureReads(calls, executions, sessions)
      await json("notification-events.json", (await observe({ action: "events" })).events)
      const ranges = continuationRanges(executions, events)
      summary.ranges = ranges
      assert.ok(Math.max(...ranges.map(r => r.start)) < Math.min(...ranges.map(r => r.end)), "Model must choose overlapping continuations within configured limit two")
      await json("review-required.json", reviewChecklist(candidate, files))
      summary.mechanicalCheck = "passed"
      summary.check = "review_required"
      summary.sufficientFor75 = false
      console.log("Mechanical checks passed; separate semantic/workflow review required. 7.5 remains unaccepted.")
    } catch (error) {
      deadline = Date.now() + 45_000
      await recoverFailure({ error, summary, parent, read, rpc, observe, save: json, loadStates,
        post: (path, input, timeout) => request("POST", path, input, timeout) })
    }
  }, ["delegation-test", "delegation-model-fixture", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
} catch (error) {
  failure = error
  summary.check = "failed"; summary.error ??= error.message
} finally {
  try {
    summary.activeCredentialUnchanged = hash(JSON.stringify(credential())) === originalCredentialHash
    assert.ok(summary.activeCredentialUnchanged, "Shared credential changed during check")
  } catch (error) {
    summary.credentialCheckError = error.message
    summary.check = "failed"
    failure ??= error
  }
  summary.finished = new Date().toISOString()
  await json("summary.json", summary)
}
if (failure) throw failure
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.env.OPENCODE_TEST_MODEL_CONSENT, "yes", "Explicit opt-in required")
  if (process.argv[2] === "--worker") await main(process.argv[3])
  else {
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s07-model-"))
    console.log(`Evidence: ${root}`)
    try {
      await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)), timeout: 600_000 })
    } catch (error) {
      const path = join(root, "summary.json")
      const summary = await readFile(path, "utf8").then(JSON.parse).catch(() => ({ scope: "7.5 only", root }))
      summary.activeCredentialUnchanged ??= "unknown"
      Object.assign(summary, { check: "failed", supervisionError: error.message, cleanupError: error.cleanupError, finished: new Date().toISOString() })
      await writeFile(path, JSON.stringify(summary, null, 2) + "\n")
      throw error
    }
  }
}
