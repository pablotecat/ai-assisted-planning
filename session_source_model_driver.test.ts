import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { accreditedSourceUse, assertNoRetranscription, blobReader, consentS08, expectedPlugins,
  loadSourceCalls, observedRecoveries, prepareTrial, recordSupervisionFailure, resolveTrialModel,
  reviewChecklistS08, runTrial, sessionArtifactOutputs, verifyArtifactReads, verifyCoverage,
  verifyReuse, verifyReviewIfExists as verifyReviewRaw, verifyTransfer as verifyTransferRaw, verifyTurn, verifyCoverageGroup,
  verifyVersionDifferences, supervisedWindow } from "./test-support/source-model/verify-model.mjs"
import { evidenceWriter, hash } from "./test-support/evidence-model/verify-model.mjs"
import { privateRequest, runBounded } from "./test-support/delegation/verify-model.mjs"
import { withServer } from "./test-support/opencode.mjs"
import { cancellationRule, contradictionProbe, fuente, guaranteePending, issue, longHtml, promptTurn1,
  promptTurn2, refundRule, reference, requiredCoverage, site, sourceContent, sourceObjectContent,
  sourceSha256, stableStringify, commentContents, issueRead } from "./test-support/source-model/data.mjs"

const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const parent = { id: "ses_root", agent: "investigador" }

//// S08 guard: specific opt-in and enforced 6/10 minute budgets. ////

test("S08 guard: opt-in específico y presupuestos máximos 360000/600000 antes de cualquier credencial/efecto", () => {
  const env = { ...process.env, OPENCODE_TEST_MODEL_CONSENT: "yes", OPENCODE_EVIDENCE_MODEL_CONSENT: "s02-2.4",
    OPENCODE_SOURCE_MODEL_CONSENT: "", OPENCODE_SOURCE_FLOW_MS: "1000", OPENCODE_SOURCE_WINDOW_MS: "32000" }
  assert.throws(() => consentS08(env), /opt-in/)
  assert.throws(() => consentS08({ ...env, OPENCODE_SOURCE_MODEL_CONSENT: "yes" }), /opt-in/)
  // Inert CLI: importing is safe, but running without the specific opt-in does
  // nothing (no evidence root, no credential, no model resolution).
  const result = spawnSync(process.execPath, ["test-support/source-model/verify-model.mjs"], { cwd: import.meta.dirname, env, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
  assert.deepEqual(consentS08({ ...env, OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior" }), { flow: 1000, window: 32000 })
  // Enforced campaign caps: at most 6 minutes of flow and 10 of total window.
  for (const value of ["", "NaN", "0", "-5", "1.5", "Infinity", "360001"]) {
    const flow = { ...env, OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior", OPENCODE_SOURCE_FLOW_MS: value }
    assert.throws(() => consentS08(flow), /flow budget/)
  }
  assert.deepEqual(consentS08({ ...env, OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior", OPENCODE_SOURCE_FLOW_MS: "360000", OPENCODE_SOURCE_WINDOW_MS: "600000" }),
    { flow: 360000, window: 600000 })
  assert.equal(supervisedWindow(600_000) + 5000 + 1000, 600_000, "El límite total incluye terminación y evidencia final")
  assert.throws(() => consentS08({ ...env, OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior", OPENCODE_SOURCE_WINDOW_MS: "600001" }), /window budget/)
  assert.throws(() => consentS08({ ...env, OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior", OPENCODE_SOURCE_WINDOW_MS: "31000" }), /window budget/)
})

test("S08 modelo: parámetro validado, plainconcepts/glm-5-3 por defecto, nunca ejecutado por importar", () => {
  const env = { OPENCODE_SOURCE_MODEL_CONSENT: "s08-behavior", OPENCODE_SOURCE_FLOW_MS: "1000", OPENCODE_SOURCE_WINDOW_MS: "32000" }
  assert.deepEqual(resolveTrialModel(env), { providerID: "plainconcepts", id: "glm-5-3" })
  assert.deepEqual(resolveTrialModel({ ...env, OPENCODE_EVIDENCE_MODEL: "" }), { providerID: "plainconcepts", id: "glm-5-3" })
  assert.deepEqual(resolveTrialModel({ ...env, OPENCODE_EVIDENCE_MODEL: "openai/gpt-6.1-sol" }), { providerID: "openai", id: "gpt-6.1-sol" })
  for (const value of ["no-slash", "/leading", "trailing/", "openai//gpt", "openai/gpt 6", "OpenAI/gpt",
    "a".repeat(65) + "/gpt", "openai/" + "m".repeat(129), "openai/gpt\n injected"])
    assert.throws(() => resolveTrialModel({ ...env, OPENCODE_EVIDENCE_MODEL: value }), /providerID\/modelID/)
  // Consent is checked before any model resolution in the CLI.
  const refused = { ...process.env, OPENCODE_SOURCE_MODEL_CONSENT: "", OPENCODE_SOURCE_FLOW_MS: "1000",
    OPENCODE_SOURCE_WINDOW_MS: "32000", OPENCODE_EVIDENCE_MODEL: "fixture/test" }
  const result = spawnSync(process.execPath, ["test-support/source-model/verify-model.mjs"], { cwd: import.meta.dirname, env: refused, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
})

//// The fixed synthetic case. ////

test("S08 caso: original sintético fijo, HTML >2000 en una línea, cobertura exigida y prompts sin órdenes", () => {
  assert.ok(longHtml.length > 2000 && !longHtml.includes("\n") && longHtml.includes("<table"))
  assert.equal(sourceContent, JSON.stringify(JSON.parse(sourceContent)), "Forma literal canónica del original")
  assert.deepEqual(JSON.parse(sourceContent), issueRead)
  assert.equal(sourceObjectContent, stableStringify(issueRead))
  assert.equal(sha256(sourceContent), sourceSha256)
  assert.notEqual(sourceContent, sourceObjectContent, "La serialización determinista difiere del literal en el orden de claves")
  // Answers really contained in the original; a contradiction probe is not.
  assert.ok(sourceContent.includes(cancellationRule) && sourceContent.includes(refundRule))
  assert.ok(!sourceContent.includes("el anexo de garantías no está firmado"), "El issue no entrega comentarios ocultando la paginación")
  assert.ok(commentContents[1].includes("el anexo de garantías no está firmado"))
  assert.deepEqual(JSON.parse(commentContents[0]).comments.concat(JSON.parse(commentContents[1]).comments), issue.fields.comment.comments)
  assert.ok(!sourceContent.includes(contradictionProbe))
  assert.deepEqual(requiredCoverage, { paginas: { recuperadas: [1, 2], pendientes: [], total: 2 },
    campos: { recuperados: ["summary", "description", "customFields", "comment"], pendientes: [] } })
  // The prompts express objectives, scope, reference and questions only: no
  // tool names, no capture/reuse orders, no sequence to follow.
  for (const prompt of [promptTurn1, promptTurn2]) {
    for (const forbidden of ["capture_agent_source", "session_artifacts", "session_work", "Code Mode",
      "captur", "reutili", "ejecuta", "llama a", "invoca", "consulta de nuevo", "no repitas"])
      assert.ok(!prompt.includes(forbidden), `El prompt no manda mientras: ${forbidden}`)
  }
  assert.match(promptTurn1, /Q-CANCELACION/); assert.match(promptTurn1, /Q-ABONO/)
  assert.match(promptTurn2, /Q-GARANTIA/)
  assert.ok(promptTurn1.includes(site.url) && promptTurn1.includes(reference))
})

//// Observed recoveries from the durable counter, never estimates. ////

function callFixture(state: string, extra: object = {}) {
  return { sessionID: "ses_root", messageID: "msg_exec", callID: "call-1", name: "getJiraIssue",
    key: fuente, time: state === "started" ? 1 : 2, ...extra, state }
}

test("S08 observadas: recuperación real exige started+completed con hash exacto; la contradicción no se mezcla", () => {
  const valid = observedRecoveries([callFixture("started"), callFixture("completed", { outcome: "available", resultSha256: sourceSha256 })])
  assert.equal(valid.recoveries.length, 1)
  const recovery = valid.recoveries[0]
  assert.deepEqual([recovery.sessionID, recovery.messageID, recovery.callID, recovery.resultSha256], ["ses_root", "msg_exec", "call-1", sourceSha256])
  assert.equal(valid.contradicciones.length, 0)
  assert.equal(observedRecoveries([callFixture("started")]).recoveries.length, 0)
  assert.equal(observedRecoveries([callFixture("completed", { outcome: "available", resultSha256: sourceSha256 })]).recoveries.length, 0)
  assert.equal(observedRecoveries([callFixture("rejected")]).recoveries.length, 0)
  assert.deepEqual(observedRecoveries([callFixture("started"), callFixture("rejected")]).recoveries, [])
  // A completed read of another content is a contradiction to record.
  const foreign = observedRecoveries([callFixture("started"), callFixture("completed", { resultSha256: hash("other content") })])
  assert.equal(foreign.recoveries.length, 0)
  assert.equal(foreign.contradicciones.length, 1)
  assert.match(foreign.contradicciones[0].motivo, /distinto del original fijado/)
  assert.equal(observedRecoveries([callFixture("started"), callFixture("completed", { outcome: "available", resultSha256: sourceSha256 }),
    { sessionID: "s", messageID: "m", callID: "c", name: "getJiraIssue", key: "APP-99", state: "completed", time: 3 }]).recoveries.length, 1,
    "Solo cuenta la fuente del caso")
})

//// Direct transfer without retranscription, string and object forms. ////

function snapshotFixture(extra: object = {}) {
  return { id: "snap-literal", operacionKey: "key-1", operacion_id: "cap-app1-literal", digest: "digest-1",
    rootSessionID: "ses_root", workID: "work-1", producerSessionID: "ses_root", agent: "investigador",
    producerMessageID: "msg_exec", fuente, corpus: site.cloudId, referencia: reference, archivo: "fuentes/app-1.txt",
    contentSha256: hash(sourceContent), bytes: Buffer.byteLength(sourceContent), representacion: "texto_literal",
    formato: "texto", created: 1, version: { tipo: "referencia", valor: reference },
    cobertura_paginas: { ...requiredCoverage.paginas }, cobertura_campos: { ...requiredCoverage.campos }, ...extra }
}
const objectSnapshotFixture = () => snapshotFixture({ id: "snap-objeto", operacionKey: "key-2", operacion_id: "cap-app1-objeto",
  digest: "digest-2", contentSha256: hash(sourceObjectContent), bytes: Buffer.byteLength(sourceObjectContent),
  representacion: "objeto_serializado", formato: "jira_issue" })
const blobFor = async (expectedSha: string) => Buffer.from(hash(sourceContent) === expectedSha ? sourceContent : sourceObjectContent)
const recoveryFixture = () => ({ sessionID: "ses_root", messageID: "msg_exec", callID: "call-1", time: 2,
  resultSha256: sourceSha256, started: true, observed: true })

function transferEvidence(snapshots: any[]) {
  return { receipts: snapshots.map(s => ({ sessionID: s.producerSessionID, messageID: s.producerMessageID,
    callID: "call-1", time: 3, input: { encargo_id: s.workID, operacion_id: s.operacion_id, fuente: s.fuente,
      corpus: s.corpus, referencia: s.referencia, version: s.version, paginas: s.cobertura_paginas, campos: s.cobertura_campos,
      resultado: s.contentSha256 === hash(sourceObjectContent) ? issueRead : sourceContent },
    result: { content: JSON.stringify({ instantanea_id: s.id, contenido: { sha256: s.contentSha256, bytes: s.bytes } }) } })),
    sessions: [{ id: "ses_root", messages: [{ id: "msg_exec", type: "assistant", content: [{ type: "tool", id: "call-1",
      name: "execute", state: { status: "completed", input: { code: "const original = await tools.jira.getJiraIssue({}); return tools.sesion.capture_agent_source({resultado:original})" } } }] }] }] }
}
const verifyTransfer = (args: any) => verifyTransferRaw({ ...transferEvidence(args.snapshots), ...args })

test("S08 transferencia: blob hash = resultado del fixture (string y objeto) en el mismo mensaje de código", async () => {
  const recoveries = [recoveryFixture()]
  const result = await verifyTransfer({ snapshots: [snapshotFixture(), objectSnapshotFixture()], recoveries, blobOf: blobFor })
  assert.equal(result.transfers.length, 2)
  assert.deepEqual(result.transfers.map(t => t.representacion).sort(), ["objeto_serializado", "texto_literal"])
  assert.deepEqual(result.transfers.map(t => [t.contentSha256, t.bytes]).sort(),
    [[hash(sourceContent), Buffer.byteLength(sourceContent)], [hash(sourceObjectContent), Buffer.byteLength(sourceObjectContent)]].sort())
  assert.equal(result.recuperacionesEnCodigo.length, 1)
  assert.equal(result.recuperacionesEnCodigo[0].snapshots.length, 2, "Las dos capturas viven en el mismo execute")
  // A capture in a different message means the original crossed the model.
  await assert.rejects(verifyTransfer({ snapshots: [snapshotFixture({ producerMessageID: "msg_otra" })], recoveries, blobOf: blobFor }),
    /mismo execute/)
  // Tampered blob or wrong size breaks the transfer.
  await assert.rejects(verifyTransfer({ snapshots: [snapshotFixture()], recoveries, blobOf: async () => Buffer.from(sourceContent.slice(1)) }))
  await assert.rejects(verifyTransfer({ snapshots: [snapshotFixture({ bytes: 1 })], recoveries, blobOf: blobFor }))
  // Snapshot of another content of the same source never passes as transfer.
  await assert.rejects(verifyTransfer({ snapshots: [snapshotFixture({ contentSha256: hash("otro"), bytes: 4 })], recoveries,
    blobOf: async () => Buffer.from("otro") }))
  // Reused operacion_id would mean an overwrite, not a new version.
  await assert.rejects(verifyTransfer({ snapshots: [snapshotFixture(), snapshotFixture({ id: "snap-2" })], recoveries, blobOf: blobFor }),
    /sobrescribe/)
  // The code never retranscribes the original as text.
  assert.equal(assertNoRetranscription("const x = 1; return x"), true)
  assert.throws(() => assertNoRetranscription(`return ${JSON.stringify(sourceContent)}`), /retranscribe/)
  assert.throws(() => assertNoRetranscription(sourceContent.slice(2000, 2500)), /retranscribe/)
})

//// Coverage of the exigido original and separate versions. ////

test("S08 cobertura: páginas/campos/pendientes exactos; captura parcial o falso completo nunca completa", () => {
  assert.equal(verifyCoverage(snapshotFixture()).completa, true)
  const partial = verifyCoverage(snapshotFixture({ cobertura_paginas: { recuperadas: [1], pendientes: [2], total: 2 } }))
  assert.equal(partial.completa, false)
  assert.ok(partial.faltantes.paginas.includes(2) && partial.pendientes.some(p => p.includes("pendientes: 2")))
  const falseComplete = verifyCoverage(snapshotFixture({ pendientes: ["comentarios:2"] }))
  assert.equal(falseComplete.completa, false, "Pendientes declarados impiden declarar completitud")
  assert.ok(falseComplete.pendientes.some(p => p.includes("comentarios:2")))
  const missingFields = verifyCoverage(snapshotFixture({ cobertura_campos: { recuperados: ["summary"], pendientes: ["customFields"] } }))
  assert.equal(missingFields.completa, false)
  assert.ok(missingFields.faltantes.campos.includes("description") && missingFields.faltantes.campos.includes("comment"))
  assert.equal(verifyCoverage(snapshotFixture({ cobertura_paginas: undefined, cobertura_campos: undefined })).completa, false,
    "Sin cobertura declarada no se acredita completitud")
  const totalWrong = verifyCoverage(snapshotFixture({ cobertura_paginas: { recuperadas: [1, 2], pendientes: [], total: 3 } }))
  assert.equal(totalWrong.completa, false, "El total exigido no se sustituye por fechas ni tamaños")
})

test("S08 versiones: diferencias y pendientes separados, sin conflation ni sobrescritura", () => {
  const v1 = snapshotFixture({ id: "snap-v1", operacion_id: "cap-v1", version: { tipo: "hash", valor: "aaa" },
    cobertura_paginas: { recuperadas: [1], pendientes: [2], total: 2 } })
  const v2 = snapshotFixture({ id: "snap-v2", operacion_id: "cap-v2", version: { tipo: "hash", valor: "bbb" } })
  const versions = verifyVersionDifferences([v1, v2])
  assert.equal(versions.versionesDistintas, true)
  assert.equal(versions.instantaneas.length, 2)
  // Each version keeps its own coverage; no aggregate completion is inferred.
  assert.equal(verifyCoverage(v1).completa, false)
  assert.equal(verifyCoverage(v2).completa, true)
  // Pending differences of one version never close another's gaps.
  assert.deepEqual(verifyCoverage(v1).faltantes.paginas, [2])
  assert.deepEqual(verifyCoverage(v2).faltantes.paginas, [])
  assert.throws(() => verifyVersionDifferences([v1, snapshotFixture({ id: "snap-v1-bis", operacion_id: "cap-v1" })]), /sobrescribe/)
})

//// Reuse per turn, recorded from the observed counter. ////

test("S08 reutilización: turno 2 sin nueva recuperación; repetición registrada con evidencia y nota, no estimación", () => {
  const first = [callFixture("started", { time: 100 }), callFixture("completed", { time: 101, outcome: "available", resultSha256: sourceSha256 })]
  const repeat = [callFixture("started", { callID: "call-2", time: 500 }),
    callFixture("completed", { callID: "call-2", time: 501, outcome: "available", resultSha256: sourceSha256 })]
  const reuse = verifyReuse({ calls: [...first, ...repeat], prompt2At: 300 })
  assert.equal(reuse.total, 2)
  assert.equal(reuse.turn1.length, 1); assert.equal(reuse.turn2.length, 1)
  assert.equal(reuse.reuseAccredited, false)
  assert.equal(reuse.repeated[0].callID, "call-2")
  assert.equal(reuse.repeated[0].motivo, null, "La justificación la acredita la revisión, no el driver")
  assert.match(reuse.repeated[0].nota, /ampliación de alcance o un cambio de versión/)
  const accredited = verifyReuse({ calls: first, prompt2At: 300, sourceUse: true })
  assert.deepEqual([accredited.turn1.length, accredited.turn2.length, accredited.reuseAccredited], [1, 0, true])
  assert.deepEqual(accredited.repeated, [])
  // Contradictory sources stay recorded and out of the recovery count.
  const contradictory = verifyReuse({ calls: [...first, callFixture("completed", { callID: "call-3", time: 502, resultSha256: hash("otro") })], prompt2At: 300 })
  assert.equal(contradictory.total, 1, "La lectura de otro contenido no cuenta como recuperación de la fuente")
  assert.equal(contradictory.contradicciones.length, 1)
})

//// Reading the artifact: full course and line view; known ID alone is not a read. ////

function readOutputPages(content: string, page: number) {
  const limite = 1600, start = page * limite, end = Math.min(start + limite, content.length)
  return { artefacto_id: "snap-literal", archivo: "fuentes/app-1.txt", sha256: hash(content),
    inicio: start, fin: end, total: content.length, unidad: "UTF-16", contenido: content.slice(start, end),
    cursor: end < content.length ? `cursor-${page + 1}` : null, instantanea: true, fuente,
    corpus: site.cloudId, referencia: reference, representacion: "texto_literal", formato: "texto" }
}
function sessionsWithToolParts(parts: any, sessionID = parent.id) {
  const content = parts.map((output: any, index: number) => ({ type: "tool", id: `call-${index}`, name: "session_artifacts",
    state: { status: "completed", input: { action: "read", encargo_id: "work-1", corpus: site.cloudId, referencia: reference,
      artefacto_id: output.artefacto_id, archivo: output.archivo, ...(output.vista ? { vista: output.vista } : {}),
      ...(output.inicio > 0 ? { cursor: `cursor-${output.inicio / 1600}` } : {}) },
      content: [{ type: "text", text: JSON.stringify({ fuente, corpus: site.cloudId, referencia: reference, ...output }) }] } }))
  return [{ id: sessionID, agent: "investigador",
    messages: [{ id: "msg_read", type: "assistant", finish: "stop", content }] }]
}

test("S08 lecturas: curso completo por cursor y vista linea íntegros; lectura parcial queda pendiente", () => {
  const snapshot = snapshotFixture()
  const pages = Array.from({ length: Math.ceil(sourceContent.length / 1600) }, (_, page) => readOutputPages(sourceContent, page))
  const full = sessionsWithToolParts(pages)
  const result = verifyArtifactReads(sessionsWithToolParts(pages), snapshot)
  assert.equal(result.fullCourse, true)
  assert.equal(result.lecturasCompletas, true)
  assert.equal(result.paginas, pages.length)
  // Partial reading: first page only, cursor never followed.
  const partial = verifyArtifactReads(sessionsWithToolParts([pages[0]]), snapshot)
  assert.equal(partial.fullCourse, false)
  assert.equal(partial.lecturasCompletas, false, "Faltan páginas por leer; no se acredita lectura completa")
  // The single >2000-char line is recovered whole by the line view.
  const lineView = verifyArtifactReads(sessionsWithToolParts([{ artefacto_id: "snap-literal", archivo: "fuentes/app-1.txt",
    vista: "linea", instantanea: true, total_lineas: 1, total_unidades: sourceContent.length,
    lineas: [{ numero: 1, contenido: sourceContent }], excede_limite: true, cursor: null }]), snapshot)
  assert.equal(lineView.lineView, true)
  assert.equal(lineView.lecturasCompletas, true)
  // A different artefacto or a failed call never counts as a read.
  assert.equal(verifyArtifactReads(sessionsWithToolParts([{ artefacto_id: "snap-otro", archivo: "fuentes/app-1.txt",
    vista: "linea", instantanea: true, total_lineas: 1, lineas: [{ numero: 1, contenido: "x" }], cursor: null }]), snapshot).leida, false)
  assert.equal(verifyArtifactReads([{ ...parent, messages: [{ id: "m", type: "assistant", content: [{ type: "tool",
    name: "session_artifacts", state: { status: "error", content: [] } }] }] }], snapshot).leida, false)
  // False reuse: only a known route/hash, no real read anywhere.
  const outputs = sessionArtifactOutputs(sessionsWithToolParts(pages))
  const backed = accreditedSourceUse({ snapshots: [snapshot], readings: [result] })
  assert.equal(backed.acreditado, true)
  assert.deepEqual(backed.snapshotsConLectura, ["snap-literal"])
  const unbacked = accreditedSourceUse({ snapshots: [snapshot] })
  assert.equal(unbacked.acreditado, false)
  assert.deepEqual(unbacked.snapshotsSoloCitables, ["snap-literal"], "Citar la ruta o hash conocido no es leer")
})

//// Optional independent review: exact, independent, same version. ////

function reviewStates(extra: object = {}) {
  return [{ work: { "work-1": { id: "work-1", reviews: [{ sessionID: "ses_revisor", artifactID: "art-1" }] } },
    artifacts: { "art-1": { id: "art-1", workID: "work-1", producerSessionID: "ses_prod", manifestHash: "hash-manifiesto-1" } },
    reviews: { "art-1": { artifactID: "art-1", manifestHash: "hash-manifiesto-1", reviewerSessionID: "ses_revisor",
      reports: [], verdict: { artefacto_id: "art-1", hash_manifiesto: "hash-manifiesto-1", resultado: "favorable",
        alcance: [], aprobados: [], pendientes: [], bloqueados: [] } } }, ...extra }]
}
const producerSnapshots = () => [snapshotFixture({ id: "snap-a", producerSessionID: "ses_prod" })]
const reviewerSessions = (artefacto_id = "snap-a") => sessionsWithToolParts([{ ...readOutputPages(sourceContent, 0),
  artefacto_id, contenido: sourceContent, fin: sourceContent.length, cursor: null }], "ses_revisor")
  .map(s => ({ ...s, agent: "revisor", parentID: "ses_prod" }))
const verifyReviewIfExists = (args: any) => verifyReviewRaw({ blobOf: blobFor, ...args })

test("S08 revisión (si existe): lectura propia de la misma versión y dictamen exacto; sin herencia ni versión equivocada", async () => {
  const verified = await verifyReviewIfExists({ states: reviewStates({ reviews: {} }), sessions: reviewerSessions(), snapshots: producerSnapshots() })
  assert.equal(verified.exists, true)
  assert.equal(verified.reviews.length, 1)
  assert.equal(verified.reviews[0].verdict, null, "Sin informe nativo confirmado no se acredita dictamen")
  assert.deepEqual(verified.reviews[0].versionesLeidas, [hash(sourceContent)])
  // No review at all stays pending for a separate reviewer, never approved.
  assert.deepEqual(await verifyReviewIfExists({ states: [{}], sessions: [], snapshots: [] }), { exists: false })
  // The reviewer read a different version than the one the delivery used.
  const wrongVersion = [...producerSnapshots(), { id: "snap-vieja", producerSessionID: "ses_otro",
    contentSha256: hash("version anterior"), fuente }]
  await assert.rejects(verifyReviewIfExists({ states: reviewStates({ reviews: {} }), sessions: reviewerSessions("snap-vieja"), snapshots: wrongVersion }), /leer realmente/)
  // Inherited approval: the reviewer never read the source itself.
  await assert.rejects(verifyReviewIfExists({ states: reviewStates({ reviews: {} }), sessions: [{ id: "ses_revisor", parentID: "ses_prod", agent: "revisor", messages: [] }], snapshots: producerSnapshots() }), /leer realmente la fuente/)
  // Reviewer cannot be the producer of the delivery.
  const selfReview = [{ ...reviewStates()[0], artifacts: { "art-1": { id: "art-1",
    producerSessionID: "ses_revisor", manifestHash: "hash-manifiesto-1" } } }]
  await assert.rejects(verifyReviewIfExists({ states: selfReview,
    sessions: [{ id: "ses_revisor", agent: "revisor", messages: [] }], snapshots: producerSnapshots() }), /productor/)
  // Exact approval: wrong manifest hash or artifact in the verdict is rejected.
  const base = reviewStates()
  const verdict = (base[0].reviews["art-1"] as any).verdict
  await assert.rejects(verifyReviewIfExists({ states: reviewStates({ reviews: { "art-1": { ...base[0].reviews["art-1"],
    verdict: { ...verdict, hash_manifiesto: "otro" } } } }), sessions: reviewerSessions(), snapshots: producerSnapshots() }), /hash exacto/)
  await assert.rejects(verifyReviewIfExists({ states: reviewStates({ reviews: { "art-1": { ...base[0].reviews["art-1"],
    verdict: { ...verdict, artefacto_id: "art-otro" } } } }), sessions: reviewerSessions(), snapshots: producerSnapshots() }), /entrega exacta/)
  // A review with no verdict yet is still a review with its reads verified.
  const pending = await verifyReviewIfExists({ states: reviewStates({ reviews: {} }), sessions: reviewerSessions(), snapshots: producerSnapshots() })
  assert.equal(pending.reviews[0].verdict, null)
})

test("S08 revisión requerida: nunca autoaprueba con palabras ni hashes; sufficientForS08 false", () => {
  const checklist = reviewChecklistS08({ sessionID: parent.id,
    finals: [{ turn: 1, sessionID: parent.id, messageID: "msg_final_1", sha256: hash("respuesta 1") },
      { turn: 2, sessionID: parent.id, messageID: "msg_final_2", sha256: hash("respuesta 2") }],
    transfer: { transfers: [{ snapshotID: "snap-literal" }], recuperacionesEnCodigo: [{ recovery: recoveryFixture(), snapshots: ["snap-literal"] }] },
    coverages: [verifyCoverage(snapshotFixture())], reuse: { turn1: [], turn2: [], total: 1, contradicciones: [], reuseAccredited: true, repeated: [] },
    reads: [verifyArtifactReads(sessionsWithToolParts(
      Array.from({ length: Math.ceil(sourceContent.length / 1600) }, (_, page) => readOutputPages(sourceContent, page))), snapshotFixture())],
    usoFuente: { acreditado: true }, entrega: { exists: true, artifactID: "art-1" }, revision: { exists: false } })
  assert.equal(checklist.status, "review_required")
  assert.equal(checklist.sufficientForS08, false)
  assert.equal(checklist.conditions.length, 6)
  assert.ok(checklist.conditions.every(condition => condition.verdict === "pending" && condition.contradictionCheck === "pending"))
  assert.deepEqual(checklist.finals.map(f => f.turn), [1, 2])
  assert.equal(checklist.recuperacionesObservadas.reuseAccredited, true)
  assert.match(JSON.stringify(checklist), /nunca autoaprobar/i)
  assert.ok(checklist.evidence.includes("review-required.json") && checklist.evidence.includes("fixture-calls.json"))
})

test("S08 revisión nativa: fuente y entrega completas antes del dictamen; bytes de informe exactos", async () => {
  const root = await mkdtemp(join(temp, "s08-review-driver-"))
  const deliveryText = "Entrega completa v1", reportText = "Cotejo independiente completo"
  const manifest = (path: string, text: string) => [{ path, sha256: hash(text), bytes: Buffer.byteLength(text) }]
  const files = manifest("delivery.md", deliveryText), reportFiles = manifest("delivery-sanity-check.md", reportText)
  await writeFile(join(root, files[0].path), deliveryText)
  await writeFile(join(root, reportFiles[0].path), reportText)
  const delivery: any = { id: "art-1", workID: "work-1", producerSessionID: "ses_prod", files,
    manifestHash: hash(JSON.stringify(files)), deliveries: ["delivery.md"] }
  const report: any = { id: "report-1", producerSessionID: "ses_revisor", producerMessageID: "msg-publish",
    files: reportFiles, manifestHash: hash(JSON.stringify(reportFiles)), origin: { delivery: "delivery.md" } }
  const verdict = { artefacto_id: delivery.id, hash_manifiesto: delivery.manifestHash, resultado: "favorable" }
  const output = { artefacto_id: report.id, sesion: root, hash_manifiesto: report.manifestHash }
  const states = [{ work: { "work-1": { id: "work-1", corpus: site.cloudId, referencia: reference,
    reviews: [{ sessionID: "ses_revisor", artifactID: delivery.id }] } }, artifacts: { [delivery.id]: delivery, [report.id]: report },
    operations: { delivery: { phase: "confirmed", artifact: delivery, result: { sesion: root } },
      report: { phase: "confirmed", artifact: report, result: output } },
    reviews: { report: { artifactID: delivery.id, reviewerSessionID: "ses_revisor", reportArtifactID: report.id, verdict } } }]
  const sourceSnapshots = [...producerSnapshots(), ...commentContents.map((text, n) => snapshotFixture({
    id: `snap-page-${n}`, producerSessionID: "ses_prod", contentSha256: hash(text), bytes: Buffer.byteLength(text) }))]
  const sourceReads: any = sessionsWithToolParts(sourceSnapshots.map((snapshot, n) => ({
    ...readOutputPages(n ? commentContents[n - 1] : sourceContent, 0), artefacto_id: snapshot.id,
    contenido: n ? commentContents[n - 1] : sourceContent, fin: n ? commentContents[n - 1].length : sourceContent.length,
    cursor: null })), "ses_revisor")[0]
  sourceReads.agent = "revisor"; sourceReads.parentID = "ses_prod"
  const deliveryReads: any = sessionsWithToolParts([{ artefacto_id: delivery.id, archivo: "delivery.md", sha256: hash(deliveryText),
    contenido: deliveryText, inicio: 0, fin: deliveryText.length, total: deliveryText.length, cursor: null }], "ses_revisor")[0]
  const publication: any = { id: "msg-publish", type: "assistant", content: [{ type: "tool", name: "write_review_documents",
    state: { status: "completed", input: { entrega: join(root, "delivery.md"), sanidad: reportText, dictamen: verdict },
      content: [{ type: "text", text: JSON.stringify(output) }] } }] }
  const sessions = [{ ...sourceReads, messages: [sourceReads.messages[0], deliveryReads.messages[0], publication] }]
  const blobOf = async (sha: string) => Buffer.from(commentContents.find(text => hash(text) === sha) ?? sourceContent)
  assert.equal((await verifyReviewIfExists({ states, sessions, snapshots: sourceSnapshots, blobOf })).reviews[0].verdict.resultado, "favorable")
  const partial = structuredClone(sessions)
  partial[0].messages[0].content.pop()
  await assert.rejects(verifyReviewIfExists({ states, sessions: partial, snapshots: sourceSnapshots, blobOf }), /todos los componentes/)
  const late = [{ ...sessions[0], messages: [publication, sourceReads.messages[0], deliveryReads.messages[0]] }]
  await assert.rejects(verifyReviewIfExists({ states, sessions: late, snapshots: sourceSnapshots, blobOf }), /leer realmente/)
  await writeFile(join(root, reportFiles[0].path), "informe adulterado")
  await assert.rejects(verifyReviewIfExists({ states, sessions, snapshots: sourceSnapshots, blobOf }), /bytes changed/)
})

test("S08 aceptación adversarial: mismo mensaje/hash no sustituye el mismo execute ni el tipo recibido", async () => {
  const snapshot = snapshotFixture(), evidence = transferEvidence([snapshot])
  await assert.rejects(verifyTransferRaw({ snapshots: [snapshot], recoveries: [recoveryFixture()], blobOf: blobFor,
    ...evidence, receipts: evidence.receipts.map(r => ({ ...r, callID: "otro-execute" })) }), /mismo execute/)
  await assert.rejects(verifyTransferRaw({ snapshots: [snapshot], recoveries: [recoveryFixture()], blobOf: blobFor,
    ...evidence, receipts: [] }), /Recibo nativo/)
  const declared = snapshotFixture({ representacion: "objeto_serializado" })
  const exact = transferEvidence([declared])
  exact.receipts[0].input.representacion = "objeto_serializado"
  const kept = await verifyTransferRaw({ snapshots: [declared], recoveries: [recoveryFixture()], blobOf: blobFor, ...exact })
  assert.equal(kept.transfers[0].contentSha256, sourceSha256, "Etiqueta objeto_serializado no reserializa un string")
})

test("S08 aceptación adversarial: líneas correctas con contenido falso, cursor final falso y mezcla de actores no acreditan lectura", () => {
  const snapshot = snapshotFixture(), pages = Array.from({ length: Math.ceil(sourceContent.length / 1600) }, (_, n) => readOutputPages(sourceContent, n))
  const fakeLine = sessionsWithToolParts([{ artefacto_id: snapshot.id, archivo: snapshot.archivo, vista: "linea", instantanea: true,
    total_lineas: 1, total_unidades: sourceContent.length, lineas: [{ numero: 1, contenido: "contenido contradictorio" }], cursor: null }])
  assert.equal(verifyArtifactReads(fakeLine, snapshot).lecturasCompletas, false)
  const badCursor = structuredClone(pages); badCursor.at(-1)!.cursor = "todavia-pendiente"
  assert.equal(verifyArtifactReads(sessionsWithToolParts(badCursor), snapshot).lecturasCompletas, false)
  const mixed = [...sessionsWithToolParts([pages[0]], "actor-a"), ...sessionsWithToolParts(pages.slice(1), "actor-b")]
  assert.equal(verifyArtifactReads(mixed, snapshot).lecturasCompletas, false)
  const badInput = sessionsWithToolParts(pages)
  for (const part of badInput[0].messages[0].content) part.state.input.corpus = "otro"
  assert.equal(verifyArtifactReads(badInput, snapshot).lecturasCompletas, false)
})

test("S08 admisión: idle previo, input no admitido y primer turno sin final impiden enviar el segundo", () => {
  const admission = { inboxID: "user-1", messageID: "assistant-1" }
  const input = { id: "user-1", type: "user", text: promptTurn1 }
  const final = { id: "assistant-1", type: "assistant", finish: "stop", content: [{ type: "text", text: "resultado" }] }
  assert.throws(() => verifyTurn([{ type: "idle" }, input, final], admission, promptTurn1), /Admisión/)
  assert.throws(() => verifyTurn([final, { type: "idle" }], admission, promptTurn1), /Admisión/)
  assert.throws(() => verifyTurn([input, { ...final, finish: "tool_calls" }, { type: "idle" }], admission, promptTurn1), /Admisión/)
  assert.equal(verifyTurn([input, final, { type: "idle" }], admission, promptTurn1).id, final.id)
})

test("S08 componentes: páginas separadas completan solo su versión; repetición de comentarios delegada cuenta", () => {
  const snapshots = [snapshotFixture(), snapshotFixture({ id: "page1", cobertura_paginas: { recuperadas: [1], pendientes: [2], total: 2 } }),
    snapshotFixture({ id: "page2", cobertura_paginas: { recuperadas: [2], pendientes: [], total: 2 } })]
  const transfers = [{ snapshotID: snapshots[0].id, component: "issue" }, { snapshotID: "page1", component: "comments:0" },
    { snapshotID: "page2", component: "comments:2" }]
  assert.equal(verifyCoverageGroup(snapshots, transfers).completa, true)
  assert.equal(verifyCoverageGroup(snapshots.slice(0, 2), transfers).completa, false)
  snapshots[2].version = { tipo: "referencia", valor: "version-distinta" }
  assert.equal(verifyCoverageGroup(snapshots, transfers).completa, false)
  const contentHashed = snapshots.map(s => ({ ...s, version: undefined }))
  assert.equal(verifyCoverageGroup(contentHashed, transfers).completa, true,
    "Los componentes transferidos de la misma versión invariante conservan hash aunque no declaren version opcional")
  const calls = [0, 1].flatMap(n => [callFixture("started", { name: "getJiraIssueComments", component: "comments:0", invocationID: `read-${n}`,
    sessionID: n ? "ses_delegado" : "ses_root", time: 10 + n }), callFixture("completed", { name: "getJiraIssueComments",
    component: "comments:0", invocationID: `read-${n}`, sessionID: n ? "ses_delegado" : "ses_root", time: 20 + n,
    resultSha256: hash(commentContents[0]), result: commentContents[0] })])
  const reuse = verifyReuse({ calls, prompt2At: 100, sourceUse: true })
  assert.equal(reuse.total, 2)
  assert.equal(reuse.repeated.length, 1)
  assert.equal(reuse.reuseAccredited, false, "Cero llamadas en turno 2 no excusa duplicar el recorrido común en turno 1")
  assert.equal(verifyReuse({ calls: [], prompt2At: 100, sourceUse: true }).reuseAccredited, false)
})

//// Timeout: cleanup before the final record; credential never fabricated true. ////

const timeoutContract = { paths: Object.fromEntries([
  ["/api/info", "server.info"], ["/api/session", "session.list"], ["/api/session/{sessionID}", "session.get"],
  ["/api/session/{sessionID}/message", "session.message.list"],
].map(([path, operationId]) => [path, { get: { operationId, parameters: ["limit", "cursor", "order"].map(name => ({ name })) } }])) }

function readFixture() {
  return async (path: string) => {
    if (path === "/openapi.json") return timeoutContract
    if (path === "/api/info") return { version: "2.1.2" }
    if (path === "/api/session/ses_root") return { data: parent }
    const url = new URL(path, "http://fixture"), cursor = url.searchParams.get("cursor")
    if (url.pathname === "/api/session") return { data: url.searchParams.get("parentID") === parent.id
      ? [{ id: "ses_child", parentID: parent.id, agent: "investigador" }] : [], cursor: { next: null } }
    return { data: [{ id: cursor ? "msg_final" : "msg_first", type: "assistant", finish: "stop", content: [
      { type: "text", text: "Complete synthetic source" }, { type: "reasoning", text: "PRIVATE_REASONING" },
    ], native: { secret: "PRIVATE_NATIVE" } }], cursor: { next: cursor ? null : "page-2" } }
  }
}

test("S08 timeout: espera abortada no cancela; interrupt antes del registro final y evidencia parcial retenida", { timeout: 10_000 }, async t => {
  const root = await mkdtemp(join(temp, "s08-driver-timeout-")), host = join(root, "consumer"), interrupts: string[] = []
  await mkdir(host)
  let active = true, activeAtFirstInterrupt = false
  const read = readFixture()
  const http = createServer(async (req, res) => {
    if (req.url?.endsWith("/wait")) return
    let result: any
    if (req.url?.includes("/interrupt")) {
      if (!interrupts.length) activeAtFirstInterrupt = active
      interrupts.push(req.url); result = { interrupted: interrupts.length === 1 }; active = false
    }
    else if (req.url === "/api/session" && req.method === "POST") result = { data: parent }
    else if (req.url?.endsWith("/prompt")) result = {}
    else if (req.url?.endsWith("/run")) result = { output: { events: ["native event"] } }
    else if (req.url?.includes("/message?") && req.url?.includes("cursor=")) { res.writeHead(503); res.end(); return }
    else result = await read(req.url!)
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(result))
  })
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
  t.after(() => { http.closeAllConnections(); http.close() })
  const request = privateRequest({ OPENCODE_TEST_SERVER: `http://127.0.0.1:${(http.address() as any).port}`, OPENCODE_PASSWORD: "synthetic" }, host)
  const summary: any = { model: { providerID: "fixture", id: "test" } }
  await assert.rejects(runTrial({ root, host, request, writer: evidenceWriter(root), summary, flow: 100 }), /timeout/i)
  assert.equal(active, false)
  assert.equal(activeAtFirstInterrupt, true, "El timeout HTTP detuvo la ejecución; interrupt explícito para limpiar")
  assert.deepEqual(interrupts.sort(), [`/api/session/ses_child/interrupt?resume=false`, `/api/session/${parent.id}/interrupt?resume=false`])
  assert.equal(summary.interruptRequests.length, 2)
  assert.equal(summary.interruptRequests[0].interrupted, true)
  // Evidence order inside summary: interrupts happened before the final record.
  assert.equal(summary.interruptRequests[0].request, "succeeded")
  assert.equal(summary.check, "failed")
  assert.equal(summary.coverage.tree, "partial")
  assert.equal(JSON.parse(await readFile(join(root, "partial-ses_root.json"), "utf8"))[0].id, "msg_first")
  assert.deepEqual(JSON.parse(await readFile(join(root, "events.json"), "utf8")), ["native event"])
  assert.deepEqual(JSON.parse(await readFile(join(root, "states.json"), "utf8")), [])
  assert.deepEqual(JSON.parse(await readFile(join(root, "fixture-calls.json"), "utf8")), [])
  assert.match(await readFile(join(root, "driver-events.jsonl"), "utf8"), /wait.error/)
  assert.ok(summary.evidenceErrors.some((e: any) => e.stage === "history"))
  t.diagnostic(`Retained bounded failure evidence: ${root}`)
})

test("S08 supervisor: registro final con credencial desconocida, nunca true; termina solo árbol propio", { timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(temp, "s08-supervision-"))
  const error = new Error("Driver supervision budget exhausted")
  ; (error as any).cleanupError = "Private process tree termination failed"
  await recordSupervisionFailure(root, error)
  const summary = JSON.parse(await readFile(join(root, "summary.json"), "utf8"))
  assert.equal(summary.activeCredentialUnchanged, "unknown")
  assert.notEqual(summary.activeCredentialUnchanged, true, "Sin comprobación real nunca se registra true")
  assert.equal(summary.check, "failed")
  assert.equal(summary.sufficientForS08, false)
  assert.equal(summary.supervisionError, "Driver supervision budget exhausted")
  assert.equal(summary.cleanupError, "Private process tree termination failed")
  // An existing real check result is preserved, never overwritten.
  const previous = await mkdtemp(join(temp, "s08-supervision-prior-"))
  await evidenceWriter(previous).save("summary.json", { scope: "S08 behavior trial only", activeCredentialUnchanged: true, check: "in_progress" })
  await recordSupervisionFailure(previous, new Error("killed"))
  assert.equal(JSON.parse(await readFile(join(previous, "summary.json"), "utf8")).activeCredentialUnchanged, true)
  // The supervision budget kills only its own process tree.
  const processRoot = await mkdtemp(join(temp, "s08-driver-process-")), pids = join(processRoot, "pids.json")
  const script = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000)`
  await assert.rejects(runBounded(process.execPath, ["-e", script, pids], { cwd: processRoot, timeout: 1000 }), /supervision budget/)
  for (const pid of JSON.parse(await readFile(pids, "utf8"))) assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i)
  t.diagnostic(`Retained supervision evidence: ${root}, ${processRoot}`)
})

//// Real private server: the two-turn trial with a programmed provider, zero models. ////

test("S08 motor privado: ensayo determinista de dos turnos con proveedor programado; transferencia, reutilización y lecturas reales", { timeout: 300_000 }, async t => {
  const root = await mkdtemp(join(temp, "s08-driver-native-"))
  const readLimit = 1600
  const pagesExpected = Math.ceil(sourceContent.length / readLimit)
  let count = 0, turn = 1
  let workID: string | undefined, literalID: string | undefined, archivo: string | undefined
  let rawPages = 0, lineViews = 0, reuseViews = 0, extraViews = 0, published = false
  let commentIDs: string[] = []
  let commentFiles: string[] = []
  const provider = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    const textOfMessage = (message: any) => typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("")
      : JSON.stringify(message.content ?? "")
    const results = (body.messages ?? []).filter((message: any) => message.role === "tool").map(textOfMessage)
    const last = results.at(-1) ?? ""
    // Bounded evidence of what the programmed provider received: roles and sizes only.
    await appendFileBounded(root, count, req.url ?? "", (body.messages ?? []).map((message: any) => message.role), last)
    const index = count++
    const tool = (name: string, args: object) => ({ tool_calls: [{ index: 0, id: `programmed-${index}`, type: "function",
      function: { name, arguments: JSON.stringify(args) } }] })
    let delta: any, finish = "tool_calls"
    if (index === 0) delta = tool("session_work", { action: "create",
      pregunta: "Q-CANCELACION y Q-ABONO de APP-1", criterios: [], corpus: site.cloudId, referencia: reference })
    else if (index === 1) {
      workID = /"id"\s*:\s*"(work-[a-f0-9-]+)"/.exec(last)![1]
      const base = `encargo_id:${JSON.stringify(workID)},corpus:${JSON.stringify(site.cloudId)},referencia:${JSON.stringify(reference)},fuente:"APP-1",version:{tipo:"referencia",valor:${JSON.stringify(reference)}},paginas:{recuperadas:[1,2],pendientes:[],total:2},campos:{recuperados:${JSON.stringify(requiredCoverage.campos.recuperados.map(field => "fields." + field))},pendientes:[]}`
      const code = `const issue = await tools.jira.getJiraIssue({cloudId:${JSON.stringify(site.cloudId)},issueIdOrKey:"APP-1"});
        const parse = value => typeof value === "string" ? JSON.parse(value) : value;
        const literal = await tools.sesion.capture_agent_source({${base},operacion_id:"cap-app1-literal",resultado:issue});
        const objeto = await tools.sesion.capture_agent_source({${base},operacion_id:"cap-app1-objeto",resultado:parse(issue)});
        const comments = [];
        for (const startAt of [0,2]) {
          const page = await tools.jira.getJiraIssueComments({cloudId:${JSON.stringify(site.cloudId)},issueIdOrKey:"APP-1",startAt,maxResults:2});
          comments.push(parse(await tools.sesion.capture_agent_source({${base},operacion_id:"cap-comments-"+startAt,
            fuente:"APP-1:comments:"+startAt,version:undefined,
            paginas:{recuperadas:[startAt/2+1],pendientes:[],total:2},resultado:page})));
        }
        return JSON.stringify({literal: parse(literal), objeto: parse(objeto), comments})`
      delta = tool("execute", { code })
    }
    else if (turn === 1) {
      if (!literalID) {
        const caps = JSON.parse(last)
        literalID = caps.literal.instantanea_id
        archivo = caps.literal.archivo
        commentIDs = caps.comments.map((c: any) => c.instantanea_id)
        commentFiles = caps.comments.map((c: any) => c.archivo)
      }
      const readArgs = (extra: object = {}) => ({ action: "read", encargo_id: workID, corpus: site.cloudId,
        referencia: reference, artefacto_id: literalID, archivo, limite: readLimit, ...extra })
      const cursor = /"cursor"\s*:\s*"([^"]+)"/.exec(last)?.[1]
      if (rawPages === 0 || cursor) { rawPages++; delta = tool("session_artifacts", readArgs(cursor ? { cursor } : {})) }
      else if (lineViews === 0) { lineViews++; delta = tool("session_artifacts", readArgs({ vista: "linea", limite: 500 })) }
      else if (extraViews < 2) { delta = tool("session_artifacts", readArgs({ artefacto_id: commentIDs[extraViews],
        archivo: commentFiles[extraViews++], vista: "linea" })) }
      else if (!published) {
        published = true
        delta = tool("write_report_pair", { slug: "consulta", encargo_id: workID, operacion_id: "programmed-s08",
          resumen_ejecutivo: `PROGRAMMED. Q-CANCELACION: ${cancellationRule}. Q-ABONO: ${refundRule}.`,
          informe_detallado: `PROGRAMMED. Pendientes separados: Q-CANCELACION ninguno; Q-ABONO ninguno. Fuente común: APP-1 (${literalID}).` })
      }
      else { turn = 2; finish = "stop"
        delta = { content: `PROGRAMMED. Q-CANCELACION: ${cancellationRule}. Q-ABONO: ${refundRule}. Pendientes separados: Q-CANCELACION ninguno; Q-ABONO ninguno. Fuente común reutilizada: APP-1 (${literalID}).` } }
    }
    else {
      if (reuseViews < 3 && literalID) {
        const index = reuseViews++
        delta = tool("session_artifacts", { action: "read", encargo_id: workID, corpus: site.cloudId, referencia: reference,
          artefacto_id: [literalID, ...commentIDs][index], archivo: index ? commentFiles[index - 1] : archivo, vista: "linea", limite: 500 }) }
      else { finish = "stop"; delta = { content: `PROGRAMMED. Q-GARANTIA: pendiente, ${guaranteePending}. Sin nueva recuperación de la fuente: se usa la ya disponible del encargo (${literalID}).` } }
    }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  const fixtureModel = { providerID: "fixture", id: "test" }
  const consumer = await prepareTrial(root, fixtureModel, "")
  assert.ok(consumer.settings.plugins.some((url: string) => url.includes("source-model/fixture")), "Fixture fuente S08 instalado")
  assert.ok(!consumer.settings.plugins.some((url: string) => url.includes("evidence-model/fixture")), "Fixture S02 ausente")
  consumer.settings.model = "fixture/test"
  consumer.settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "fixture", effect: "allow" }]
  consumer.settings.providers = { fixture: { name: "Programmed; not a model", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${(provider.address() as any).port}/v1` },
    models: { test: { capabilities: { tools: true } } } } }
  await writeFile(join(consumer.config, "opencode.json"), JSON.stringify(consumer.settings))
  const summary: any = { scope: "deterministic two-turn trial; programmed provider, not a model", model: fixtureModel, realModelCalls: 0 }
  await evidenceWriter(root).save("case.json", { prompts: { turn1: promptTurn1, turn2: promptTurn2 }, model: fixtureModel,
    fuente, requiredCoverage, originalSintetico: issue, longHtmlLineaUnica: longHtml })
  const { host, env } = consumer
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host)
    const result = await runTrial({ root, host, request, writer: evidenceWriter(root, [connected.OPENCODE_PASSWORD]), summary, flow: 60_000 })
    assert.equal(summary.mechanicalCheck, "passed")
    assert.equal(summary.check, "review_required")
    assert.equal(summary.sufficientForS08, false)
    // One real observed recovery in turn 1; none in turn 2: reuse accredited.
    assert.equal(result.calls.filter((call: any) => call.name === "getJiraIssue" && call.state === "completed").length, 1)
    assert.equal(summary.reuse.reuseAccredited, true)
    assert.equal(summary.reuse.turn1, 3)
    assert.equal(summary.reuse.turn2, 0)
    // Two snapshots of the same source: literal string and deterministic object
    // serialization, byte-exact against the fixture result.
    assert.equal(result.snapshots.length, 4)
    assert.deepEqual(result.snapshots.map((snapshot: any) => snapshot.contentSha256).sort(),
      [hash(sourceContent), hash(sourceObjectContent), ...commentContents.map(hash)].sort())
    assert.equal(summary.transferencia.instantaneas, 4)
    assert.equal(summary.transferencia.recuperacionesEnCodigo.length, 3)
    assert.equal(summary.transferencia.recuperacionesEnCodigo[0].snapshots.length, 2)
    // Complete coverage declared by the same code that recovered the original.
    assert.equal(summary.cobertura.acreditadaCompleta, true)
    // Full-course cursor reading plus the single >2000-char line by view.
    assert.equal(summary.lecturas.acreditadasCompletas, true)
    const lectures = summary.lecturas.instantaneas as any[]
    assert.equal(lectures.filter(lecture => lecture.lecturasCompletas).length, 3, "Lectura íntegra de issue y páginas de comentarios")
    assert.ok(lectures.some(lecture => lecture.fullCourse && lecture.paginas === pagesExpected))
    assert.ok(lectures.some(lecture => lecture.lineView))
    // The execute code passed the value directly: no retranscription as text.
    const inputs = JSON.parse(await readFile(join(root, "tool-inputs.json"), "utf8"))
    const execution = inputs.find((input: any) => input.name === "execute")
    assert.ok(execution && execution.status === "completed")
    assert.match(execution.input.code, /tools\.jira\.getJiraIssue/)
    assert.match(execution.input.code, /tools\.sesion\.capture_agent_source/)
    assert.equal(assertNoRetranscription(execution.input.code), true)
    // A delivery the reviewer-if-any can hang on, with verified bytes.
    assert.equal(summary.entrega.exists, true)
    assert.equal(summary.entrega.files, 2)
    assert.equal(summary.revision.exists, false, "Este ensayo determinista no encarga revisor; queda pendiente")
    assert.equal(summary.finals.length, 2)
    // The checklist never approves: separate review required.
    const checklist = JSON.parse(await readFile(join(root, "review-required.json"), "utf8"))
    assert.equal(checklist.status, "review_required")
    assert.equal(checklist.sufficientForS08, false)
    assert.ok(checklist.conditions.every((condition: any) => condition.verdict === "pending"))
    assert.equal(checklist.conditions.length, 6)
    assert.equal(count, pagesExpected + 11, "Una vuelta por página y lecturas íntegras de cada componente en ambos turnos")
    assert.equal(turn, 2)
  }, expectedPlugins)
  await evidenceWriter(root).save("deterministic-verification.json", { providerRequests: count, realModelCalls: 0,
    serverExited: true, mechanicalCheck: summary.mechanicalCheck, check: summary.check, sufficientForS08: false,
    recoveriesObserved: summary.reuse.total, reuseAccredited: summary.reuse.reuseAccredited,
    snapshotsTransferred: summary.transferencia.instantaneas, programmedProviderOnly: true })
  t.diagnostic(`Private server exited; retained PROGRAMMED-only evidence: ${root}`)
})

async function appendFileBounded(root: string, index: number, url: string, roles: any, last: string) {
  const { appendFile } = await import("node:fs/promises")
  await appendFile(join(root, "provider-requests.jsonl"), JSON.stringify({ index, url, roles: roles.map((r: any) => r),
    lastToolChars: last.length, lastToolStart: last.slice(0, 120) }) + "\n").catch(() => {})
}
