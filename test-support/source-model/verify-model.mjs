// S08 behavior trial driver only. Importing is inert: the trial needs the
// explicit orchestrator CLI invocation with its own opt-in (OPENCODE_SOURCE_
// MODEL_CONSENT) and bounded budgets (flow <= 360000 ms, window <= 600000 ms).
// The credential lookup (V2, read-only, shared service already active, never
// auth.json nor refresh, never dumped: only redacted/hashed evidence) lives in
// module-private code reachable only from that CLI path; tests never run it.
// Deterministic tests drive runTrial against a private server with a
// programmed provider, which costs zero validation slots.
import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { withServer } from "../opencode.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"
import { captureSessions, nativeWait, privateRequest, recoverFailure, runBounded, verifyPublicationBytes } from "../delegation/verify-model.mjs"
import { evidenceWriter, hash, loadStates, prepareConsumer, textOf } from "../evidence-model/verify-model.mjs"
import { fuente, issue, longHtml, model, promptTurn1, promptTurn2, reference, requiredCoverage, reviewConditions,
  site, sourceContent, sourceObjectContent } from "./data.mjs"

const source = fileURLToPath(new URL("../..", import.meta.url))
export const expectedPlugins = ["delegation-test", "source-model-fixture",
  "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"]
const publishers = new Set(["publish_agent_deliverable", "write_report_pair"])
const parseJson = text => { try { return JSON.parse(text) } catch { return undefined } }

// Specific opt-in, separate from every other consent value, checked before any
// model resolution, credential lookup or side effect. The campaign budget for
// this trial is enforced here: at most 6 minutes of flow and 10 minutes of
// total window including captures and cleanup.
export function consentS08(env) {
  assert.equal(env.OPENCODE_SOURCE_MODEL_CONSENT, "s08-behavior",
    "Explicit S08 behavior opt-in required; no credential lookup performed")
  const flow = Number(env.OPENCODE_SOURCE_FLOW_MS), window = Number(env.OPENCODE_SOURCE_WINDOW_MS)
  assert.ok(Number.isSafeInteger(flow) && flow > 0 && flow <= 360_000,
    "Explicit flow budget required (0 < flow <= 360000 ms)")
  assert.ok(Number.isSafeInteger(window) && window > flow + 30_000 && window <= 600_000,
    "Explicit window budget required (flow + 30000 < window <= 600000 ms)")
  return { flow, window }
}

// The model under trial stays a declared parameter, never executed by this
// file or its tests. Only the authorized CLI invocation may run the trial.
export function resolveTrialModel(env) {
  const value = env.OPENCODE_EVIDENCE_MODEL
  if (value === undefined || value === "") return model
  assert.match(value, /^[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
    "OPENCODE_EVIDENCE_MODEL must be 'providerID/modelID' with safe characters")
  const [providerID, id] = value.split("/")
  return { providerID, id }
}

//// Observed recoveries: the durable fixture counter, never estimates. ////

export async function loadSourceCalls(host) {
  const text = await readFile(join(host, "fixture-calls.jsonl"), "utf8")
    .catch(error => { if (error.code === "ENOENT") return ""; throw error })
  return text.trim() ? text.trim().split("\n").map(JSON.parse) : []
}

export function observedRecoveries(calls, expected = {}) {
  const sourceKey = expected.fuente ?? fuente
  const canonicalSha = expected.resultSha256 ?? hash(sourceContent)
  const reads = calls.filter(call => call.name === "getJiraIssue" && call.key === sourceKey &&
    call.sessionID && call.messageID && call.callID)
  const started = call => reads.some(start => start.state === "started" &&
    start.sessionID === call.sessionID && start.messageID === call.messageID && start.callID === call.callID &&
    (start.time ?? 0) <= (call.time ?? 0))
  const recoveries = reads.filter(call => call.state === "completed" && call.resultSha256 === canonicalSha && started(call))
    .map(({ sessionID, messageID, callID, time, resultSha256 }) =>
      ({ sessionID, messageID, callID, time, resultSha256, started: true, observed: true }))
  // A completed read whose observed hash differs from the fixed original is a
  // contradiction to record, never a valid recovery of this source.
  const contradicciones = reads.filter(call => call.state === "completed" && call.resultSha256 !== canonicalSha)
    .map(({ sessionID, messageID, callID, time, resultSha256 }) =>
      ({ sessionID, messageID, callID, time, resultSha256, motivo: "contenido observado distinto del original fijado del fixture" }))
  return { recoveries, contradicciones }
}

//// Direct transfer inside the same code: fixture result -> blob, both ////
//// representations, without model retranscription. ////

// The code never retranscribes the original as text: sliding probes cover any
// substantial fragment of either received representation.
export function assertNoRetranscription(code, contents = [sourceContent, sourceObjectContent]) {
  assert.equal(typeof code, "string", "El código de execute debe ser texto")
  for (const content of contents)
    for (let start = 0; start + 400 <= content.length; start += 200)
      assert.ok(!code.includes(content.slice(start, start + 400)),
        `El código de Code Mode nunca retranscribe el original (ventana en ${start}): el resultado se pasa directamente, no como texto del modelo`)
  return true
}

export async function verifyTransfer({ snapshots, recoveries = [], blobOf, expected = {} }) {
  const literal = expected.literal ?? sourceContent
  const objectContent = expected.objectContent ?? sourceObjectContent
  assert.ok(snapshots.length, "Se requiere al menos una instantánea de la fuente")
  assert.equal(new Set(snapshots.map(snapshot => snapshot.id)).size, snapshots.length, "Identidades de instantánea únicas")
  assert.equal(new Set(snapshots.map(snapshot => snapshot.operacion_id)).size, snapshots.length,
    "Una versión u operación distinta añade instantánea; nunca sobrescribe")
  const transfers = []
  for (const snapshot of snapshots) {
    const blob = await blobOf(snapshot.contentSha256)
    assert.ok(blob, `Blob presente por hash para ${snapshot.id}`)
    assert.equal(hash(blob), snapshot.contentSha256, "Blob alterado respecto del hash registrado")
    assert.equal(snapshot.bytes, Buffer.byteLength(blob), "Tamaño declarado distinto del blob conservado")
    const content = blob.toString("utf8")
    if (snapshot.representacion === "texto_literal")
      assert.equal(content, literal, "Transferencia sin retranscripción: el texto literal conserva los bytes exactos del resultado del fixture")
    else {
      assert.equal(snapshot.representacion, "objeto_serializado")
      assert.equal(content, objectContent, "Transferencia sin retranscripción: el objeto se serializa de forma determinista del mismo resultado")
    }
    transfers.push({ snapshotID: snapshot.id, operacion_id: snapshot.operacion_id, representacion: snapshot.representacion,
      contentSha256: snapshot.contentSha256, bytes: snapshot.bytes, version: snapshot.version ?? null })
  }
  // Read and capture must live in the same assistant message of the same
  // session (the same execute code); a capture in another message would mean
  // the original crossed the model as text.
  const correlated = recoveries.map(recovery => ({
    recovery,
    snapshots: snapshots.filter(snapshot => snapshot.producerSessionID === recovery.sessionID && snapshot.producerMessageID === recovery.messageID),
  }))
  assert.ok(correlated.some(entry => entry.snapshots.length),
    "Recuperación del original sin captura en el mismo código/mensaje: transferencia directa no acreditada")
  return { transfers, recuperacionesEnCodigo: correlated
    .filter(entry => entry.snapshots.length)
    .map(entry => ({ recovery: entry.recovery, snapshots: entry.snapshots.map(snapshot => snapshot.id) })) }
}

//// Coverage of the exigido original; versions never conflate their gaps. ////

export function verifyCoverage(snapshot, required = requiredCoverage) {
  const faltantes = { paginas: [], campos: [] }, pendientes = []
  if (!snapshot.cobertura_paginas) faltantes.paginas.push("cobertura de páginas no declarada")
  else {
    for (const page of required.paginas.recuperadas)
      if (!snapshot.cobertura_paginas.recuperadas.includes(page)) faltantes.paginas.push(page)
    if (snapshot.cobertura_paginas.total !== required.paginas.total)
      faltantes.paginas.push(`total declarado ${snapshot.cobertura_paginas.total} distinto del exigido ${required.paginas.total}`)
    if ((snapshot.cobertura_paginas.pendientes ?? []).length)
      pendientes.push(`páginas pendientes: ${snapshot.cobertura_paginas.pendientes.join(", ")}`)
  }
  if (!snapshot.cobertura_campos) faltantes.campos.push("cobertura de campos no declarada")
  else {
    for (const field of required.campos.recuperados)
      if (!snapshot.cobertura_campos.recuperados.includes(field)) faltantes.campos.push(field)
    if ((snapshot.cobertura_campos.pendientes ?? []).length)
      pendientes.push(`campos pendientes: ${snapshot.cobertura_campos.pendientes.join(", ")}`)
  }
  for (const pending of snapshot.pendientes ?? []) pendientes.push(`declarado: ${pending}`)
  // Completeness is never inferred across versions or snapshots; a false
  // complete just fails here with its concrete missing pieces.
  return { snapshotID: snapshot.id, version: snapshot.version ?? null,
    completa: !faltantes.paginas.length && !faltantes.campos.length && !pendientes.length, faltantes, pendientes }
}

// Distinct versions of one source stay separate records with their own
// coverage and pendientes; no aggregate completion is computed across them.
export function verifyVersionDifferences(snapshots) {
  assert.equal(new Set(snapshots.map(snapshot => snapshot.id)).size, snapshots.length, "Identidades de instantánea únicas")
  assert.equal(new Set(snapshots.map(snapshot => snapshot.operacion_id)).size, snapshots.length,
    "Una versión no sobrescribe otra: operacion_id distinto por instantánea")
  const versions = [...new Set(snapshots.filter(snapshot => snapshot.version)
    .map(snapshot => `${snapshot.version.tipo}:${snapshot.version.valor}`))]
  return { instantaneas: snapshots.map(snapshot => ({ snapshotID: snapshot.id, version: snapshot.version ?? null,
      representacion: snapshot.representacion, cobertura_propia: Boolean(snapshot.cobertura_paginas || snapshot.cobertura_campos) })),
    versiones: versions, versionesDistintas: versions.length > 1 }
}

//// Reuse per objective turn, attributed by observed fixture times. ////

export function verifyReuse({ calls, prompt2At = 0 } = {}) {
  const { recoveries, contradicciones } = observedRecoveries(calls)
  const turn1 = recoveries.filter(recovery => (recovery.time ?? 0) < prompt2At)
  const turn2 = recoveries.filter(recovery => (recovery.time ?? 0) >= prompt2At)
  return { turn1, turn2, total: recoveries.length, contradicciones, reuseAccredited: turn2.length === 0,
    repeated: turn2.map(recovery => ({ ...recovery, motivo: null,
      nota: "repetición observada; el fixture sirve un original fijo de versión invariante, así que solo una ampliación de alcance o un cambio de versión comprobadamente observados podrían justificarla" })) }
}

//// Reading the artifact: a known route or hash alone is not a read. ////

export function sessionArtifactOutputs(sessions, sessionID) {
  const outputs = []
  for (const session of sessions) {
    if (sessionID && session.id !== sessionID) continue
    for (const message of session.messages ?? []) {
      if (message.type !== "assistant") continue
      for (const part of message.content ?? []) if (part.type === "tool" && part.name === "session_artifacts") {
        const text = (part.state?.content ?? []).filter(c => c.type === "text").map(c => c.text).join("\n")
        outputs.push({ sessionID: session.id, messageID: message.id, status: part.state?.status, output: parseJson(text) })
      }
    }
  }
  return outputs.filter(entry => entry.status === "completed" && entry.output?.artefacto_id)
}

export function verifyArtifactReads(sessions, snapshot, expectedContent = sourceContent) {
  const reads = sessionArtifactOutputs(sessions)
    .filter(entry => entry.output.artefacto_id === snapshot.id && entry.output.instantanea === true)
  // Full course by raw cursor: contiguous pages reconstruct the original.
  const raw = reads.filter(entry => entry.output.vista === undefined)
    .sort((a, b) => (a.output.inicio ?? 0) - (b.output.inicio ?? 0))
  let reconstructed = "", contiguous = true
  for (const entry of raw) {
    if (entry.output.inicio !== reconstructed.length) contiguous = false
    reconstructed += entry.output.contenido ?? ""
  }
  const fullCourse = raw.length > 0 && contiguous && reconstructed === expectedContent &&
    raw.at(-1).output.total === expectedContent.length
  // View "linea": every numbered line of the intact original was recovered.
  const views = reads.filter(entry => entry.output.vista === "linea")
  const lines = views.flatMap(entry => entry.output.lineas ?? [])
  const totalLines = views[0]?.output.total_lineas ?? 0
  const lineView = totalLines > 0 && new Set(lines.map(line => line.numero)).size === totalLines &&
    lines.every(line => line.numero >= 1 && line.numero <= totalLines)
  return { snapshotID: snapshot.id, paginas: raw.length, vistas: views.length, fullCourse, lineView,
    leida: reads.length > 0, lecturasCompletas: fullCourse || lineView }
}

// Reuse claims must be backed by a real read or the recovering execute; an
// existing snapshot ID cited in prose alone accredits nothing.
export function accreditedSourceUse({ outputs, snapshots, recoveries = [] }) {
  const readIDs = new Set(outputs.map(entry => entry.output?.artefacto_id).filter(Boolean))
  const enCodigo = recoveries.filter(recovery => snapshots.some(snapshot =>
    snapshot.producerSessionID === recovery.sessionID && snapshot.producerMessageID === recovery.messageID))
  return { snapshotsConLectura: snapshots.filter(snapshot => readIDs.has(snapshot.id)).map(snapshot => snapshot.id),
    snapshotsSoloCitables: snapshots.filter(snapshot => !readIDs.has(snapshot.id)).map(snapshot => snapshot.id),
    recuperacionesEnCodigo: enCodigo.length,
    acreditado: readIDs.size > 0 || enCodigo.length > 0 }
}

//// Optional independent review: if it exists, it is exact and independent. ////

export function verifyReviewIfExists({ states, sessions, snapshots }) {
  const reviews = states.flatMap(state => Object.values(state.work ?? {}))
    .flatMap(work => (work.reviews ?? []).map(review => ({ ...review, workID: work.id })))
  if (!reviews.length) return { exists: false }
  const artifacts = states.flatMap(state => Object.values(state.artifacts ?? {}))
  const records = states.flatMap(state => Object.values(state.reviews ?? {}))
  const results = reviews.map(review => {
    const delivery = artifacts.find(artifact => artifact.id === review.artifactID)
    assert.ok(delivery, "La revisión asignada debe corresponder a una entrega registrada")
    const reviewer = sessions.find(session => session.id === review.sessionID)
    assert.equal(reviewer?.agent, "revisor", "La sesión revisora debe existir con rol revisor")
    assert.notEqual(reviewer.id, delivery.producerSessionID, "La revisión no puede ser del productor de la entrega")
    // Real access to the same source version: the reviewer's own completed
    // reads of a snapshot captured by the delivery producer.
    const producerShas = new Set(snapshots.filter(snapshot => snapshot.producerSessionID === delivery.producerSessionID)
      .map(snapshot => snapshot.contentSha256))
    const readShas = new Set(sessionArtifactOutputs(sessions, review.sessionID)
      .map(entry => snapshots.find(snapshot => snapshot.id === entry.output?.artefacto_id)).filter(Boolean)
      .map(snapshot => snapshot.contentSha256))
    assert.ok(readShas.size > 0, "El revisor debe leer realmente la fuente; no hereda la lectura del productor")
    assert.ok([...readShas].some(sha => producerShas.has(sha)),
      "El revisor debe cotejar la misma versión de la fuente que utilizó la entrega")
    const record = records.find(entry => entry.artifactID === review.artifactID)
    if (record?.verdict) {
      assert.equal(record.verdict.artefacto_id, delivery.id, "El dictamen cita la entrega exacta")
      assert.equal(record.verdict.hash_manifiesto, delivery.manifestHash, "El dictamen cita el hash exacto del manifiesto")
      assert.ok(["favorable", "parcial", "con_hallazgos"].includes(record.verdict.resultado), "Resultado de dictamen válido")
    }
    return { reviewerSessionID: reviewer.id, artifactID: review.artifactID, workID: review.workID,
      producerSessionID: delivery.producerSessionID, versionesLeidas: [...readShas], verdict: record?.verdict ?? null }
  })
  return { exists: true, reviews: results }
}

//// Light delivery check: exact manifest and verified bytes. The full ////
//// publication contract belongs to S02/S07 suites; here it only backs review. ////

export async function verifyDelivery(states, parentID) {
  const candidate = states.flatMap(state => Object.values(state.operations ?? {}))
    .filter(operation => operation.phase === "confirmed" && operation.producerSessionID === parentID &&
      publishers.has(operation.type)).findLast(() => true)
  if (!candidate) return { exists: false }
  assert.equal(hash(JSON.stringify(candidate.artifact.files)), candidate.artifact.manifestHash, "Manifiesto de la entrega alterado")
  const files = await verifyPublicationBytes(candidate)
  return { exists: true, artifactID: candidate.artifact.id, manifestHash: candidate.artifact.manifestHash,
    type: candidate.type, files: files.length, verifyBytes: true }
}

//// The reviewer checklist: always review_required, never auto-approval. ////

export function reviewChecklistS08({ sessionID, finals = [], transfer = {}, coverages = [], reuse = {},
  reads = [], usoFuente = {}, entrega = {}, revision = {} }) {
  return {
    status: "review_required", sufficientForS08: false, sessionID,
    finals: finals.map(final => ({ turn: final.turn, sessionID: final.sessionID, messageID: final.messageID, sha256: final.sha256 })),
    recuperacionesObservadas: { turn1: reuse.turn1 ?? [], turn2: reuse.turn2 ?? [],
      total: reuse.total ?? 0, contradicciones: reuse.contradicciones ?? [], reuseAccredited: reuse.reuseAccredited ?? false,
      repeated: reuse.repeated ?? [] },
    transferencias: transfer.transfers ?? [], recuperacionesEnCodigo: transfer.recuperacionesEnCodigo ?? [],
    coberturas: coverages, lecturas: reads, usoFuente, entrega, revision,
    conditions: reviewConditions.map(([question, source, condition]) =>
      ({ question, source, condition, verdict: "pending", reportReferences: [], nativeReferences: [], contradictionCheck: "pending" })),
    completion: "Una revisión independiente distinta debe inspeccionar el original completo, la entrega y los mensajes nativos exactos de los dos turnos; citar archivo/hash/líneas e IDs de mensaje/llamada nativos por cada condición, comprobar que las recuperaciones observadas reproducen el registro del fixture y registrar revisor y veredicto. sufficientForS08 permanece false hasta esa revisión; nunca autoaprobar por coincidencias de palabras o hashes.",
    evidence: ["case.json", "preparation.json", "trial-preparation.json", "summary.json", "states.json",
      "fixture-calls.json", "driver-events.jsonl", "tool-inputs.json", "<sessionID>.json", "review-required.json"],
    correlation: "Fixture callID identifies the synthetic Jira invocation inside the execute code; the durable counter file is the only admitted basis for observed recoveries and their turn attribution.",
  }
}

//// Private consumer on the installed sources, with the S08 source fixture. ////

export function blobReader(host) {
  const control = join(host, "informes-agente/sesiones/.control")
  return async sha256 => {
    for (const dir of await readdir(control).catch(error => { if (error.code === "ENOENT") return []; throw error })) {
      const bytes = await readFile(join(control, dir, "snapshots", sha256))
        .catch(error => { if (error.code !== "ENOENT") throw error; return undefined })
      if (bytes) return bytes
    }
    throw new Error(`Original de fuente no encontrado por hash: ${sha256}`)
  }
}

// Reuses the V2 preparation (installed sources by prepareConsumer, optional
// read-only provider plugin by absolute URL) and only swaps the S02 evidence
// fixture for the S08 source fixture of this case. No policy is invented: the
// roles, permissions and settings are exactly the installed current ones.
export async function prepareTrial(root, model = resolveTrialModel(process.env), providerPlugin = process.env.OPENCODE_EVIDENCE_PROVIDER_PLUGIN) {
  const consumer = await prepareConsumer(root, model, providerPlugin)
  const fixture = new URL("./fixture", import.meta.url).href
  consumer.settings.plugins = consumer.settings.plugins.map(url => /\/evidence-model\/fixture\/?$/.test(url) ? fixture : url)
  assert.ok(consumer.settings.plugins.includes(fixture), "El fixture fuente S08 debe quedar instalado en el consumidor privado")
  assert.ok(!consumer.settings.plugins.some(url => /\/evidence-model\/fixture\/?$/.test(url)), "El fixture de evidencia S02 no debe quedar presente")
  await writeFile(join(consumer.config, "opencode.json"), JSON.stringify(consumer.settings))
  await evidenceWriter(root).save("trial-preparation.json", {
    fixturePlugin: { id: "source-model-fixture", url: fixture, serves: fuente, corpus: site.cloudId, referencia: reference },
    plugins: consumer.settings.plugins,
    files: await Promise.all(["test-support/source-model/data.mjs", "test-support/source-model/fixture/index.ts",
      "test-support/source-model/verify-model.mjs"].map(async path => ({ path, sha256: hash(await readFile(join(source, path))) }))) })
  return consumer
}

//// The two-turn trial. Native waits only: no steering, polling or repair. ////

export async function runTrial({ root, host, request, writer, summary, flow }) {
  const { save, record } = writer
  let deadline = Date.now() + flow
  const inputs = new Map()
  const post = (path, input, timeout = 30_000) => request("POST", path, input, Math.min(timeout, deadline - Date.now()))
  const read = async path => {
    const page = await request("GET", path, undefined, Math.min(30_000, deadline - Date.now()))
    const sessionID = new URL(path, "http://private").pathname.match(/^\/api\/session\/(ses_[a-zA-Z0-9]+)\/message$/)?.[1]
    if (sessionID && Array.isArray(page.data)) {
      for (const message of page.data) for (const part of message.content ?? []) if (part.type === "tool")
        inputs.set(JSON.stringify([sessionID, message.id, part.id]), { sessionID, messageID: message.id, callID: part.id,
          name: part.name, input: part.state?.input, status: part.state?.status,
          ...(part.state?.error ? { errorBody: "omitted; status retained" } : {}) })
      await save("tool-inputs.json", [...inputs.values()])
    }
    return page
  }
  const rpc = async input => (await post("/api/rpc/delegation-test/run", { input })).output
  const parent = (await post("/api/session", { agent: "investigador", model: summary.model, title: "S08 fuentes" })).data
  summary.sessionID = parent.id
  await save("summary.json", summary)
  try {
    const flowStarted = Date.now()
    await post(`/api/session/${parent.id}/prompt`, { text: promptTurn1 })
    await record({ type: "prompt.sent", turn: 1, sessionID: parent.id, at: Date.now() })
    await nativeWait(request, parent.id, deadline, record, "turn1")
    await record({ type: "turn.settled", turn: 1, at: Date.now() })
    const prompt2At = Date.now()
    await post(`/api/session/${parent.id}/prompt`, { text: promptTurn2 })
    await record({ type: "prompt.sent", turn: 2, sessionID: parent.id, prompt2At, at: Date.now() })
    await nativeWait(request, parent.id, deadline, record, "turn2")
    await record({ type: "turn.settled", turn: 2, at: Date.now() })
    const sessions = await captureSessions(read, parent, save, summary)
    const states = await loadStates(host)
    const calls = await loadSourceCalls(host)
    await save("states.json", states)
    await save("fixture-calls.json", calls)
    for (const session of sessions) {
      const last = session.messages.findLastIndex(m => ["user", "synthetic", "assistant"].includes(m.type))
      assert.ok(session.messages.findLastIndex(m => m.type === "idle") > last, "Todas las sesiones observadas deben estar inactivas")
      for (const message of session.messages.filter(m => m.type === "assistant"))
        assert.deepEqual(message.model, summary.model, "El modelo nativo efectivo debe ser el modelo seleccionado")
    }
    // Two native final results: one per objective turn of the same session.
    const messages = sessions.find(session => session.id === parent.id)?.messages ?? []
    const users = messages.filter(m => m.type === "user")
    assert.ok(users.length >= 2, "Se requieren los dos turnos de objetivo")
    const boundary = messages.indexOf(users[1])
    const stops = messages.map((message, index) => ({ message, index }))
      .filter(({ message }) => message.type === "assistant" && message.finish === "stop" && textOf(message).trim())
    const turn1Final = stops.filter(({ index }) => index < boundary).at(-1)
    const turn2Final = stops.filter(({ index }) => index > boundary).at(-1)
    assert.ok(turn1Final, "Respuesta final nativa del primer turno requerida")
    assert.ok(turn2Final, "Respuesta final nativa del segundo turno requerida")
    // Mechanical trials, all recorded (never approving by word/hash matches).
    const reuse = verifyReuse({ calls, prompt2At })
    const snapshots = states.flatMap(state => Object.values(state.snapshots ?? {}))
      .filter(snapshot => snapshot.fuente === fuente)
    assert.ok(snapshots.length, "Instantánea de la fuente requerida")
    const transfer = await verifyTransfer({ snapshots, recoveries: reuse.turn1.concat(reuse.turn2), blobOf: blobReader(host) })
    for (const input of [...inputs.values()]) if (input.name === "execute")
      assertNoRetranscription(String(input.input?.code ?? ""))
    const coverages = snapshots.map(snapshot => verifyCoverage(snapshot))
    const versions = verifyVersionDifferences(snapshots)
    const outputs = sessionArtifactOutputs(sessions)
    const reads = snapshots.map(snapshot => verifyArtifactReads(sessions, snapshot,
      snapshot.representacion === "objeto_serializado" ? sourceObjectContent : sourceContent))
    const usoFuente = accreditedSourceUse({ outputs, snapshots, recoveries: reuse.turn1.concat(reuse.turn2) })
    const entrega = await verifyDelivery(states, parent.id)
    const revision = verifyReviewIfExists({ states, sessions, snapshots })
    const finals = [
      { turn: 1, sessionID: parent.id, messageID: turn1Final.message.id, sha256: hash(textOf(turn1Final.message)) },
      { turn: 2, sessionID: parent.id, messageID: turn2Final.message.id, sha256: hash(textOf(turn2Final.message)) },
    ]
    await save("review-required.json", reviewChecklistS08({ sessionID: parent.id, finals, transfer, coverages, reuse, reads, usoFuente, entrega, revision }))
    Object.assign(summary, { mechanicalCheck: "passed", check: "review_required", sufficientForS08: false,
      flowStarted, flowFinished: Date.now(),
      reuse: { total: reuse.total, turn1: reuse.turn1.length, turn2: reuse.turn2.length,
        reuseAccredited: reuse.reuseAccredited, repeated: reuse.repeated, contradicciones: reuse.contradicciones },
      transferencia: { instantaneas: transfer.transfers.length, recuperacionesEnCodigo: transfer.recuperacionesEnCodigo },
      cobertura: { acreditadaCompleta: coverages.some(coverage => coverage.completa), instantaneas: coverages },
      versiones: versions, lecturas: { acreditadasCompletas: reads.some(read => read.lecturasCompletas), instantaneas: reads },
      usoFuente, entrega, revision, finals })
    await save("summary.json", summary)
    return { sessions, states, calls, snapshots }
  } catch (error) {
    deadline = Date.now() + 30_000
    // The counter file is durable even when the normal acquisition fails.
    try { await save("fixture-calls.json", await loadSourceCalls(host)) }
    catch (failure) { (summary.evidenceErrors ??= []).push({ stage: "fixture-calls", error: failure.message }) }
    return recoverFailure({ error, summary, parent, read, rpc, save, loadStates: () => loadStates(host),
      post: (path, input, timeout) => request("POST", path, input, timeout) })
  }
}

// Supervision timeout record: the credential could not be rechecked, so it is
// recorded as "unknown" — never fabricated as true.
export async function recordSupervisionFailure(root, error) {
  const summary = await readFile(join(root, "summary.json"), "utf8").then(JSON.parse)
    .catch(() => ({ scope: "S08 behavior trial only", root }))
  summary.activeCredentialUnchanged ??= "unknown"
  Object.assign(summary, { check: "failed", sufficientForS08: false,
    supervisionError: error.message, ...(error.cleanupError ? { cleanupError: error.cleanupError } : {}),
    finished: new Date().toISOString() })
  await evidenceWriter(root).save("summary.json", summary)
}

// V2 credential transfer only from the orchestrator CLI path: the shared
// service must already be active (never started here), the lookup is
// read-only, no auth.json, no refresh, and only redacted/hashed evidence
// leaves this function.
function credential(trialModel) {
  const status = opencode(["service", "status"], source)
  assert.ok(status.status === 0 && /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(status.stdout),
    "Existing shared service required; will not start it")
  const result = opencode(["api", "get", "/api/credential"], source)
  assert.equal(result.status, 0, "Active V2 credential lookup failed")
  const auth = JSON.parse(result.stdout).data.find(entry => entry.integrationID === trialModel.providerID && entry.active)
  assert.equal(auth?.value.type, "oauth", "No active OAuth credential for the configured model provider")
  return auth
}

async function main(root, budgets, trialModel) {
  const writer = evidenceWriter(root), summary = { scope: "S08 behavior trial only", model: trialModel, root,
    started: new Date().toISOString(), check: "in_progress", sufficientForS08: false, activeCredentialUnchanged: "unknown" }
  let original, failure
  try {
    await writer.save("summary.json", summary)
    await writer.save("case.json", { prompts: { turn1: promptTurn1, turn2: promptTurn2 }, model: trialModel,
      modelParameter: `${trialModel.providerID}/${trialModel.id}`, fuente, corpus: site.cloudId, referencia: reference,
      originalSintetico: issue, longHtmlLineaUnica: longHtml, requiredCoverage, versionFijaFuente: "el fixture sirve un original invariante; una repetición requiere justificación observada", budgets })
    original = credential(trialModel)
    writer.secrets.push(original.value.access, original.value.refresh)
    assert.ok(original.value.expires > Date.now() + budgets.window, "Token lifetime insufficient; will not refresh")
    const { host, env } = await prepareTrial(root, trialModel)
    await mkdir(join(root, "cache/opencode"), { recursive: true })
    const models = join(process.env.USERPROFILE, ".cache/opencode/models.json")
    if (await stat(models).catch(() => undefined)) await cp(models, join(root, "cache/opencode/models.json"))
    await withServer(host, env, async connected => {
      writer.secrets.push(connected.OPENCODE_PASSWORD, Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64"))
      const request = privateRequest(connected, host)
      await request("POST", "/api/credential", { integrationID: trialModel.providerID, value: { ...original.value, refresh: "" } })
      await runTrial({ root, host, request, writer, summary, flow: budgets.flow })
    }, expectedPlugins)
  } catch (error) {
    failure = error
    summary.check = "failed"
    summary.sufficientForS08 = false
    summary.error = error.message
  } finally {
    if (original) try {
      summary.activeCredentialUnchanged = hash(JSON.stringify(credential(trialModel))) === hash(JSON.stringify(original))
      assert.ok(summary.activeCredentialUnchanged, "Shared credential changed during check")
    } catch (error) { summary.credentialCheckError = error.message; summary.check = "failed"; failure ??= error }
    summary.finished = new Date().toISOString()
    await writer.save("summary.json", summary)
  }
  if (failure) throw new Error("S08 driver failed; inspect sanitized summary.json")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgets = consentS08(process.env)
  const trialModel = resolveTrialModel(process.env)
  if (process.argv[2] === "--worker") await main(process.argv[3], budgets, trialModel)
  else {
    assert.equal(process.argv.length, 2, "No arguments supported")
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s08-model-"))
    console.log(`Evidence: ${root}`)
    try {
      await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root],
        { cwd: source, timeout: budgets.window, env: { ...process.env, OPENCODE_EVIDENCE_MODEL: `${trialModel.providerID}/${trialModel.id}` } })
    } catch (error) { await recordSupervisionFailure(root, error); throw error }
  }
}
