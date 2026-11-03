import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import test from "node:test"
import { captureSessions, continuationRanges, nativeWait, privateRequest, recoverFailure, reviewChecklist, runBounded,
  notificationTarget, verifyCandidate, verifyFixtureReads, verifyNotification, verifyPublicationBytes } from "./test-support/delegation/verify-model.mjs"
import { createNotifications } from "./test-support/delegation/model-fixture/observer.mjs"
import { api, withServer } from "./test-support/opencode.mjs"

const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

const parent = { id: "ses_root" }
const contract = { paths: Object.fromEntries([
  ["/api/info", "server.info"], ["/api/session", "session.list"], ["/api/session/{sessionID}", "session.get"],
  ["/api/session/{sessionID}/message", "session.message.list"],
].map(([path, operationId]) => [path, { get: { operationId, parameters: ["limit", "cursor", "order"].map(name => ({ name })) } }])) }

function fixture() {
  const calls: string[] = []
  const read = async (path: string) => {
    calls.push(path)
    if (path === "/openapi.json") return contract
    if (path === "/api/info") return { version: "2.1.2" }
    if (path === "/api/session/ses_root") return { data: parent }
    const url = new URL(path, "http://fixture"), cursor = url.searchParams.get("cursor")
    if (url.pathname === "/api/session") {
      const owner = url.searchParams.get("parentID")
      return owner === "ses_root" && !cursor ? { data: [{ id: "ses_child", parentID: owner }], cursor: { next: "root-page-2" } }
        : owner === "ses_root" || cursor === "root-page-2" ? { data: [{ id: "ses_other", parentID: "ses_root" }], cursor: { next: null } }
        : owner === "ses_child" ? { data: [{ id: "ses_grandchild", parentID: owner }], cursor: { next: null } }
        : { data: [], cursor: { next: null } }
    }
    return { data: [{ id: cursor ? "msg_last" : "msg_first", type: "assistant", time: { created: 1, completed: 2 }, finish: "stop",
      native: { secret: "RAW_NATIVE" }, content: [{ type: "reasoning", text: "RAW_REASONING" }, { type: "text", text: "Useful evidence" }] }],
      cursor: { next: cursor ? null : "message-page-2" } }
  }
  return { calls, read }
}

test("S07 driver: adquiere árbol e historial completos, no solo hijos/contexto activo", async () => {
  const { calls, read } = fixture(), saved = new Map<string, any>()
  const sessions = await captureSessions(read, parent, async (name: string, value: any) => { saved.set(name, structuredClone(value)) })
  assert.deepEqual(sessions.map((s: any) => s.id), ["ses_root", "ses_child", "ses_other", "ses_grandchild"])
  assert.equal(saved.get("ses_grandchild.json").length, 2)
  assert.ok(!calls.some(path => path.includes("/context")))
  assert.ok(!JSON.stringify([...saved]).includes("RAW_"))
})

test("S07 driver: fallo al capturar no sustituye timeout ni evita interrupción de hijos", async () => {
  const original = new Error("native wait budget exhausted"), interrupted: string[] = [], saved = new Map<string, any>()
  const summary: any = { sessions: [parent, { id: "ses_child", parentID: parent.id }] }
  await assert.rejects(recoverFailure({ error: original, summary, parent,
    read: async () => { throw new Error("capture unavailable") },
    post: async (path: string) => { interrupted.push(path) }, rpc: async () => ({ events: [{ id: "evt_partial" }] }),
    save: async (name: string, value: any) => { saved.set(name, structuredClone(value)) },
  }), error => error === original)
  assert.deepEqual(interrupted.sort(), ["/api/session/ses_child/interrupt?resume=false", "/api/session/ses_root/interrupt?resume=false"])
  assert.equal(saved.get("events.json")[0].id, "evt_partial")
  assert.equal(summary.check, "failed")
})

test("S07 driver: conserva páginas previas y estados/eventos si una página posterior falla", async () => {
  const { read } = fixture(), original = new Error("wait timeout"), saved = new Map<string, any>(), summary: any = {}
  await assert.rejects(recoverFailure({ error: original, summary, parent,
    read: async (path: string) => {
      if (path.includes("message?limit=200&cursor=")) throw new Error("second page unavailable")
      return read(path)
    }, post: async () => {}, rpc: async () => ({ events: ["event retained"] }), loadStates: async () => ["state retained"],
    save: async (name: string, value: any) => { saved.set(name, structuredClone(value)) },
  }), e => e === original)
  assert.equal(saved.get("partial-ses_root.json")[0].id, "msg_first")
  assert.deepEqual(saved.get("states.json"), ["state retained"])
  assert.deepEqual(saved.get("events.json"), ["event retained"])
  assert.equal(summary.coverage.messages.ses_root, "partial")
  assert.equal(summary.coverage.tree, "partial")
  assert.equal(summary.interruptRequests.length, 4)
  assert.match(summary.evidenceErrors[0].error, /second page/)
})

test("S07 driver: rechazo de interrupción queda visible sin ocultar el error primario", async () => {
  const original = new Error("original failure"), summary: any = {}
  await assert.rejects(recoverFailure({ error: original, summary, parent, read: async () => { throw new Error("unavailable") },
    post: async () => { throw new Error("interrupt rejected") }, rpc: async () => { throw new Error("observer unavailable") }, save: async () => {},
  }), e => e === original)
  assert.ok(summary.evidenceErrors.some((e: any) => e.stage === "interrupt:ses_root" && e.error === "interrupt rejected"))
  assert.deepEqual(summary.interruptRequests, [])
})

function candidateFixture() {
  const final = (id: string, text: string) => ({ id, type: "assistant", finish: "stop", time: { completed: 20 }, content: [{ type: "text", text }] })
  const sessions: any[] = [{ ...parent, agent: "refinador", messages: [] }]
  const main: any = { id: "work_main", rootSessionID: parent.id, ownerSessionID: parent.id, corpus: "fixture", referencia: "v1" }
  const required = ["a", "b"].map(suffix => {
    const id = `ses_${suffix}`, workID = `work_${suffix}`, executionID = `exec_${suffix}`, text = `Result ${suffix}`
    const execution = { id: executionID, sessionID: id, preparationMessageID: `msg_preparation${suffix}`, inputMessageID: `msg_input${suffix}`,
      startMessageID: `msg_start${suffix}`, state: "integrado", result: { messageID: `msg_result${suffix}`,
        sha256: hash(JSON.stringify([id, `msg_input${suffix}`, `msg_result${suffix}`, text, null, null])) },
      confirmation: { sessionID: parent.id, messageID: `msg_confirm${suffix}`, source: "declaracion_coordinador",
        efecto: "Pregunta/corpus/referencia contrastados", siguiente_accion: "Enviar CONFIRMAR a la misma sesión" },
      integration: { sessionID: parent.id, messageID: `msg_integrate${suffix}`, source: "declaracion_coordinador", efecto: `Rule ${suffix} integrated`, siguiente_accion: "Publish" } }
    sessions.push({ id, parentID: parent.id, agent: "investigador", messages: [final(execution.preparationMessageID, "PENDIENTE_CONFIRMACION"),
      { id: execution.inputMessageID, type: "user", text: `CONFIRMAR ${workID} ${executionID}` }, final(execution.startMessageID, "Started"),
      final(execution.result.messageID, text), { type: "idle" }] })
    return { ...main, id: workID, pregunta: `Q${suffix}`, parentID: main.id, responsibleSessionID: id, required: true, executions: [execution] }
  })
  const args = { nombre: "borrador.md", contenido: "content", encargo_id: main.id, operacion_id: "candidate" }
  const operation = fixturePublication("artifact_candidate", main, parent.id, "msg_publication", args)
  Object.assign(operation.artifact, { closure: { estado: "completo", cobertura: "registrada",
      dependencias: required.map(w => ({ encargo_id: w.id, ejecucion_id: w.executions[0].id, estado: "integrado", resultado_hash: w.executions[0].result.sha256 })) } }
  )
  operation.result.cierre = structuredClone(operation.artifact.closure)
  const f = { states: [{ work: Object.fromEntries([main, ...required].map(w => [w.id, w])), operations: { publication: operation },
    artifacts: { [operation.artifact.id]: structuredClone(operation.artifact) } }], sessions, required, operation, publicationArgs: args }
  refreshFixtureTraces(f)
  return f
}

function toolMessage(id: string, name: string, input: any, output: any) {
  return { id, type: "assistant", finish: "tool-calls", time: { completed: 20 }, content: [{ type: "tool", id: `call_${id}`, name,
    state: { status: "completed", input: structuredClone(input), content: [{ type: "text", text: JSON.stringify(output) }] } }] }
}

function fixturePublication(id: string, work: any, producerSessionID: string, producerMessageID: string, args: any): any {
  const type = "publish_agent_deliverable", base = join(temp, "s07-driver-synthetic-bytes"), path = `${producerSessionID}/${args.nombre}`
  const paths = { [args.nombre]: join(base, path) }, files = [{ path, sha256: hash(args.contenido), bytes: Buffer.byteLength(args.contenido) }]
  const artifact = { id, rootSessionID: parent.id, producerSessionID, producerMessageID, workID: work.id, type,
    agent: producerSessionID === parent.id ? "refinador" : "investigador", files, manifestHash: hash(JSON.stringify(files)), origin: { type: "literal" } }
  return { id: `op_${id}`, type, logicalID: args.operacion_id, phase: "confirmed", producerSessionID, agent: artifact.agent, artifact, paths,
    digest: hash(JSON.stringify({ type, topic: args.nombre, group: null, delivery: null, files: [[args.nombre, args.contenido]],
      sources: [], decisions: [], keys: [], workID: work.id })),
    result: { guardado: true, artefacto_id: id, hash_manifiesto: artifact.manifestHash, operacion_id: args.operacion_id,
      archivos: files, rutas: paths, sesion: base } }
}

function refreshFixtureTraces(f: any) {
  const parentMessages: any[] = [{ id: "msg_objective", type: "user", text: "Synthetic objective" },
    { id: "msg_receipt", type: "assistant", finish: "stop", content: [{ type: "text", text: "Generic assistant, no tool call" }] }]
  const resultMessages: any[] = []
  for (const work of f.required) {
    const e = work.executions[0], queued = structuredClone(e), started = structuredClone(e), available = structuredClone(e)
    for (const key of ["inputMessageID", "startMessageID", "result", "integration"]) delete queued[key]
    queued.state = "en_cola"
    delete started.result; delete started.integration; started.state = "en_curso"
    delete available.integration; available.state = "resultado_disponible"
    const out = (execution: any) => ({ guardado: true, encargo: { ...structuredClone(work), executions: [execution] }, ejecucion: execution })
    parentMessages.push(toolMessage(e.confirmation.messageID, "session_work", { action: "confirm", encargo_id: work.id,
      pregunta: work.pregunta, corpus: work.corpus, referencia: work.referencia, preparacion_message_id: e.preparationMessageID }, out(queued)))
    resultMessages.push(toolMessage(`msg_record_${work.id}`, "session_work", { action: "result", encargo_id: work.id, ejecucion_id: e.id,
      resultado_message_id: e.result.messageID, ...(e.result.artifactID ? { artefacto_id: e.result.artifactID } : {}) }, out(available)),
    toolMessage(e.integration.messageID, "session_work", { action: "integrate", encargo_id: work.id, ejecucion_id: e.id,
      resultado_hash: e.result.sha256, efecto: e.integration.efecto, siguiente_accion: e.integration.siguiente_accion }, out(structuredClone(e))))
    const child = f.sessions.find((s: any) => s.id === e.sessionID)
    child.messages[child.messages.findIndex((m: any) => m.id === e.startMessageID)] = toolMessage(e.startMessageID, "session_work",
      { action: "start", encargo_id: work.id, ejecucion_id: e.id }, out(started))
  }
  f.sessions[0].messages = [...parentMessages, ...resultMessages, toolMessage("msg_publication", "publish_agent_deliverable", f.publicationArgs, f.operation.result), { type: "idle" }]
  f.states[0].artifacts[f.operation.artifact.id] = structuredClone(f.operation.artifact)
}

test("S07 driver: candidata/raíz/requeridos/ejecuciones/hashes exactos; integradas ajenas no satisfacen pendientes", () => {
  const valid = candidateFixture()
  assert.equal(verifyCandidate(valid.states, parent.id, valid.sessions).executions.length, 2)
  for (const corrupt of [
    (f: any) => { f.operation.artifact.rootSessionID = "ses_other" },
    (f: any) => { f.operation.artifact.workID = "work_unrelated" },
    (f: any) => { f.operation.artifact.closure.dependencias[0].encargo_id = "work_unrelated" },
    (f: any) => { f.operation.artifact.closure.dependencias[0].resultado_hash = "unrelated hash" },
    (f: any) => { f.required[0].executions[0].result.sha256 = "wrong native result" },
    (f: any) => { f.required[0].executions[0].state = "en_curso"; f.states[0].work.work_decoy = { ...f.required[1], id: "work_decoy", parentID: "work_other" } },
    (f: any) => {
      for (const [i, work] of f.required.entries()) {
        f.states[0].work[`work_decoy${i}`] = { ...work, id: `work_decoy${i}`, parentID: "work_unrelated" }
        work.executions = []
        f.operation.artifact.closure.dependencias[i].estado = "impedimento_concreto"
      }
    },
    (f: any) => { f.required[1].responsibleSessionID = "ses_other" },
  ]) {
    const f = candidateFixture(); corrupt(f)
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
})

test("S07 revisión: recibos y publicación requieren llamadas reales, no solo IDs assistant", () => {
  for (const corrupt of [
    (f: any) => { delete f.required[0].executions[0].confirmation },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content = [{ type: "text", text: "Generic assistant" }] },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === f.required[0].executions[0].integration.messageID).content = [{ type: "text", text: "Generic receipt" }] },
  ]) {
    const f = candidateFixture(); corrupt(f)
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
})

function rehashResult(f: any) {
  for (const [i, work] of f.required.entries()) {
    const e = work.executions[0], result = f.sessions.find((s: any) => s.id === e.sessionID).messages.find((m: any) => m.id === e.result.messageID)
    e.result.sha256 = hash(JSON.stringify([e.sessionID, e.inputMessageID, result.id,
      result.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"), e.result.artifactID ?? null, e.result.manifestHash ?? null]))
    f.operation.artifact.closure.dependencias[i].resultado_hash = e.result.sha256
  }
  f.operation.result.cierre = structuredClone(f.operation.artifact.closure)
  refreshFixtureTraces(f)
}

function artifactFixture(): any {
  const f: any = candidateFixture(), work = f.required[0], e = work.executions[0]
  const args = { nombre: "evidence.md", contenido: "Complete child artifact\r\nUnicode ñ\n", encargo_id: work.id, operacion_id: "child-result" }
  const operation = fixturePublication("artifact_child", work, e.sessionID, "msg_artifacta", args)
  f.states[0].operations.child = operation
  f.states[0].artifacts[operation.artifact.id] = structuredClone(operation.artifact)
  const child = f.sessions.find((s: any) => s.id === e.sessionID)
  child.messages.splice(child.messages.findIndex((m: any) => m.id === e.result.messageID), 0,
    toolMessage(operation.artifact.producerMessageID, operation.type, args, operation.result))
  Object.assign(e.result, { artifactID: operation.artifact.id, manifestHash: operation.artifact.manifestHash })
  f.source = operation; f.sourceArgs = args
  rehashResult(f)
  return f
}

test("S07 revisión: argumentos/resultados y mensajes equivocados de herramientas quedan rechazados", () => {
  for (const corrupt of [
    (f: any) => { f.required[0].executions[0].confirmation.messageID = "msg_receipt" },
    (f: any) => { f.required[0].executions[0].integration.messageID = "msg_receipt" },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === "msg_confirma").content[0].state.input.corpus = "other" },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === "msg_integratea").content[0].state.input.resultado_hash = "wrong" },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === "msg_record_work_a").content = [] },
    (f: any) => { f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content[0].state.input.contenido = "different bytes" },
    (f: any) => {
      const content = f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content[0].state.content[0]
      const output = JSON.parse(content.text); output.artefacto_id = "wrong"; content.text = JSON.stringify(output)
    },
  ]) {
    const f = candidateFixture(); corrupt(f)
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
})

test("S07 índice: finish confirmado con aviso de proyección es válido y conserva el aviso en evidencia", async () => {
  const f = candidateFixture(), indice = { actualizado: false,
    aviso: "Publicación confirmada; índice pendiente de reparación. Reintenta con la misma operacion_id y petición." }
  // Faithful finish() response: the confirmed record has no indice; only the returned value does.
  const content = f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content[0].state.content[0]
  content.text = JSON.stringify({ ...f.operation.result, indice })
  assert.doesNotThrow(() => verifyCandidate(f.states, parent.id, f.sessions))
  assert.equal("indice" in f.operation.result, false)
  assert.deepEqual(JSON.parse(content.text).indice, indice)
  const { read } = fixture(), saved = new Map<string, any>()
  await captureSessions(async path => new URL(path, "http://fixture").pathname === "/api/session/ses_root/message"
    ? { data: f.sessions[0].messages.map((m: any, i: number) => m.id ? m : { ...m, id: `msg_idle${i}` }), cursor: { next: null } } : read(path), parent,
  async (name: string, value: any) => { saved.set(name, structuredClone(value)) })
  assert.ok(JSON.stringify(saved.get("ses_root.json")).includes(indice.aviso))
})

test("S07 índice: aviso malformado y divergencias del resultado confirmado siguen rechazados", () => {
  const valid = { actualizado: false, aviso: "Projection warning" }
  const invalid = [null, [], "warning", { actualizado: true, aviso: "wrong state" }, { actualizado: false },
    { actualizado: false, aviso: 42 }, { ...valid, extra: true }]
  for (const indice of invalid) {
    const f = candidateFixture(), content = f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content[0].state.content[0]
    content.text = JSON.stringify({ ...f.operation.result, indice })
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
  for (const changes of [{ artefacto_id: "different" }, { guardado: false }, { unexpected: true }]) {
    const f = candidateFixture(), content = f.sessions[0].messages.find((m: any) => m.id === "msg_publication").content[0].state.content[0]
    content.text = JSON.stringify({ ...f.operation.result, ...changes, indice: valid })
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
})

test("S07 revisión: artefacto confirmado fiel exige encargo/productor/manifiesto y continuación exactos", () => {
  const valid = artifactFixture()
  assert.equal(verifyCandidate(valid.states, parent.id, valid.sessions).linked[0].artifact.id, "artifact_child")
  for (const corrupt of [
    (f: any) => { delete f.states[0].artifacts.artifact_child },
    (f: any) => { f.source.phase = "prepared" },
    (f: any) => { f.required[0].executions[0].result.manifestHash = hash("different manifest"); rehashResult(f) },
    (f: any) => { f.source.artifact.workID = "work_unrelated"; f.states[0].artifacts.artifact_child = structuredClone(f.source.artifact) },
    (f: any) => { f.source.artifact.producerSessionID = "ses_other"; f.states[0].artifacts.artifact_child = structuredClone(f.source.artifact) },
    (f: any) => { f.source.artifact.producerMessageID = "msg_preparationa"; f.states[0].artifacts.artifact_child = structuredClone(f.source.artifact) },
    (f: any) => { f.source.result.hash_manifiesto = hash("wrong result manifest") },
  ]) {
    const f = artifactFixture(); corrupt(f)
    assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
  }
})

test("S07 revisión: bytes de candidata Y artefacto de resultado se leen y contrastan, sin sustituir control", async t => {
  const f = artifactFixture(), root = await mkdtemp(join(temp, "s07-driver-artifact-"))
  for (const [operation, args] of [[f.operation, f.publicationArgs], [f.source, f.sourceArgs]]) {
    operation.result.sesion = root
    operation.paths[args.nombre] = join(root, operation.artifact.files[0].path)
    operation.result.rutas = operation.paths
    await mkdir(dirname(operation.paths[args.nombre]), { recursive: true })
    await writeFile(operation.paths[args.nombre], args.contenido)
  }
  refreshFixtureTraces(f)
  const child = f.sessions.find((s: any) => s.id === "ses_a")
  child.messages[child.messages.findIndex((m: any) => m.id === "msg_artifacta")] = toolMessage("msg_artifacta", f.source.type, f.sourceArgs, f.source.result)
  const { candidate, linked } = verifyCandidate(f.states, parent.id, f.sessions)
  assert.equal((await verifyPublicationBytes(candidate))[0].content, "content")
  assert.equal((await verifyPublicationBytes(linked[0]))[0].content, f.sourceArgs.contenido)
  await writeFile(f.source.paths["evidence.md"], "Changed child bytes")
  await assert.rejects(verifyPublicationBytes(linked[0]), /bytes changed/)
  await writeFile(join(root, "verification.json"), JSON.stringify({ root, candidateID: candidate.artifact.id, linkedID: linked[0].artifact.id,
    originalBytesVerified: true, deliberateChildMutationRejected: true }))
  t.diagnostic(`Retained artifact-byte evidence, including deliberate mutation: ${root}`)
})

test("S07 revisión: contenido repetido o formato desconocido deja correlación indeterminada", async () => {
  const result = (id: string) => ({ id, type: "assistant", finish: "stop", content: [{ type: "text", text: "same result" }] })
  assert.throws(() => notificationTarget({ id: "ses_child", messages: [result("msg_old"), result("msg_new")] }, result("msg_new")), /ambiguous/)
  const abort = new AbortController(), observer = createNotifications(abort.signal)
  const waiting = observer.wait({ parentID: parent.id, childSessionID: "ses_child", resultSha256: hash("same result") })
  observer.observe({ type: "session.inbox.enqueued", data: { sessionID: parent.id, inboxID: "msg_unknown", item: { type: "synthetic", payload: {
    text: "Unknown/truncated native envelope", metadata: { source: "subagent", childID: "ses_child", state: "completed" } } } } })
  observer.observe({ type: "session.inbox.delivered", data: { sessionID: parent.id, inboxID: "msg_unknown" } })
  observer.observe({ type: "session.step.started", data: { sessionID: parent.id, assistantMessageID: "msg_parent" } })
  const admission: any = await waiting
  assert.equal(admission.correlation, "indeterminate")
  assert.throws(() => verifyNotification(admission, { id: parent.id, messages: [] }, { id: "ses_child", messages: [result("msg_new")] }, result("msg_new")), /indeterminate/)
  abort.abort()
})

test("S07 revisión: interrupt false es respuesta válida, no cancelación acreditada", async () => {
  const summary: any = {}
  await assert.rejects(recoverFailure({ error: new Error("primary"), summary, parent, read: async () => { throw new Error("unavailable") },
    post: async () => ({ interrupted: false }), rpc: async () => ({ events: [] }), save: async () => {},
  }), /primary/)
  assert.deepEqual(summary.interruptRequests, [{ sessionID: parent.id, request: "succeeded", interrupted: false }])
  assert.ok(!("interrupted" in summary))
})

test("S07 revisión: artefacto de resultado inexistente no pasa con hash/dep recalculados", () => {
  const f: any = candidateFixture()
  Object.assign(f.required[0].executions[0].result, { artifactID: "artifact_missing", manifestHash: hash("missing") })
  rehashResult(f)
  assert.throws(() => verifyCandidate(f.states, parent.id, f.sessions))
})

test("S07 revisión: notificación tardía no hereda el último step del hijo", async () => {
  const signal = new AbortController(), observer = createNotifications(signal.signal)
  const emit = (type: string, data: any) => observer.observe({ type: `session.${type}`, data })
  let newerResolved = false
  const newer = observer.wait({ parentID: parent.id, childSessionID: "ses_child", resultMessageID: "msg_new", resultSha256: hash("NEW RESULT") })
    .then(() => { newerResolved = true })
  const older = observer.wait({ parentID: parent.id, childSessionID: "ses_child", resultMessageID: "msg_old", resultSha256: hash("OLD RESULT") })
  try {
    emit("step.ended", { sessionID: "ses_child", assistantMessageID: "msg_old" })
    emit("step.ended", { sessionID: "ses_child", assistantMessageID: "msg_new" })
    const notice = { sessionID: parent.id, inboxID: "msg_old_notice", item: { type: "synthetic", payload: {
      metadata: { source: "subagent", childID: "ses_child", state: "completed" },
      text: '<subagent sessionID="ses_child" state="completed">\nOLD RESULT\n</subagent>',
    } } }
    emit("inbox.enqueued", notice); emit("inbox.enqueued", notice)
    emit("inbox.delivered", { sessionID: parent.id, inboxID: notice.inboxID })
    emit("step.started", { sessionID: parent.id, assistantMessageID: "msg_parent" })
    await Promise.resolve(); await Promise.resolve()
    assert.equal(newerResolved, false)
    const admission: any = await older
    assert.equal(admission.inboxID, "msg_old_notice")
    assert.ok(!("resultMessageID" in admission), "No native result ID exists in notification metadata")
  } finally { signal.abort(); await Promise.allSettled([newer, older]) }
})

test("S07 revisión: mencionar ses_child sin procedencia subagent no es notificación", async () => {
  const signal = new AbortController(), observer = createNotifications(signal.signal)
  let resolved = false
  const waiting = observer.wait({ parentID: parent.id, childSessionID: "ses_child", resultMessageID: "msg_new", resultSha256: hash("NEW RESULT") })
    .then(() => { resolved = true })
  try {
    for (const [type, data] of [
      ["step.ended", { sessionID: "ses_child", assistantMessageID: "msg_new" }],
      ["inbox.enqueued", { sessionID: parent.id, inboxID: "msg_mention", item: { type: "synthetic", payload: {
        text: '<subagent sessionID="ses_child" state="completed">\nNEW RESULT\n</subagent>', metadata: { source: "manual", childID: "ses_child", state: "completed" } } } }],
      ["inbox.delivered", { sessionID: parent.id, inboxID: "msg_mention" }],
      ["step.started", { sessionID: parent.id, assistantMessageID: "msg_parent" }],
    ] as const) observer.observe({ type: `session.${type}`, data })
    await Promise.resolve(); await Promise.resolve()
    assert.equal(resolved, false)
  } finally { signal.abort(); await Promise.allSettled([waiting]) }
})

test("S07 driver: preparaciones repetidas solapadas no acreditan continuaciones secuenciales", () => {
  const event = (sessionID: string, type: string, messageID?: string) => ({ sessionID, type: `session.${type}`, messageID })
  const events = [event("ses_a", "execution.started"), event("ses_a", "execution.succeeded"),
    event("ses_b", "execution.started"), event("ses_b", "execution.succeeded"),
    event("ses_a", "execution.started"), event("ses_b", "execution.started"), event("ses_a", "execution.succeeded"), event("ses_b", "execution.succeeded"),
    event("ses_a", "execution.started"), event("ses_a", "step.started", "msg_starta"), event("ses_a", "step.ended", "msg_resulta"), event("ses_a", "execution.succeeded"),
    event("ses_b", "execution.started"), event("ses_b", "step.started", "msg_startb"), event("ses_b", "step.ended", "msg_resultb"), event("ses_b", "execution.succeeded")]
  const f = candidateFixture(), ranges = continuationRanges(f.required.flatMap(w => w.executions), events)
  assert.deepEqual(ranges.map(r => [r.start, r.end]), [[8, 11], [12, 15]])
  assert.equal(Math.max(...ranges.map(r => r.start)) < Math.min(...ranges.map(r => r.end)), false)
})

test("S07 driver: lecturas APP-2/APP-3 completas en continuaciones exactas, no solo llamadas iniciadas", () => {
  const f = candidateFixture(), executions = f.required.flatMap(w => w.executions)
  const records = [["APP-1", parent.id, "msg_receipt"], ["APP-2", "ses_a", "msg_starta"], ["APP-3", "ses_b", "msg_startb"]]
    .flatMap(([key, sessionID, messageID]) => ["started", "completed"].map((state, time) => ({ key, sessionID, messageID, callID: key, name: "getJiraIssue", state, time })))
  verifyFixtureReads(records, executions, f.sessions)
  assert.throws(() => verifyFixtureReads(records.filter(c => !(c.key === "APP-3" && c.state === "completed")), executions, f.sessions), /APP-3/)
  assert.throws(() => verifyFixtureReads(records.map(c => c.key === "APP-3" ? { ...c, messageID: "msg_preparationb" } : c), executions, f.sessions), /exact continuations/)
})

test("S07 driver: APP-48/APP-7 y prosa contradictoria nunca pasan por coincidencia numérica", () => {
  const f = candidateFixture(), content = "APP-48/APP-7. Cancelar siempre incluso tras expedición. Abonar sin plazo"
  f.operation.artifact.files = [{ path: "borrador.md", sha256: hash(content), bytes: Buffer.byteLength(content) }]
  f.operation.artifact.manifestHash = hash(JSON.stringify(f.operation.artifact.files))
  const checklist = reviewChecklist(f.operation, [{ path: "borrador.md", content, sha256: hash(content) }])
  assert.equal(checklist.status, "review_required")
  assert.equal(checklist.sufficientFor75, false)
  assert.equal(checklist.semantic.length, 5)
  assert.ok(checklist.semantic.every(c => c.verdict === "pending" && c.contradictionCheck === "pending" && c.candidateReferences.length === 0))
  assert.match(JSON.stringify(checklist), /48 horas naturales desde la compra/)
  assert.match(JSON.stringify(checklist), /rechazar sin modificar la compra/)
  assert.match(JSON.stringify(checklist), /7 días naturales desde la aceptación/)
  assert.match(JSON.stringify(checklist), /fecha límite calculada desde la aceptación/)
  assert.ok(checklist.workflow.every(c => c.verdict === "pending"))
  assert.throws(() => reviewChecklist(f.operation, [{ path: "borrador.md", content, sha256: "wrong" }]), /verified candidate bytes/)
})

test("S07 driver: hijo terminado no permite esperar/publicar padre antes de admisión y nueva generación nativas", async () => {
  const abort = new AbortController(), observer = createNotifications(abort.signal), order: string[] = []
  const observe = (type: string, data: any) => observer.observe({ type: `session.${type}`, data, created: order.length })
  const waiting = observer.wait({ parentID: parent.id, childSessionID: "ses_a", resultSha256: hash("SECRET_PAYLOAD") }).then(() => order.push("admitted"))
  observe("step.ended", { sessionID: "ses_a", assistantMessageID: "msg_resulta" })
  observe("execution.succeeded", { sessionID: "ses_a" })
  await Promise.resolve()
  assert.deepEqual(order, [])
  observe("inbox.enqueued", { sessionID: parent.id, inboxID: "msg_notice", item: { type: "synthetic", payload: {
    text: '<subagent sessionID="ses_a" state="completed">\nSECRET_PAYLOAD\n</subagent>', metadata: { source: "subagent", childID: "ses_a", state: "completed" } } } })
  observe("inbox.delivered", { sessionID: parent.id, inboxID: "msg_other" })
  await Promise.resolve()
  assert.deepEqual(order, [])
  observe("inbox.delivered", { sessionID: parent.id, inboxID: "msg_notice" })
  await Promise.resolve()
  assert.deepEqual(order, [])
  observe("execution.started", { sessionID: parent.id })
  observe("step.started", { sessionID: parent.id, assistantMessageID: "msg_parent_result" })
  await waiting
  await nativeWait(async () => { order.push("parent generation completed") }, parent.id, Date.now() + 1000, async () => {}, "after-admission")
  order.push("publication acquired")
  assert.deepEqual(order, ["admitted", "parent generation completed", "publication acquired"])
  assert.ok(!JSON.stringify(observer.events).includes("SECRET_PAYLOAD"))
  const stale = observer.wait({ parentID: parent.id, childSessionID: "ses_a", resultSha256: hash("different result") })
  abort.abort()
  await assert.rejects(stale, /observer stopped/)
})

test("S07 driver: timeout HTTP acotado conserva traza; abortar wait no cancela ejecución; interrupt usa query", { timeout: 10_000 }, async t => {
  let active = true
  const http = createServer((req, res) => {
    if (req.url?.endsWith("/wait")) return
    if (req.url?.includes("/interrupt")) {
      assert.equal(new URL(req.url, "http://fixture").searchParams.get("resume"), "false")
      active = false; res.writeHead(200, { "content-type": "application/json" }); res.end('{"interrupted":true}'); return
    }
    res.writeHead(500); res.end("unavailable")
  })
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
  t.after(() => { http.closeAllConnections(); http.close() })
  const request = privateRequest({ OPENCODE_TEST_SERVER: `http://127.0.0.1:${(http.address() as any).port}`, OPENCODE_PASSWORD: "synthetic" }, "synthetic")
  const trace: any[] = [], started = Date.now()
  await assert.rejects(nativeWait(request, parent.id, Date.now() + 80, async record => { trace.push(record) }, "probe"), /timeout|aborted/i)
  assert.ok(Date.now() - started < 2000)
  assert.equal(active, true)
  assert.deepEqual(trace.map(e => e.type), ["wait.enter", "wait.error"])
  const summary: any = {}
  await assert.rejects(recoverFailure({ error: new Error("wait timed out"), summary, parent,
    read: path => request("GET", path, undefined, 100), rpc: async () => ({ events: [] }), save: async () => {},
    post: (path, input, timeout) => request("POST", path, input, timeout),
  }), /wait timed out/)
  assert.equal(active, false)
  assert.deepEqual(summary.interruptRequests, [{ sessionID: parent.id, request: "succeeded", interrupted: true }])
})

test("S07 driver: supervisor termina solo su árbol privado dentro del presupuesto y conserva consumidor", { timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(temp, "s07-driver-process-")), pidFile = join(root, "pids.json")
  const script = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    writeFileSync(process.argv[1], JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000)`
  await assert.rejects(runBounded(process.execPath, ["-e", script, pidFile], { cwd: root, timeout: 1500 }), /supervision budget/)
  const pids = JSON.parse(await readFile(pidFile, "utf8"))
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i)
  assert.equal((await readFile(pidFile, "utf8")).length > 0, true)
  t.diagnostic(`Retained synthetic consumer: ${root}`)
})

test("S07 driver: notificación y admisión en OpenCode privado con proveedor programado, sin modelo", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(temp, "s07-driver-native-")), config = join(root, ".opencode")
  let providerRequests = 0
  // Programs the contract only. This never establishes behavior chosen by a model.
  const provider = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk
    providerRequests++
    const messages = JSON.parse(body).messages, index = messages.findLastIndex((m: any) => m.role === "user")
    const text = JSON.stringify(messages[index]?.content), afterTool = messages.slice(index + 1).some((m: any) => m.role === "tool")
    const delegate = text.includes("fixture:delegate") && !afterTool, resume = text.includes("fixture:resume") && !afterTool
    const gate = text.includes("fixture:confirm") && !afterTool
    const name = gate ? "contract_gate" : delegate || resume ? "subagent" : undefined
    const args = gate ? {} : { agent: "investigador", description: "Programmed contract",
      prompt: resume ? "fixture:confirm" : "fixture:prepare", ...(resume ? { sessionID: text.match(/ses_[a-zA-Z0-9]+/)![0], background: true } : {}) }
    const delta = name ? { tool_calls: [{ index: 0, id: "programmed-call", type: "function", function: { name, arguments: JSON.stringify(args) } }] }
      : { content: text.includes("fixture:prepare") ? "PENDIENTE_CONFIRMACION" : "PROGRAMMED final result" }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  await mkdir(config)
  await writeFile(join(config, "opencode.json"), JSON.stringify({ snapshots: false, model: "fixture/test", experimental: { subagent_depth: 4 },
    providers: { fixture: { name: "Programmed, not a model", package: "@opencode/ai/providers/openai-compatible", settings: {
      apiKey: "synthetic", baseURL: `http://127.0.0.1:${(provider.address() as any).port}/v1` }, models: { test: { capabilities: { tools: true } } } } },
    agents: Object.fromEntries(["refinador", "investigador"].map(name => [name, { mode: "all", permissions: [{ action: "*", resource: "*", effect: "allow" }] }])) }))
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config/opencode"), OPENCODE_CONFIG: "", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1", OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1", OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [
      new URL("./test-support/delegation", import.meta.url).href, new URL("./test-support/delegation/model-fixture", import.meta.url).href] }) }
  delete env.OPENCODE_SESSION_ID
  await withServer(root, env, async connected => {
    const request = privateRequest(connected, root)
    const call = async (input: object) => (await request("POST", "/api/rpc/delegation-test/run", { input })).output
    const session = api("post", "/api/session", root, connected, { agent: "refinador", title: "No provider calls" }).data
    const catalog = await call({ action: "agents" })
    const tool = catalog.tools.find((name: string) => name.endsWith("getAccessibleAtlassianResources"))
    assert.ok(tool)
    await call({ tool, args: {}, sessionID: session.id, messageID: "msg_probe", agent: "refinador" })
    const calls = (await readFile(join(root, "fixture-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    assert.deepEqual(calls.map((c: any) => c.state), ["started", "completed"])
    assert.ok(calls.every((c: any) => c.sessionID === session.id && c.messageID === "msg_probe" && c.callID))
    const observer = await request("POST", "/api/rpc/delegation-model-observer/run", { input: { action: "events" } })
    assert.ok(Array.isArray(observer.output.events))
    const observed = async (input: object) => (await request("POST", "/api/rpc/delegation-model-observer/run", { input })).output
    const record = async (value: any) => { await writeFile(join(root, "last-wait.json"), JSON.stringify(value)) }
    const deadline = Date.now() + 20_000
    api("post", `/api/session/${session.id}/prompt`, root, connected, { text: "fixture:delegate" })
    const initial = await observed({ parentID: session.id, inputType: "user" })
    assert.ok(initial.admission.parentMessageID)
    await nativeWait(request, session.id, deadline, record, "prepare")
    const prepared = api("get", `/api/session/${session.id}/context`, root, connected).data
    const child = prepared.flatMap((m: any) => m.content ?? []).find((p: any) => p.name === "subagent").state.metadata.sessionID
    api("post", `/api/session/${session.id}/prompt`, root, connected, { text: `fixture:resume ${child}` })
    await call({ action: "gate", sessionID: child })
    await nativeWait(request, session.id, deadline, record, "background-return")
    let admitted = false
    await call({ action: "release", sessionID: child })
    await nativeWait(request, child, deadline, record, "child-result")
    const context = api("get", `/api/session/${child}/context`, root, connected).data
    const resultMessageID = context.findLast((m: any) => m.type === "assistant" && m.finish === "stop").id
    const target = notificationTarget({ id: child, messages: context }, context.find((m: any) => m.id === resultMessageID))
    const notification = await observed({ parentID: session.id, childSessionID: child, resultSha256: target.resultSha256 })
    assert.equal(notification.admission.correlation, "content_match")
    assert.ok(!("resultMessageID" in notification.admission))
    admitted = true
    assert.ok(notification.admission.queued < notification.admission.delivered && notification.admission.delivered < notification.admission.step)
    await nativeWait(request, session.id, deadline, record, "after-notification-admission")
    assert.equal(admitted, true)
    const final = api("get", `/api/session/${session.id}/context`, root, connected).data
    assert.ok(final.some((m: any) => m.type === "synthetic" && m.id === notification.admission.inboxID && m.text.includes(child)))
    const coverage: any = {}
    const acquired = await captureSessions(path => request("GET", path), session,
      async (name: string, value: any) => { await writeFile(join(root, name), JSON.stringify(value)) }, coverage)
    assert.equal(coverage.coverage.tree, "complete")
    assert.ok(acquired.find(s => s.id === child).messages.some((m: any) => m.id === resultMessageID))
    assert.ok(acquired.find(s => s.id === session.id).messages.flatMap((m: any) => m.content ?? [])
      .some((p: any) => p.name === "subagent" && p.state?.input?.background === true && p.state.input.sessionID === child))
    const matched = verifyNotification(notification.admission, acquired.find(s => s.id === session.id), acquired.find(s => s.id === child),
      acquired.find(s => s.id === child).messages.find((m: any) => m.id === resultMessageID))
    assert.equal(matched.correlation, "unique-content-match-not-native-causal-id")
    await writeFile(join(root, "notification-events.json"), JSON.stringify((await observed({ action: "events" })).events))
    await writeFile(join(root, "verification.json"), JSON.stringify({ sessionID: session.id, providerRequests, realModelCalls: 0,
      fixtureStates: calls.map((c: any) => c.state), initial: initial.admission, notification: notification.admission,
      notificationMatch: matched, parentIdleAfterAdmission: true }))
  }, ["delegation-test", "delegation-model-fixture"])
  t.diagnostic(`Private server exited; retained evidence: ${root}`)
})

test("S07 driver: correlaciona la continuación exacta, no la segunda ejecución de una sesión", () => {
  const event = (type: string, messageID?: string) => ({ sessionID: "ses_child", type: `session.${type}`, messageID })
  const events = [event("execution.started"), event("execution.succeeded"), event("execution.started"), event("execution.succeeded"),
    event("execution.started"), event("step.started", "msg_start"), event("step.ended", "msg_result"), event("execution.succeeded")]
  const executions = [{ id: "exec_current", sessionID: "ses_child", startMessageID: "msg_start", result: { messageID: "msg_result" } }]
  assert.deepEqual(continuationRanges(executions, events), [{ sessionID: "ses_child", start: 4, end: 7 }])
  assert.throws(() => continuationRanges([{ ...executions[0], startMessageID: "msg_unrelated" }], events), /Native|exact|continuation/)
})
