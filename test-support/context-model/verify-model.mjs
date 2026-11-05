// One opt-in S13 scenario per invocation (13.4). Inert import; no model, credential or
// network path is taken without the explicit CLI consent below.
import assert from "node:assert/strict"
import { readFile, mkdtemp, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { evidenceWriter, hash, loadCalls, prepareConsumer, textOf } from "../evidence-model/verify-model.mjs"
import { captureSessions, nativeWait, privateRequest, runBounded } from "../delegation/verify-model.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"
import { withServer } from "../opencode.mjs"
import { activeObjective, authorizedModel, avance, markers, objective, reviewConditions } from "./data.mjs"

const source = fileURLToPath(new URL("../..", import.meta.url))
const back = new URL("./effort-shim/back", import.meta.url).href
const observer = new URL("./observer", import.meta.url).href
const providerPlugin = process.env.OPENCODE_EVIDENCE_PROVIDER_PLUGIN ?? "C:/Users/potero/.config/opencode/plugins/forge-connect.js"

export function consentS13(env) {
  assert.equal(env.OPENCODE_CONTEXT_MODEL_CONSENT, "s13-context", "Explicit S13 opt-in required; no credentials accessed")
  assert.ok(!env.OPENCODE_EVIDENCE_MODEL || env.OPENCODE_EVIDENCE_MODEL === "plainconcepts/glm-5-3", "Only plainconcepts/glm-5-3 authorized; no fallback")
  assert.ok(!env.OPENCODE_CONTEXT_MODEL_CASE || ["admission", "active-child"].includes(env.OPENCODE_CONTEXT_MODEL_CASE), "Explicit known S13 case required")
  const extended = env.OPENCODE_CONTEXT_MODEL_CASE === "active-child"
  const maxFlow = extended ? 900_000 : 360_000, maxWindow = extended ? 1_200_000 : 600_000
  const flow = Number(env.OPENCODE_CONTEXT_MODEL_FLOW_MS), window = Number(env.OPENCODE_CONTEXT_MODEL_WINDOW_MS)
  assert.ok(Number.isSafeInteger(flow) && flow > 0 && flow <= maxFlow, `flow <= ${maxFlow} required`)
  assert.ok(Number.isSafeInteger(window) && window > flow + 30_000 && window <= maxWindow, `flow + 30000 < window <= ${maxWindow} required`)
  return { flow, window }
}

// Case A (13.4): the delegated child session actually received its rules —
// a completed native skill call in its own messages. Mentioning a rule name or
// receiving just an identifier never counts.
export function rulesAccessed(child) {
  const skills = (child.messages ?? []).flatMap(message => (message.content ?? [])
    .filter(part => part.type === "tool" && part.name === "skill"))
  const completed = skills.filter(part => part.state?.status === "completed")
  return { skillCalls: skills.length, completed: completed.length,
    accessed: completed.length >= 1, loaded: completed.map(part => part.state?.input ?? null) }
}

// Case B (13.4): the parent's answer to the interim request while a child was
// still active. A later continuation is not evidence of earlier activity:
// native execution boundaries must span the complete captured message.
// Structural markers preserve the evidence; semantic approval never happens here.
export function classifyPreentrega({ answer, children, events = [] }) {
  const at = answer.time?.created, end = answer.time?.completed
  const active = (children ?? []).filter(child => typeof at === "number" && typeof end === "number" && end >= at &&
    events.some((event, index) => event.sessionID === child.id && event.type === "session.execution.started" && event.at <= at &&
      !events.slice(index + 1).some(next => next.sessionID === child.id &&
        /^session\.execution\.(started|succeeded|failed|interrupted)$/.test(next.type) && next.at <= end)))
  const text = typeof answer === "string" ? answer : textOf(answer) ?? ""
  return {
    observed: active.length >= 1, activeChildren: active.map(child => child.id),
    marks: { pendiente: markers.pendiente.test(text), siguienteAccion: markers.siguienteAccion.test(text),
      candidataCompleta: markers.candidataCompleta.test(text) },
    text,
  }
}

export function answerAfter(messages, userMessageID, { interim = false, accepts = () => true } = {}) {
  // The live message page and the captured page can arrive in opposite
  // orders; scan in stable chronological order regardless of the source.
  const ordered = [...(messages ?? [])].map((message, index) => ({ message, index }))
    .sort((a, b) => ((a.message.time?.created ?? 0) - (b.message.time?.created ?? 0)) || a.index - b.index)
    .map(entry => entry.message)
  const at = ordered.findIndex(message => message.id === userMessageID)
  assert.ok(at >= 0, "El turno de avance debe existir en la sesión del coordinador")
  for (let index = at + 1; index < ordered.length; index++) {
    const message = ordered[index]
    if (message.type === "assistant" && message.finish === "stop" && accepts(message)) return message
    // An interim text is already visible even when the model keeps making tool
    // calls. These markers select a review candidate, never semantic approval.
    if (interim && message.type === "assistant" && message.time?.completed && textOf(message).trim() && accepts(message)) return message
    if (message.type === "user" && message.id !== userMessageID) break
  }
  return null
}

export function descendantsOf(sessions, rootID) {
  const own = new Set([rootID])
  let grew = true
  while (grew) {
    grew = false
    for (const session of sessions)
      if (session.parentID && own.has(session.parentID) && !own.has(session.id)) { own.add(session.id); grew = true }
  }
  return [...own].filter(id => id !== rootID)
}

export async function runContextCase({ request, writer, summary, host, flow, model = authorizedModel,
  avanceText = avance, objectiveText = objective, avanceDelay = 10_000, avanceTrigger = "admission", interrupt = true }) {
  assert.ok(["admission", "active-child"].includes(avanceTrigger), "Unknown S13 advance trigger")
  const deadline = Date.now() + flow
  const post = (path, input, timeout = 30_000) => request("POST", path, input, Math.min(Math.max(1, timeout), Math.max(1, deadline - Date.now())))
  const read = async path => request("GET", path, undefined, Math.min(30_000, Math.max(1, deadline - Date.now())))
  const parent = (await post("/api/session", { agent: "refinador", model, title: "S13 contexto" })).data
  summary.sessionID = parent.id
  await writer.save("summary.json", summary)
  let childSeen = null
  try {
    await post(`/api/session/${parent.id}/prompt`, { text: objectiveText })
    await writer.record({ type: "objective.sent", sessionID: parent.id, at: Date.now() })
    // Default admission case stays fixed at 10 s, independent of child/idle.
    // The separately authorized active-child case has its own native-event gate;
    // it does not replace or weaken that default. Neither gate proves 13.4.
    if (avanceTrigger === "active-child") {
      while (!childSeen && Date.now() < deadline) {
        const timeout = Math.min(120_000, Math.max(1, deadline - Date.now()))
        const event = await request("POST", "/api/rpc/context-model-observer/run",
          { input: { action: "active-child", parentID: parent.id, timeout } }, timeout + 5_000)
        childSeen = event.output.childID
        if (childSeen) summary.activeChildEvent = event.output
      }
    } else await new Promise(resolve => setTimeout(resolve, Math.min(avanceDelay, Math.max(0, deadline - Date.now()))))
    assert.ok(Date.now() < deadline, "Ventana de avance agotada; no se encola fuera del flujo")
    const observed = (await read("/api/session")).data
    const child = observed.find(entry => entry.parentID === parent.id && entry.id !== parent.id &&
      (avanceTrigger !== "active-child" || entry.id === childSeen && entry.time?.idle == null))
    if (avanceTrigger === "active-child") assert.ok(child, "Dedicated case requires a still-active native child before advance admission")
    childSeen = child?.id ?? null
    assert.ok(Date.now() < deadline, "Ventana de avance agotada; no se encola fuera del flujo")
    const admitted = (await post(`/api/session/${parent.id}/prompt`, { text: avanceText })).data
    summary.avance = { inboxID: admitted.id, sentAt: Date.now(), childSeen }
    await writer.record({ type: "avance.sent", sessionID: parent.id, inboxID: admitted.id, at: Date.now() })
    await writer.save("summary.json", summary)
    while (Date.now() < deadline) {
      // Observation slices avoid the HTTP client's 300 s header timeout. A
      // slice timeout does not repeat a prompt or cancel the model's flow.
      try { await nativeWait(request, parent.id, Math.min(deadline, Date.now() + 120_000), writer.record, "avance") }
      catch (error) {
        if (error.name !== "TimeoutError" || Date.now() >= deadline) throw error
      }
      const sessions = (await read("/api/session")).data
      const parentNow = sessions.find(entry => entry.id === parent.id)
      const children = descendantsOf(sessions, parent.id)
        .map(id => sessions.find(entry => entry.id === id))
      const messages = (await read(`/api/session/${parent.id}/message`)).data
      const delivered = messages.some(message => message.type === "user" && message.id === admitted.id)
      const answered = delivered && answerAfter(messages, admitted.id, { interim: avanceTrigger === "active-child" }) !== null
      if (answered && avanceTrigger === "active-child" && (await loadCalls(host)).some(call =>
        children.some(child => child?.id === call.sessionID) && call.state === "completed")) break
      const running = [parentNow, ...children].filter(entry => entry && entry.time?.idle == null)
      // El inbox solo se entregó de verdad cuando el turno de avance tiene
      // respuesta; un bucle idle solo no acredita la entrega.
      if (answered && parentNow?.time?.idle != null && running.length === 0) break
      if (parentNow?.time?.idle != null) await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))))
    }
    const sessions = await captureSessions(read, parent, writer.save, summary)
    const nativeStates = (await read("/api/session")).data
    for (const session of sessions) {
      const time = nativeStates.find(entry => entry.id === session.id)?.time
      if (time) session.time = { ...time, idle: time.idle ?? null }
    }
    const events = (await post("/api/rpc/context-model-observer/run", { input: { action: "events" } })).output.events
    await writer.save("events.json", events)
    const children = sessions.filter(session => session.id !== parent.id)
    const dispatchText = (await readFile(join(host, "dispatches.jsonl"), "utf8").catch(() => "")).trim()
    const dispatches = dispatchText ? dispatchText.split("\n").map(JSON.parse) : []
    await writer.save("dispatches.json", dispatches)
    for (const session of sessions) {
      const last = session.messages.findLastIndex(message => ["user", "synthetic", "assistant"].includes(message.type))
      if (avanceTrigger === "admission")
        assert.ok(session.messages.findLastIndex(message => message.type === "idle") > last, "Todas las sesiones observadas deben estar inactivas")
      if (avanceTrigger === "admission")
        assert.ok(session.messages.some(message => message.type === "assistant" && message.finish === "stop" && textOf(message).trim()),
          "Se requiere respuesta final nativa, no solo idle")
      for (const message of session.messages.filter(message => message.type === "assistant")) {
        assert.equal(message.model?.providerID, model.providerID, "Proveedor efectivo exacto, sin fallback")
        assert.equal(message.model?.id, model.id, "Modelo efectivo exacto, sin fallback")
      }
    }
    if (dispatches.length) {
      const reserved = model.providerID === authorizedModel.providerID && model.id === authorizedModel.id
      for (const dispatch of dispatches.filter(dispatch => dispatch.model?.providerID === model.providerID)) {
        assert.equal(dispatch.outgoingModel, model.id, "Todo envío usa el modelo autorizado")
        if (reserved)
          assert.equal(dispatch.reasoningEffort, "xhigh", "Todo envío del modelo reservado lleva el esfuerzo admitido xhigh")
      }
    }
    const callsText = (await readFile(join(host, "fixture-calls.jsonl"), "utf8").catch(() => "")).trim()
    const calls = callsText ? callsText.split("\n").map(JSON.parse) : []
    await writer.save("fixture-calls.json", calls)
    const rules = children.map(child => ({ childID: child.id, ...rulesAccessed(child) }))
    const reads = calls.filter(call => call.sessionID !== parent.id && call.state === "completed")
    summary.cases = {
      delegacionConReglas: { observed: children.length >= 1 && rules.some(rule => rule.accessed) && reads.length >= 1,
        children: rules, childJiraReads: reads.length },
    }
    const parentMessages = sessions.find(session => session.id === parent.id)?.messages ?? []
    const answer = (avanceTrigger === "active-child" ? answerAfter(parentMessages, admitted.id, { interim: true,
      accepts: candidate => classifyPreentrega({ answer: candidate, children, events }).observed }) : null) ??
      answerAfter(parentMessages, admitted.id, { interim: avanceTrigger === "active-child" })
    if (avanceTrigger === "active-child") assert.ok(answer, "A captured interim answer is required")
    const classified = answer
      ? classifyPreentrega({ answer, children, events }) : { observed: false, activeChildren: [], marks: {}, text: "" }
    summary.cases.preentregaConHijoActivo = { observed: classified.observed, activeChildren: classified.activeChildren,
      marks: classified.marks, answer: answer ? { messageID: answer.id, at: answer.time?.created, completed: answer.time?.completed,
        sha256: hash(classified.text) } : null }
    await writer.save("preentrega.json", { answer: classified.text, activeChildren: classified.activeChildren,
      children: children.map(child => ({ id: child.id, updated: child.time?.updated ?? null,
        activity: (child.messages ?? []).map(message => ({ type: message.type, at: message.time?.created })) })) })
    await writer.save("review-required.json", { conditions: reviewConditions.map(([topic, scope, condition]) =>
      ({ topic, scope, condition, verdict: "pending" })),
      cases: summary.cases,
      completion: "Independent review must inspect the preentrega text, the child timelines, the dispatches and any confirmed publication; cite native message/tool IDs and file hashes for every condition. Never approve by word/number matches. Preserve this checklist; write acceptance-review.json separately." })
    summary.mechanicalCheck = "passed"; summary.check = "review_required"
    await writer.save("summary.json", summary)
    return summary
  } catch (error) {
    summary.check = "failed"; summary.error = error.message
    const errors = summary.evidenceErrors ??= []
    try {
      await captureSessions(path => request("GET", path, undefined, 10_000), parent,
        (name, value) => writer.save("partial-" + name, value), summary)
    } catch (failure) { errors.push({ stage: "partial-tree", error: failure.message }) }
    for (const [stage, run] of [["partial-messages.json", () =>
      request("GET", `/api/session/${parent.id}/message`, undefined, 10_000)],
    ["partial-events.json", () => request("POST", "/api/rpc/context-model-observer/run", { input: { action: "events" } }, 10_000)]]) {
      try {
        const value = await run()
        await writer.save(stage, Array.isArray(value?.data) ? value.data.map(message => {
           const { native, ...rest } = message
           return { ...rest, content: rest.content?.filter(part => part.type !== "reasoning") } }) : value)
      } catch (failure) { errors.push({ stage, error: failure.message }) }
    }
    return summary
  } finally {
    if (interrupt) {
      try {
        const all = (await request("GET", "/api/session", undefined, 5_000)).data
        for (const id of [parent.id, ...descendantsOf(all, parent.id)]) {
          const entry = all.find(candidate => candidate.id === id)
          if (entry?.time?.idle == null)
            try { summary.interrupt ??= {}; summary.interrupt[id] =
              await request("POST", `/api/session/${id}/interrupt?resume=false`, undefined, 5_000) }
            catch (failure) { summary.cleanupError = failure.message }
        }
      } catch (failure) { summary.cleanupError = failure.message }
      summary.fixtureClosed = true
    }
    await writer.save("summary.json", summary)
  }
}

export function readCredential() {
  const status = opencode(["service", "status"], source)
  assert.ok(status.status === 0 && /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(status.stdout), "Existing shared service required; will not start it")
  const result = opencode(["api", "get", "/api/credential"], source)
  assert.equal(result.status, 0)
  const auth = JSON.parse(result.stdout).data.find(entry => entry.integrationID === authorizedModel.providerID && entry.active)
  assert.equal(auth?.value.type, "oauth")
  return auth
}

async function main(root, budgets) {
  const writer = evidenceWriter(root)
  const summary = { scope: "S13 13.4 only: delegation with accessible rules and preentrega with active child",
    model: authorizedModel, check: "in_progress", activeCredentialUnchanged: "unknown", started: Date.now() }
  let failure
  try {
    const auth = readCredential()
    summary.credentialBefore = hash(JSON.stringify(auth))
    writer.secrets.push(auth.value.access, auth.value.refresh)
    assert.ok(auth.value.expires > Date.now() + budgets.window, "Insufficient token lifetime; no refresh")
    const dedicated = process.env.OPENCODE_CONTEXT_MODEL_CASE === "active-child"
    summary.case = dedicated ? "active-child" : "admission"
    const { host, config, settings, env } = await prepareConsumer(root, authorizedModel, providerPlugin)
    if (dedicated) settings.plugins = [...settings.plugins.filter(p => p !== new URL("../evidence-model/fixture", import.meta.url).href),
      new URL("../delegation/model-fixture", import.meta.url).href]
    settings.plugins = [...settings.plugins, observer, back]
    await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
    await withServer(host, { ...env, OPENCODE_S13_EFFORT: "xhigh",
      OPENCODE_S13_RECORDS: join(root, "sdk-records.jsonl").replaceAll("\\", "/") }, async connected => {
      const request = privateRequest(connected, host)
      writer.secrets.push(connected.OPENCODE_PASSWORD)
      await request("POST", "/api/credential", { integrationID: authorizedModel.providerID,
        value: { ...auth.value, refresh: "" } })
      await runContextCase({ request, writer, summary, host, flow: budgets.flow,
        ...(dedicated ? { avanceTrigger: "active-child", objectiveText: activeObjective } : {}) })
      assert.equal(summary.check, "review_required", "S13 mechanical checks must pass for this trial")
    }, ["delegation-test", dedicated ? "delegation-model-fixture" : "evidence-model-fixture", "context-model-observer", "plainconcepts",
      "s13-effort-shim-back", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } catch (error) { failure = error; summary.check = "failed"; summary.mainError = error.message; summary.error ??= error.message }
  finally {
    try {
      assert.ok(summary.credentialBefore, "Pre-trial credential fingerprint missing")
      summary.activeCredentialUnchanged = hash(JSON.stringify(readCredential())) === summary.credentialBefore
      assert.equal(summary.activeCredentialUnchanged, true, "Shared credential changed")
    } catch (error) { summary.credentialCheckError = error.message; summary.check = "failed"; failure ??= error }
  }
  summary.finished = Date.now(); await writer.save("summary.json", summary)
  if (failure) throw new Error("S13 trial failed; inspect sanitized summary.json")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgets = consentS13(process.env)
  if (process.argv[2] === "--worker") await main(process.argv[3], budgets)
  else {
    assert.equal(process.argv.length, 2)
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s13-model-"))
    console.log("Evidence: " + root)
    try { await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root],
      { cwd: source, env: process.env, timeout: budgets.window - 6000 }) }
    catch (error) {
      await evidenceWriter(root).save("supervision-failure.json", { check: "failed",
        error: error.message, activeCredentialUnchanged: "unknown",
        ...(error.cleanupError ? { cleanupError: error.cleanupError } : {}) })
      throw error
    }
  }
}
