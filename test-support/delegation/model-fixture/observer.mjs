// Event-only test observer. No session mutations, polling, timers or workflow repair.
import { createHash } from "node:crypto"

export function notificationIdentity(item) {
  const metadata = item?.payload?.metadata
  if (item?.type !== "synthetic" || metadata?.source !== "subagent" || typeof metadata.childID !== "string") return
  const identity = { source: metadata.source, childID: metadata.childID, state: metadata.state, correlation: "indeterminate" }
  const envelope = /^<subagent sessionID="([^"]+)" state="([^"]+)"(?: description="[^"]*")?>\n([\s\S]*)\n<\/subagent>$/.exec(item.payload.text ?? "")
  if (envelope?.[1] === metadata.childID && envelope[2] === metadata.state)
    Object.assign(identity, { correlation: "content_available", resultSha256: createHash("sha256").update(envelope[3]).digest("hex") })
  return identity
}

export function createNotifications(signal) {
  const events = [], listeners = new Set()
  function observe(event) {
    const { type, data = {} } = event
    if (!["session.step.started", "session.step.ended", "session.execution.started", "session.execution.succeeded",
      "session.inbox.enqueued", "session.inbox.delivered"].includes(type)) return
    const notification = notificationIdentity(data.item)
    events.push(JSON.parse(JSON.stringify({ id: event.id, type, created: event.created, sessionID: data.sessionID,
      messageID: data.assistantMessageID, inboxID: data.inboxID, inputType: data.item?.type, seq: event.durable?.seq,
      ...(notification ? { notification } : {}) })))
    for (const listener of listeners) listener()
  }
  function admitted({ parentID, childSessionID, resultSha256, inputType }) {
    const queued = events.findIndex(e => e.sessionID === parentID && e.type === "session.inbox.enqueued" &&
      (inputType === "user" ? e.inputType === "user" : e.notification?.childID === childSessionID && e.notification.state === "completed" &&
        (e.notification.correlation === "indeterminate" || resultSha256 && e.notification.resultSha256 === resultSha256)))
    if (queued < 0) return
    const delivered = events.findIndex((e, i) => i > queued && e.sessionID === parentID && e.type === "session.inbox.delivered" && e.inboxID === events[queued].inboxID)
    const step = events.findIndex((e, i) => i > delivered && e.sessionID === parentID && e.type === "session.step.started")
    if (delivered < 0 || step < 0) return
    // Native metadata has no result message ID. A body match is not a native causal ID.
    return { inboxID: events[queued].inboxID, queued, delivered, step, parentMessageID: events[step].messageID,
      correlation: inputType === "user" ? "native-input-admission" : events[queued].notification.correlation === "indeterminate" ? "indeterminate" : "content_match",
      ...(inputType === "user" ? {} : { notification: events[queued].notification }) }
  }
  const wait = input => new Promise((resolve, reject) => {
    const cleanup = () => { listeners.delete(notify); signal.removeEventListener("abort", abort) }
    const abort = () => { cleanup(); reject(new Error("Private notification observer stopped")) }
    const notify = () => { const found = admitted(input); if (found) { cleanup(); resolve(found) } }
    if (signal.aborted) return abort()
    listeners.add(notify); signal.addEventListener("abort", abort, { once: true }); notify()
  })
  return { observe, wait, events }
}
