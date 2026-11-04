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
import { evidenceWriter, hash, loadStates, prepareConsumer, textOf, verifyReport } from "../evidence-model/verify-model.mjs"
import { fuente, issue, longHtml, model, promptTurn1, promptTurn2, reference, requiredCoverage, reviewConditions,
  site, sourceContent, sourceObjectContent, sourceComponents } from "./data.mjs"

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
  const reads = calls.filter(call => ["getJiraIssue", "getJiraIssueComments"].includes(call.name) && call.key === sourceKey &&
    call.sessionID && call.messageID && call.callID)
  const started = call => reads.some(start => start.state === "started" &&
    start.sessionID === call.sessionID && start.messageID === call.messageID && start.callID === call.callID &&
    start.name === call.name && start.component === call.component && start.invocationID === call.invocationID &&
    (start.time ?? 0) <= (call.time ?? 0))
  const validHash = call => call.resultSha256 === (call.component ? hash(sourceComponents[call.component] ?? "") : canonicalSha)
  const recoveries = reads.filter(call => call.state === "completed" && validHash(call) && started(call))
    .map(({ sessionID, messageID, callID, invocationID, component, time, resultSha256, result }) =>
      ({ sessionID, messageID, callID, invocationID, component, time, resultSha256, result, started: true, observed: true }))
  // A completed read whose observed hash differs from the fixed original is a
  // contradiction to record, never a valid recovery of this source.
  const contradicciones = reads.filter(call => call.state === "completed" && !validHash(call))
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

const resultText = result => typeof result?.content === "string" ? result.content
  : result?.content?.filter(c => c.type === "text").map(c => c.text).join("\n")

export async function verifyTransfer({ snapshots, recoveries = [], receipts = [], sessions = [], blobOf, expected = {} }) {
  const literal = expected.literal ?? sourceContent
  assert.ok(snapshots.length, "Se requiere al menos una instantánea de la fuente")
  assert.equal(new Set(snapshots.map(snapshot => snapshot.id)).size, snapshots.length, "Identidades de instantánea únicas")
  assert.equal(new Set(snapshots.map(snapshot => JSON.stringify([snapshot.producerSessionID, snapshot.operacion_id]))).size, snapshots.length,
    "Una versión u operación distinta añade instantánea; nunca sobrescribe")
  const transfers = []
  for (const snapshot of snapshots) {
    const blob = await blobOf(snapshot.contentSha256)
    assert.ok(blob, `Blob presente por hash para ${snapshot.id}`)
    assert.equal(hash(blob), snapshot.contentSha256, "Blob alterado respecto del hash registrado")
    assert.equal(snapshot.bytes, Buffer.byteLength(blob), "Tamaño declarado distinto del blob conservado")
    const content = blob.toString("utf8")
    const receipt = receipts.find(r => parseJson(resultText(r.result))?.instantanea_id === snapshot.id)
    assert.ok(receipt, "Recibo nativo de captura requerido; una coincidencia de hash/mensaje no demuestra el mismo execute")
    assert.equal(receipt.sessionID, snapshot.producerSessionID)
    assert.equal(receipt.messageID, snapshot.producerMessageID)
    const recovery = recoveries.find(r => r.sessionID === receipt.sessionID && r.messageID === receipt.messageID &&
      r.callID === receipt.callID && r.time <= receipt.time &&
      (typeof receipt.input.resultado === "string" ? receipt.input.resultado === (r.result ?? literal)
        : stableJson(receipt.input.resultado) === stableJson(JSON.parse(r.result ?? literal))))
    assert.ok(recovery, "Lectura y captura deben pertenecer al mismo execute nativo completado")
    const execution = sessions.find(s => s.id === receipt.sessionID)?.messages.find(m => m.id === receipt.messageID)
      ?.content?.find(p => p.type === "tool" && p.name === "execute" && p.id === receipt.callID && p.state?.status === "completed")
    assert.ok(execution, "Execute exacto no completado o no atribuible")
    assertNoRetranscription(execution.state.input?.code ?? "")
    const input = receipt.input, output = parseJson(resultText(receipt.result))
    assert.equal(input.encargo_id, snapshot.workID)
    assert.equal(input.operacion_id, snapshot.operacion_id)
    assert.equal(input.fuente, snapshot.fuente)
    assert.equal(input.corpus, snapshot.corpus)
    assert.equal(input.referencia, snapshot.referencia)
    assert.deepEqual(input.version, snapshot.version)
    assert.deepEqual(input.paginas, snapshot.cobertura_paginas)
    assert.deepEqual(input.campos, snapshot.cobertura_campos)
    assert.deepEqual(input.pendientes?.length ? input.pendientes : undefined, snapshot.pendientes)
    // The declared representation is not the runtime type of resultado. A JSON
    // STRING labelled objeto_serializado still preserves its literal bytes.
    const receivedString = typeof input.resultado === "string"
    const original = recovery.result ?? literal
    assert.equal(hash(original), recovery.resultSha256)
    if (receivedString) assert.equal(input.resultado, original, "El string recibido se conserva exactamente")
    else assert.deepEqual(input.resultado, JSON.parse(original), "Objeto recibido distinto de la lectura")
    const serialized = receivedString ? input.resultado : stableJson(input.resultado)
    assert.equal(content, serialized, "Bytes capturados distintos del tipo realmente recibido")
    assert.equal(snapshot.representacion, input.representacion ?? (receivedString ? "texto_literal" : "objeto_serializado"))
    assert.equal(output.contenido.sha256, snapshot.contentSha256)
    assert.equal(output.contenido.bytes, snapshot.bytes)
    transfers.push({ snapshotID: snapshot.id, operacion_id: snapshot.operacion_id, representacion: snapshot.representacion,
      contentSha256: snapshot.contentSha256, bytes: snapshot.bytes, version: snapshot.version ?? null,
      sessionID: receipt.sessionID, messageID: receipt.messageID, callID: receipt.callID,
      component: recovery.component ?? "issue" })
  }
  // Read and capture must live in the same assistant message of the same
  // session (the same execute code); a capture in another message would mean
  // the original crossed the model as text.
  const correlated = recoveries.map(recovery => ({
    recovery,
    snapshots: transfers.filter(t => t.sessionID === recovery.sessionID && t.messageID === recovery.messageID &&
      t.callID === recovery.callID && t.component === (recovery.component ?? "issue")),
  }))
  assert.ok(correlated.some(entry => entry.snapshots.length),
    "Recuperación del original sin captura en el mismo código/mensaje: transferencia directa no acreditada")
  return { transfers, recuperacionesEnCodigo: correlated
    .filter(entry => entry.snapshots.length)
     .map(entry => ({ recovery: entry.recovery, snapshots: entry.snapshots.map(snapshot => snapshot.snapshotID) })) }
}

export async function loadCaptureCalls(host) {
  const text = await readFile(join(host, "capture-calls.jsonl"), "utf8")
    .catch(error => { if (error.code === "ENOENT") return ""; throw error })
  return text.trim() ? text.trim().split("\n").map(JSON.parse) : []
}

export function verifyTurn(messages, admission, prompt) {
  const input = messages.findIndex(m => m.id === admission.inboxID && m.type === "user" && m.text === prompt)
  const start = messages.findIndex(m => m.id === admission.messageID && m.type === "assistant")
  const final = messages.findLastIndex((m, i) => i >= start && m.type === "assistant" && m.finish === "stop" && textOf(m).trim())
  const idle = messages.findLastIndex(m => m.type === "idle")
  assert.ok(input >= 0 && start > input && final >= start && idle > final,
    "Admisión nativa del input exacto, resultado final e idle posterior requeridos antes del siguiente turno")
  assert.ok(!messages.slice(input + 1).some(m => m.type === "user"), "Input posterior ajeno al turno")
  return messages[final]
}

const stableJson = value => Array.isArray(value) ? `[${value.map(stableJson).join(",")}]`
  : value !== null && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`
  : JSON.stringify(value)

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

// Completeness belongs to the union of components actually transferred in one
// observed fixture version, not to an assertion that every blob is a full issue.
export function verifyCoverageGroup(snapshots, transfers) {
  const covered = new Set()
  for (const transfer of transfers) {
    const snapshot = snapshots.find(s => s.id === transfer.snapshotID)
    if (!snapshot || snapshot.version?.tipo !== "referencia" || snapshot.version.valor !== reference || snapshot.pendientes?.length) continue
    if (transfer.component === "issue" && ["summary", "description", "customFields"].every(field =>
      snapshot.cobertura_campos?.recuperados.includes(field)) && !snapshot.cobertura_campos?.pendientes.length) covered.add("issue")
    const page = transfer.component === "comments:0" ? 1 : transfer.component === "comments:2" ? 2 : null
    if (page && snapshot.cobertura_paginas?.recuperadas.includes(page) && snapshot.cobertura_paginas.total === 2)
      covered.add(transfer.component)
  }
  const faltantes = Object.keys(sourceComponents).filter(component => !covered.has(component))
  return { completa: faltantes.length === 0, componentes: [...covered], faltantes, versionObservada: reference,
    procedencia: "fixture invariante; capturas y cobertura declarada contrastadas por componente" }
}

// Distinct versions of one source stay separate records with their own
// coverage and pendientes; no aggregate completion is computed across them.
export function verifyVersionDifferences(snapshots) {
  assert.equal(new Set(snapshots.map(snapshot => snapshot.id)).size, snapshots.length, "Identidades de instantánea únicas")
  assert.equal(new Set(snapshots.map(snapshot => JSON.stringify([snapshot.producerSessionID, snapshot.operacion_id]))).size, snapshots.length,
    "Una versión no sobrescribe otra: operacion_id distinto por instantánea")
  const versions = [...new Set(snapshots.filter(snapshot => snapshot.version)
    .map(snapshot => `${snapshot.version.tipo}:${snapshot.version.valor}`))]
  return { instantaneas: snapshots.map(snapshot => ({ snapshotID: snapshot.id, version: snapshot.version ?? null,
      representacion: snapshot.representacion, cobertura_propia: Boolean(snapshot.cobertura_paginas || snapshot.cobertura_campos) })),
    versiones: versions, versionesDistintas: versions.length > 1 }
}

//// Reuse per objective turn, attributed by observed fixture times. ////

export function verifyReuse({ calls, prompt2At = 0, sourceUse = false } = {}) {
  const { recoveries, contradicciones } = observedRecoveries(calls)
  const turn1 = recoveries.filter(recovery => (recovery.time ?? 0) < prompt2At)
  const turn2 = recoveries.filter(recovery => (recovery.time ?? 0) >= prompt2At)
  const repeated = recoveries.filter((recovery, i) => recoveries.slice(0, i).some(previous => previous.component === recovery.component))
  const attempts2 = calls.filter(call => call.key === fuente && call.time >= prompt2At)
  const attempts = calls.filter(call => call.key === fuente && call.state === "started")
  const repeatedAttempts = attempts.filter((call, i) => attempts.slice(0, i).some(previous => previous.name === call.name && previous.component === call.component))
  return { turn1, turn2, total: recoveries.length, contradicciones,
    attempts, repeatedAttempts,
    reuseAccredited: turn1.length > 0 && attempts2.length === 0 && sourceUse && contradicciones.length === 0 && repeated.length === 0 && repeatedAttempts.length === 0,
    repeated: repeated.map(recovery => ({ ...recovery, motivo: null,
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
        outputs.push({ sessionID: session.id, messageID: message.id, callID: part.id, input: part.state?.input,
          status: part.state?.status, output: parseJson(text) })
      }
    }
  }
  return outputs.filter(entry => entry.status === "completed" && entry.output?.artefacto_id)
}

export function verifyArtifactReads(sessions, snapshot, expectedContent = sourceContent) {
  const sourceSnapshot = snapshot.id.startsWith("snap-")
  const reads = sessionArtifactOutputs(sessions).filter(entry => {
    const { input, output } = entry
    return input?.action === "read" && input.artefacto_id === snapshot.id && input.archivo === snapshot.archivo &&
      input.encargo_id === snapshot.workID && input.corpus === snapshot.corpus && input.referencia === snapshot.referencia &&
      output.artefacto_id === snapshot.id && output.archivo === snapshot.archivo &&
      (sourceSnapshot ? output.instantanea === true && output.fuente === snapshot.fuente &&
        output.corpus === snapshot.corpus && output.referencia === snapshot.referencia : !output.instantanea)
  })
  // Never assemble a complete read from pages read by different actors.
  const actors = [...new Set(reads.map(r => r.sessionID))]
  const byActor = actors.map(actor => {
  const own = reads.filter(r => r.sessionID === actor)
  // Full course by raw cursor: contiguous pages reconstruct the original.
  const raw = own.filter(entry => entry.output.vista === undefined)
  const fullCourse = raw.some(first => {
    let page = first, reconstructed = "", seen = new Set()
    while (page) {
      const out = page.output
      if (seen.has(page) || out.inicio !== reconstructed.length || out.fin !== out.inicio + out.contenido?.length ||
          out.sha256 !== snapshot.contentSha256 || out.total !== expectedContent.length ||
          out.contenido !== expectedContent.slice(out.inicio, out.fin)) return false
      seen.add(page); reconstructed += out.contenido
      if (out.cursor === null) return reconstructed === expectedContent
      page = raw.find(next => !seen.has(next) && next.input.cursor === out.cursor && next.output.inicio === out.fin)
    }
    return false
  })
  // View "linea": every numbered line of the intact original was recovered.
  const views = own.filter(entry => entry.output.vista === "linea" && entry.input.vista === "linea")
  const expectedLines = expectedContent.split(/\r?\n/)
  const lineView = views.some(first => {
    let page = first, nextLine = 1, seen = new Set()
    while (page) {
      const out = page.output
      if (seen.has(page) || out.total_lineas !== expectedLines.length || out.total_unidades !== expectedContent.length || !out.lineas?.length) return false
      seen.add(page)
      for (const line of out.lineas) {
        if (line.numero !== nextLine || line.contenido !== expectedLines[nextLine - 1]) return false
        nextLine++
      }
      if (out.cursor === null) return nextLine === expectedLines.length + 1
      page = views.find(next => !seen.has(next) && next.input.cursor === out.cursor)
    }
    return false
  })
  return { sessionID: actor, fullCourse, lineView }
  })
  const fullCourse = byActor.some(r => r.fullCourse), lineView = byActor.some(r => r.lineView)
  const raw = reads.filter(r => r.output.vista === undefined), views = reads.filter(r => r.output.vista === "linea")
  return { snapshotID: snapshot.id, paginas: raw.length, vistas: views.length, fullCourse, lineView,
    leida: reads.length > 0, lecturasCompletas: fullCourse || lineView, actores: byActor }
}

// Reuse claims must be backed by a real read or the recovering execute; an
// existing snapshot ID cited in prose alone accredits nothing.
export function accreditedSourceUse({ snapshots, readings = [], transfers = [] }) {
  const readIDs = new Set(readings.filter(r => r.lecturasCompletas).map(r => r.snapshotID))
  const enCodigo = transfers.filter(t => snapshots.some(snapshot => snapshot.id === t.snapshotID))
  return { snapshotsConLectura: snapshots.filter(snapshot => readIDs.has(snapshot.id)).map(snapshot => snapshot.id),
    snapshotsSoloCitables: snapshots.filter(snapshot => !readIDs.has(snapshot.id)).map(snapshot => snapshot.id),
    recuperacionesEnCodigo: new Set(enCodigo.map(t => JSON.stringify([t.sessionID, t.messageID, t.callID, t.component]))).size,
    acreditado: readIDs.size > 0 || enCodigo.length > 0 }
}

//// Optional independent review: if it exists, it is exact and independent. ////

export async function verifyReviewIfExists({ states, sessions, snapshots, blobOf }) {
  const reviews = states.flatMap(state => Object.values(state.work ?? {}))
    .flatMap(work => (work.reviews ?? []).map(review => ({ ...review, workID: work.id, corpus: work.corpus, referencia: work.referencia })))
  if (!reviews.length) return { exists: false }
  const artifacts = states.flatMap(state => Object.values(state.artifacts ?? {}))
  const records = states.flatMap(state => Object.values(state.reviews ?? {}))
  const results = await Promise.all(reviews.map(async review => {
    const delivery = artifacts.find(artifact => artifact.id === review.artifactID)
    assert.ok(delivery, "La revisión asignada debe corresponder a una entrega registrada")
    const reviewer = sessions.find(session => session.id === review.sessionID)
    assert.equal(reviewer?.agent, "revisor", "La sesión revisora debe existir con rol revisor")
    assert.notEqual(reviewer.id, delivery.producerSessionID, "La revisión no puede ser del productor de la entrega")
    assert.equal(reviewer.parentID, delivery.producerSessionID, "Revisor hijo real del productor")
    assert.equal(delivery.workID, review.workID, "Entrega del encargo exacto")
    const record = records.find(entry => entry.artifactID === review.artifactID && entry.reviewerSessionID === reviewer.id)
    const report = artifacts.find(a => a.id === record?.reportArtifactID && a.producerSessionID === reviewer.id)
    let readingReviewer = reviewer
    if (record?.verdict) {
      assert.equal(record.verdict.artefacto_id, delivery.id, "El dictamen cita la entrega exacta")
      assert.equal(record.verdict.hash_manifiesto, delivery.manifestHash, "El dictamen cita el hash exacto del manifiesto")
      const reportIndex = reviewer.messages.findIndex(m => m.id === report?.producerMessageID)
      const publishIndex = reviewer.messages[reportIndex]?.content?.findIndex(p => p.name === "write_review_documents") ?? -1
      assert.ok(reportIndex >= 0 && publishIndex >= 0, "Informe ligado al mensaje nativo del Revisor")
      readingReviewer = { ...reviewer, messages: [...reviewer.messages.slice(0, reportIndex), {
        ...reviewer.messages[reportIndex], content: reviewer.messages[reportIndex].content.slice(0, publishIndex),
      }] }
    }
    // Real access to the same source version: the reviewer's own completed
    // reads of a snapshot captured by the delivery producer.
    const producerShas = new Set(snapshots.filter(snapshot => snapshot.producerSessionID === delivery.producerSessionID && snapshot.workID === delivery.workID)
      .map(snapshot => snapshot.contentSha256))
    const readShas = new Set()
    for (const snapshot of snapshots) {
      if (!producerShas.has(snapshot.contentSha256)) continue
      const bytes = await blobOf(snapshot.contentSha256)
      assert.equal(hash(bytes), snapshot.contentSha256)
      if (verifyArtifactReads([readingReviewer], snapshot, bytes.toString("utf8")).lecturasCompletas) readShas.add(snapshot.contentSha256)
    }
    assert.ok(readShas.size > 0, "El revisor debe leer realmente la fuente; no hereda la lectura del productor")
    assert.ok([...readShas].some(sha => producerShas.has(sha)),
      "El revisor debe cotejar la misma versión de la fuente que utilizó la entrega")
    if (record?.verdict) {
      assert.ok(["favorable", "parcial", "con_hallazgos"].includes(record.verdict.resultado), "Resultado de dictamen válido")
      const operation = states.flatMap(s => Object.values(s.operations ?? {})).find(op => op.phase === "confirmed" && op.artifact.id === report?.id)
      assert.ok(operation, "Informe del Revisor confirmado requerido")
      const call = reviewer.messages.find(m => m.id === report.producerMessageID)?.content?.find(p =>
        p.name === "write_review_documents" && p.state?.status === "completed" &&
        parseJson(resultText(p.state))?.artefacto_id === report.id)
      assert.deepEqual(call?.state.input?.dictamen, record.verdict, "Dictamen ligado a la llamada nativa exacta")
      assert.deepEqual(parseJson(resultText(call.state)), operation.result, "Respuesta nativa distinta del informe confirmado")
      assert.equal(hash(JSON.stringify(report.files)), report.manifestHash, "Manifiesto del informe alterado")
      assert.ok(delivery.deliveries.includes(report.origin?.delivery), "Informe de otra entrega")
      assert.equal(call.state.input.entrega, join(operation.result.sesion, report.origin.delivery), "Argumento de entrega exacta del Revisor")
      const deliveryOperation = states.flatMap(s => Object.values(s.operations ?? {})).find(op => op.phase === "confirmed" && op.artifact.id === delivery.id)
      assert.ok(deliveryOperation, "Entrega exacta confirmada requerida")
      for (const file of await verifyPublicationBytes(deliveryOperation)) assert.ok(verifyArtifactReads([readingReviewer], {
        id: delivery.id, archivo: file.path, workID: review.workID, corpus: review.corpus, referencia: review.referencia,
        contentSha256: file.sha256,
      }, file.content).lecturasCompletas, "El Revisor debe leer la entrega exacta completa antes del dictamen")
      for (const file of await verifyPublicationBytes(operation)) {
        const literal = file.path.endsWith("sanity-check.md") ? call.state.input.sanidad : call.state.input.disputa
        assert.equal(file.content, literal, "Bytes del informe distintos de la llamada del Revisor")
      }
    }
    return { reviewerSessionID: reviewer.id, artifactID: review.artifactID, workID: review.workID,
      producerSessionID: delivery.producerSessionID, versionesLeidas: [...readShas], verdict: record?.verdict ?? null }
  }))
  return { exists: true, reviews: results }
}

//// Light delivery check: exact manifest and verified bytes. The full ////
//// publication contract belongs to S02/S07 suites; here it only backs review. ////

export async function verifyDelivery(states, parentID, sessions) {
  const candidate = states.flatMap(state => Object.values(state.operations ?? {}))
    .filter(operation => operation.phase === "confirmed" && operation.producerSessionID === parentID &&
      publishers.has(operation.type)).findLast(() => true)
  if (!candidate) return { exists: false }
  const verified = await verifyReport(states, parentID, sessions)
  assert.equal(verified.candidate.artifact.id, candidate.artifact.id, "Publicador del investigador directo distinto del contrato")
  const files = verified.files
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
    const observe = async (prompt, settled = false) => (await post("/api/rpc/source-model-observer/run", {
      input: { sessionID: parent.id, inputHash: hash(prompt), settled },
    }, deadline - Date.now())).output.admission
    const admission1 = await observe(promptTurn1)
    await record({ type: "prompt.admitted", turn: 1, ...admission1 })
    await nativeWait(request, parent.id, deadline, record, "turn1")
    const settled1 = await observe(promptTurn1, true)
    await record({ type: "turn.native-settled", turn: 1, ...settled1 })
    const firstSessions = await captureSessions(read, parent, (name, value) => save(`turn1-${name}`, value), summary)
    const firstFinal = verifyTurn(firstSessions.find(s => s.id === parent.id).messages, admission1, promptTurn1)
    await record({ type: "turn.settled", turn: 1, at: Date.now() })
    const prompt2At = Date.now()
    await post(`/api/session/${parent.id}/prompt`, { text: promptTurn2 })
    await record({ type: "prompt.sent", turn: 2, sessionID: parent.id, prompt2At, at: Date.now() })
    const admission2 = await observe(promptTurn2)
    assert.notEqual(admission2.inboxID, admission1.inboxID, "Dos inputs nativos distintos")
    await record({ type: "prompt.admitted", turn: 2, ...admission2 })
    await nativeWait(request, parent.id, deadline, record, "turn2")
    const settled2 = await observe(promptTurn2, true)
    await record({ type: "turn.native-settled", turn: 2, ...settled2 })
    await record({ type: "turn.settled", turn: 2, at: Date.now() })
    const sessions = await captureSessions(read, parent, save, summary)
    // The shared S07 acquisition intentionally omits artifact-tool arguments;
    // retain S08's exact captured inputs without changing that earlier driver.
    for (const session of sessions) {
      for (const message of session.messages) for (const part of message.content ?? []) if (part.type === "tool") {
        const input = inputs.get(JSON.stringify([session.id, message.id, part.id]))
        if (input) part.state.input = input.input
      }
      await save(`${session.id}.json`, session.messages)
    }
    const states = await loadStates(host)
    const calls = await loadSourceCalls(host)
    const receipts = await loadCaptureCalls(host)
    await save("states.json", states)
    await save("fixture-calls.json", calls)
    await save("capture-calls.json", receipts)
    await save("source-events.json", (await post("/api/rpc/source-model-observer/run", { input: { action: "events" } })).output.events)
    for (const session of sessions) {
      const last = session.messages.findLastIndex(m => ["user", "synthetic", "assistant"].includes(m.type))
      assert.ok(session.messages.findLastIndex(m => m.type === "idle") > last, "Todas las sesiones observadas deben estar inactivas")
      for (const message of session.messages.filter(m => m.type === "assistant"))
        assert.deepEqual(message.model, summary.model, "El modelo nativo efectivo debe ser el modelo seleccionado")
    }
    // Two native final results: one per objective turn of the same session.
    const messages = sessions.find(session => session.id === parent.id)?.messages ?? []
    const turn1Final = { message: firstFinal }
    const turn2Final = { message: verifyTurn(messages, admission2, promptTurn2) }
    // Mechanical trials, all recorded (never approving by word/hash matches).
    const reuse = verifyReuse({ calls, prompt2At })
    const snapshots = states.flatMap(state => Object.values(state.snapshots ?? {}))
      .filter(snapshot => snapshot.fuente === fuente)
    assert.ok(snapshots.length, "Instantánea de la fuente requerida")
    const transfer = await verifyTransfer({ snapshots, recoveries: reuse.turn1.concat(reuse.turn2), receipts, sessions, blobOf: blobReader(host) })
    for (const input of [...inputs.values()]) if (input.name === "execute")
      assertNoRetranscription(String(input.input?.code ?? ""))
    const coverages = snapshots.map(snapshot => verifyCoverage(snapshot))
    const groupCoverage = verifyCoverageGroup(snapshots, transfer.transfers)
    assert.ok(groupCoverage.completa, "Original exigido pendiente: faltan campos, páginas o versión coherente")
    const versions = verifyVersionDifferences(snapshots)
    const reads = await Promise.all(snapshots.map(async snapshot => verifyArtifactReads(sessions, snapshot,
      (await blobReader(host)(snapshot.contentSha256)).toString("utf8"))))
    const secondInput = messages.findIndex(m => m.id === admission2.inboxID)
    const turn2Sessions = [{ ...parent, messages: messages.slice(secondInput + 1) }]
    const reusedComponents = new Set()
    for (const snapshot of snapshots) {
      const content = (await blobReader(host)(snapshot.contentSha256)).toString("utf8")
      if (verifyArtifactReads(turn2Sessions, snapshot, content).lecturasCompletas)
        for (const item of transfer.transfers.filter(t => t.snapshotID === snapshot.id)) reusedComponents.add(item.component)
    }
    reuse.reuseAccredited = verifyReuse({ calls, prompt2At,
      sourceUse: Object.keys(sourceComponents).every(component => reusedComponents.has(component)) }).reuseAccredited
    assert.ok(reuse.reuseAccredited, "Reutilización no acreditada por recorrido íntegro en turno 2 o recuperación repetida sin justificar")
    const usoFuente = accreditedSourceUse({ snapshots, readings: reads, transfers: transfer.transfers })
    const entrega = await verifyDelivery(states, parent.id, sessions)
    assert.ok(entrega.exists, "Publicación completa del investigador requerida para el cotejo independiente")
    const revision = await verifyReviewIfExists({ states, sessions, snapshots, blobOf: blobReader(host) })
    const finals = [
      { turn: 1, sessionID: parent.id, messageID: turn1Final.message.id, sha256: hash(textOf(turn1Final.message)) },
      { turn: 2, sessionID: parent.id, messageID: turn2Final.message.id, sha256: hash(textOf(turn2Final.message)) },
    ]
    await save("review-required.json", reviewChecklistS08({ sessionID: parent.id, finals, transfer, coverages, reuse, reads, usoFuente, entrega, revision }))
    Object.assign(summary, { mechanicalCheck: "passed", check: "review_required", sufficientForS08: false,
      flowStarted, flowFinished: Date.now(),
      reuse: { total: reuse.total, turn1: reuse.turn1.length, turn2: reuse.turn2.length,
        attempts: reuse.attempts, repeatedAttempts: reuse.repeatedAttempts,
        reuseAccredited: reuse.reuseAccredited, repeated: reuse.repeated, contradicciones: reuse.contradicciones },
      transferencia: { instantaneas: transfer.transfers.length, recuperacionesEnCodigo: transfer.recuperacionesEnCodigo },
      cobertura: { acreditadaCompleta: groupCoverage.completa, conjunto: groupCoverage, instantaneas: coverages },
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
