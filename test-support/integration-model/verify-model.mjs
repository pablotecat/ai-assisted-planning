// Opt-in S14 campaign. Reuses the installed private consumer, complete S08
// original and native capture/verification helpers; never approves semantics.
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { withServer } from "../opencode.mjs"
import { captureSessions, nativeWait, privateRequest, runBounded, verifyExecutions, verifyPublicationBytes } from "../delegation/verify-model.mjs"
import { evidenceWriter, hash, loadStates, textOf } from "../evidence-model/verify-model.mjs"
import { answerAfter, descendantsOf, readCredential } from "../context-model/verify-model.mjs"
import { blobReader, loadCaptureCalls, loadSourceCalls, prepareTrial, verifyArtifactReads,
  verifyCoverageGroup, verifyReuse, verifyReviewIfExists, verifyTransfer } from "../source-model/verify-model.mjs"
import { promptTurn2, reference, sourceComponents } from "../source-model/data.mjs"

const source = fileURLToPath(new URL("../..", import.meta.url))
export const model = { providerID: "plainconcepts", id: "glm-5-3" }
export const objective = `Refina APP-1 de https://fixture.atlassian.net y entrega su borrador completo con incidencias y trazabilidad. Q-CANCELACION y Q-ABONO requieren dos cotejos independientes del investigador antes de cerrar. El original completo incluye la descripción con su tabla HTML, campos personalizados y todos los comentarios paginados. Sitio y alcance confirmados: únicamente APP-1; referencia ${reference}. No hay código ni documentación local. Las carencias conservan su pendiente y efecto; no son decisiones nuevas ni requisitos retirados. Guardado confirmado. Necesito revisión independiente de la versión exacta entregada. Son datos ficticios.`
export const promotion = "Necesito otra entrega completa con exactamente los mismos bytes del borrador anterior, sin reconstruir su texto. Somete esta versión nueva a revisión independiente sobre esa versión exacta antes de darla por revisada. Conserva las fuentes y pendientes del encargo."

export function consentS14(env) {
  assert.equal(env.OPENCODE_INTEGRATION_MODEL_CONSENT, "s14-integrated", "Explicit S14 opt-in required; no credentials accessed")
  assert.ok(!env.OPENCODE_EVIDENCE_MODEL || env.OPENCODE_EVIDENCE_MODEL === "plainconcepts/glm-5-3", "Only plainconcepts/glm-5-3 authorized; no fallback")
  const flow = Number(env.OPENCODE_INTEGRATION_FLOW_MS), window = Number(env.OPENCODE_INTEGRATION_WINDOW_MS)
  // S14-only renewal authorized on 2026-11-05 ("todo el tiempo necesario").
  // Keep an explicit finite window for this one trial, not a per-turn budget.
  assert.ok(Number.isSafeInteger(flow) && flow > 0 && flow <= 5_400_000, "flow <= 5400000 required")
  assert.ok(Number.isSafeInteger(window) && window > flow + 30_000 && window <= 6_000_000, "flow + 30000 < window <= 6000000 required")
  return { flow, window }
}

export function correction(content) {
  const previous = content.split(/\r?\n/).find(line => /^# /.test(line))
  assert.ok(previous && content.split(previous).length === 2, "Correction requires one exact, unique heading")
  const next = previous + " — edición corregida"
  return { previous, next, prompt: `Corrige en la última entrega revisada exactamente una aparición de ${JSON.stringify(previous)} por ${JSON.stringify(next)}. Publica la versión completa nueva con el resto intacto y sométela a su propia revisión independiente. No cambies reglas funcionales, citas ni pendientes.` }
}

// One admitted goal per stage. All stages share the same deadline; native
// observation timeouts never resend a prompt or create another model session.
export async function runTurn({ request, parent, prompt, deadline, writer, turn }) {
  const left = () => { const ms = deadline - Date.now(); assert.ok(ms > 0, "S14 flow exhausted; no next prompt admitted"); return ms }
  const admitted = (await request("POST", `/api/session/${parent.id}/prompt`, { text: prompt }, Math.min(30_000, left()))).data
  await writer.record({ type: "prompt.sent", turn, inboxID: admitted.id, at: Date.now() })
  while (left() > 0) {
    const tree = (await request("GET", "/api/session", undefined, Math.min(30_000, left()))).data
    const own = new Set([parent.id, ...descendantsOf(tree, parent.id)])
    const events = (await request("POST", "/api/rpc/context-model-observer/run", { input: { action: "events" } }, Math.min(30_000, left()))).output.events
    const last = id => events.findLast(event => event.sessionID === id && /^session\.execution\.(started|succeeded|failed|interrupted)$/.test(event.type))
    for (const id of own) assert.ok(!["session.execution.failed", "session.execution.interrupted"].includes(last(id)?.type), "Native S14 execution failed; no retry")
    let cursor, messages = []
    do {
      const page = await request("GET", `/api/session/${parent.id}/message?limit=200${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`, undefined, Math.min(30_000, left()))
      messages.push(...page.data); cursor = page.cursor?.next
    } while (cursor)
    const delivered = events.some(event => event.sessionID === parent.id && event.type === "session.inbox.delivered" && event.inboxID === admitted.id)
    const final = messages.some(message => message.type === "user" && message.id === admitted.id) ? answerAfter(messages, admitted.id) : null
    const active = [...own].filter(id => last(id)?.type === "session.execution.started")
    if (delivered && final && active.length === 0) {
      assert.equal(messages.find(message => message.id === admitted.id).text, prompt, "Exact admitted input required")
      await writer.record({ type: "turn.settled", turn, inboxID: admitted.id, finalID: final.id, at: Date.now() })
      return { admitted, final }
    }
    try { await nativeWait(request, active[0] ?? parent.id, Date.now() + Math.min(120_000, left()), writer.record, `turn${turn}`) }
    catch (error) { if (error.name !== "TimeoutError" || Date.now() >= deadline) throw error }
  }
}

function rootPublication(states, parentID, sessions) {
  const publications = states.flatMap(state => Object.values(state.operations ?? {})).filter(operation =>
    operation.phase === "confirmed" && operation.producerSessionID === parentID && operation.type === "publish_agent_deliverable")
  const time = operation => sessions.find(session => session.id === parentID)?.messages.find(message => message.id === operation.artifact.producerMessageID)?.time?.created ?? 0
  const latest = publications.sort((a, b) => time(a) - time(b)).at(-1)
  assert.ok(latest, "Confirmed complete root delivery required before the next stage")
  return latest
}

export async function runIntegration({ request, writer, summary, host, flow, selectedModel = model }) {
  const deadline = Date.now() + flow
  const parent = (await request("POST", "/api/session", { agent: "refinador", title: "S14 integración", model: selectedModel })).data
  summary.sessionID = parent.id; summary.stages = []
  let sessions = [], states = [], changes, previous
  const inputs = new Map()
  const capture = async prefix => {
    sessions = await captureSessions(async path => {
      const page = await request("GET", path, undefined, 10_000)
      const id = new URL(path, "http://private").pathname.match(/^\/api\/session\/(ses_[a-zA-Z0-9]+)\/message$/)?.[1]
      if (id) for (const message of page.data ?? []) for (const part of message.content ?? []) if (part.type === "tool")
        inputs.set(JSON.stringify([id, message.id, part.id]), part.state?.input)
      return page
    }, parent, (name, value) => writer.save(prefix + name, value), summary)
    for (const session of sessions) {
      for (const message of session.messages) for (const part of message.content ?? []) if (part.type === "tool")
        part.state.input = inputs.get(JSON.stringify([session.id, message.id, part.id]))
      await writer.save(prefix + session.id + ".json", session.messages)
    }
    states = await loadStates(host)
    await writer.save(prefix + "states.json", states)
    await writer.save(prefix + "fixture-calls.json", await loadSourceCalls(host))
    await writer.save(prefix + "capture-calls.json", await loadCaptureCalls(host))
    await writer.save(prefix + "events.json", (await request("POST", "/api/rpc/context-model-observer/run", { input: { action: "events" } }, 10_000)).output.events)
  }
  try {
    for (let turn = 1; turn <= 4; turn++) {
      const prompt = turn === 1 ? objective : turn === 2 ? promotion : turn === 3 ? changes.prompt : promptTurn2
      if (turn === 4) summary.reuseQuestionAt = Date.now()
      const result = await runTurn({ request, parent, prompt, deadline, writer, turn })
      await capture(`turn${turn}-`)
      summary.stages.push({ turn, inboxID: result.admitted.id, finalID: result.final.id, sha256: hash(textOf(result.final)) })
      if (turn <= 3) {
        const publication = rootPublication(states, parent.id, sessions)
        const files = await verifyPublicationBytes(publication)
        assert.equal(files.length, 1, "The refiner's complete container is required")
        if (turn === 1) summary.initialArtifactID = publication.artifact.id
        if (turn === 2) {
          assert.notEqual(publication.artifact.id, previous.artifact.id)
          assert.equal(publication.artifact.origin.type, "promotion", "Same-byte stage must use a registered origin")
          assert.equal(files[0].content, (await verifyPublicationBytes(previous))[0].content)
          changes = correction(files[0].content)
          summary.promotedArtifactID = publication.artifact.id
        }
        if (turn === 3) {
          assert.notEqual(publication.artifact.id, previous.artifact.id)
          const old = (await verifyPublicationBytes(previous))[0].content
          assert.equal(files[0].content, old.replace(changes.previous, changes.next), "Only the exact correction may change")
          assert.ok(Object.values(publication.artifact.origin.files ?? {}).some(origin => origin.transformaciones?.some(change =>
            change.anterior === changes.previous && change.nuevo === changes.next && change.coincidencias === 1)), "Registered exact transformation required")
          summary.correctedArtifactID = publication.artifact.id
        }
        previous = publication
        await writer.save(`turn${turn}-delivery.json`, { operation: publication, files })
        if (turn >= 2) assert.ok(states.some(state => Object.values(state.reviews ?? {}).some(review =>
          review.artifactID === publication.artifact.id && review.manifestHash === publication.artifact.manifestHash)), "This exact version needs its own saved review")
      }
      await writer.save("summary.json", summary)
    }
    for (const session of sessions) for (const message of session.messages.filter(message => message.type === "assistant")) {
      assert.equal(message.model?.providerID, selectedModel.providerID); assert.equal(message.model?.id, selectedModel.id)
    }
    const required = states.flatMap(state => Object.values(state.work ?? {})).filter(work => work.ownerSessionID === parent.id && work.parentID && work.required)
    const executions = verifyExecutions(required, sessions)
    const events = (await request("POST", "/api/rpc/context-model-observer/run", { input: { action: "events" } })).output.events
    const ranges = executions.map(execution => {
      const messages = sessions.find(session => session.id === execution.sessionID).messages
      return { start: messages.find(message => message.id === execution.startMessageID).time.created,
        end: messages.find(message => message.id === execution.result.messageID).time.completed }
    })
    assert.ok(ranges[0].start < ranges[1].end && ranges[1].start < ranges[0].end, "Independent investigations must overlap")
    const calls = await loadSourceCalls(host), receipts = await loadCaptureCalls(host)
    const ids = new Set(receipts.map(receipt => JSON.parse(typeof receipt.result.content === "string" ? receipt.result.content :
      receipt.result.content.filter(part => part.type === "text").map(part => part.text).join("\n")).instantanea_id))
    const snapshots = states.flatMap(state => Object.values(state.snapshots ?? {})).filter(snapshot => ids.has(snapshot.id))
    const reuse = verifyReuse({ calls, prompt2At: summary.reuseQuestionAt })
    const blobOf = blobReader(host)
    const transfer = await verifyTransfer({ snapshots, recoveries: reuse.turn1.concat(reuse.turn2), receipts, sessions, blobOf })
    const coverage = verifyCoverageGroup(snapshots, transfer.transfers)
    assert.ok(coverage.completa, "Complete original components and pages required")
    const later = sessions.map(session => ({ ...session, messages: session.messages.filter(message => message.time?.created >= summary.reuseQuestionAt) }))
    const components = new Set()
    for (const snapshot of snapshots) if (verifyArtifactReads(later, snapshot, (await blobOf(snapshot.contentSha256)).toString("utf8")).lecturasCompletas)
      for (const item of transfer.transfers.filter(item => item.snapshotID === snapshot.id)) components.add(item.component)
    assert.ok(verifyReuse({ calls, prompt2At: summary.reuseQuestionAt,
      sourceUse: Object.keys(sourceComponents).every(component => components.has(component)) }).reuseAccredited, "Later question must really use the full existing original, not zero reads or another retrieval")
    const review = await verifyReviewIfExists({ states, sessions, snapshots, blobOf })
    assert.ok(review.exists)
    const dispatches = (await readFile(join(host, "dispatches.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    for (const dispatch of dispatches) {
      assert.equal(dispatch.outgoingModel, selectedModel.id); assert.equal(dispatch.reasoningEffort, "xhigh")
    }
    await writer.save("dispatches.json", dispatches)
    await writer.save("events.json", events)
    await writer.save("review-required.json", { verdict: "pending", criterion: "14.1", executions, ranges, transfer, coverage, reuse, review,
      stages: summary.stages, evidence: "Native session files, source receipts/blobs and confirmed deliveries/reviews of all four turns",
      instruction: "Independent semantic review required for every criterion, pending question, exact version and final answer; mechanical checks never approve content." })
    summary.mechanicalCheck = "passed"; summary.check = "review_required"
  } catch (error) {
    summary.check = "failed"; summary.error = error.message
    try { await capture("partial-") } catch (failure) { (summary.evidenceErrors ??= []).push(failure.message) }
    throw error
  } finally {
    try { summary.interrupt = await request("POST", `/api/session/${parent.id}/interrupt?resume=false`, undefined, 5_000) }
    catch (error) { summary.cleanupError = error.message }
    summary.fixtureClosed = true
    await writer.save("summary.json", summary)
  }
}

async function main(root, budgets) {
  const writer = evidenceWriter(root), summary = { scope: "S14 integrated model trial", model, budgets, check: "in_progress", started: Date.now() }
  let original, failure
  try {
    original = readCredential(); writer.secrets.push(original.value.access, original.value.refresh)
    assert.ok(original.value.expires > Date.now() + budgets.window, "Insufficient token lifetime; no refresh")
    const { host, config, settings, env } = await prepareTrial(root, model, process.env.OPENCODE_EVIDENCE_PROVIDER_PLUGIN)
    settings.plugins.push(new URL("../context-model/observer", import.meta.url).href, new URL("../context-model/effort-shim/back", import.meta.url).href)
    settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "plainconcepts", effect: "allow" }]
    await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
    await withServer(host, { ...env, OPENCODE_CONTEXT_MODEL_CONSENT: "s13-context", OPENCODE_S13_EFFORT: "xhigh" }, async connected => {
      writer.secrets.push(connected.OPENCODE_PASSWORD)
      const request = privateRequest(connected, host)
      await request("POST", "/api/credential", { integrationID: model.providerID, value: { ...original.value, refresh: "" } })
      await runIntegration({ request, writer, summary, host, flow: budgets.flow })
    }, ["delegation-test", "source-model-fixture", "context-model-observer", "plainconcepts", "s13-effort-shim-back",
      "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } catch (error) { failure = error; summary.check = "failed"; summary.error ??= error.message }
  finally {
    if (original) try {
      summary.activeCredentialUnchanged = hash(JSON.stringify(readCredential())) === hash(JSON.stringify(original))
      assert.equal(summary.activeCredentialUnchanged, true)
    } catch (error) { summary.credentialCheckError = error.message; failure ??= error; summary.check = "failed" }
    summary.finished = Date.now(); await writer.save("summary.json", summary)
  }
  if (failure) throw new Error("S14 trial failed; inspect sanitized summary.json")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgets = consentS14(process.env)
  if (process.argv[2] === "--worker") await main(process.argv[3], budgets)
  else {
    assert.equal(process.argv.length, 2)
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s14-model-"))
    console.log("Evidence: " + root)
    try { await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], { cwd: source, env: process.env, timeout: budgets.window - 6000 }) }
    catch (error) { await evidenceWriter(root).save("supervision-failure.json", { error: error.message, activeCredentialUnchanged: "unknown", cleanupError: error.cleanupError }); throw error }
  }
}
