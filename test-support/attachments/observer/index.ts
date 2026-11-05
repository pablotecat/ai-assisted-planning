// Private trial observer; never installed in a consumer package.
import { Plugin, Rpc } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { wireImages } from "../verify-model.mjs"

const Contract = Rpc.define({ id: "attachment-observer", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({ id: "attachment-observer", async setup(ctx) {
  const events: any[] = [], listeners = new Set<() => void>(), signal = new AbortController()
  await ctx.session.hook("title", event => { event.result = "S09 PNG" })
  await ctx.session.hook("retry", event => { event.decision = { retry: false } })
  await ctx.session.hook("context", event => {
    if (process.env.OPENCODE_ATTACHMENT_MODEL_CONSENT === "s09-png" &&
      (event.model.providerID !== "plainconcepts" || event.model.id !== "glm-5-3"))
      throw new Error("S09: unauthorized model; no fallback")
  })
  await ctx.session.hook("http.request", async event => {
    const raw = await event.request.clone().text()
    let images: any[] = [], body: any = null
    try { body = JSON.parse(raw); images = wireImages(body) } catch { /* Unsupported wire format is not evidence. */ }
    await appendFile(join(ctx.location.directory, "image-dispatches.jsonl"), JSON.stringify({
      sessionID: event.sessionID, model: event.model, kind: event.kind, at: Date.now(), images,
      outgoingModel: body?.model ?? null,
      reasoningEffort: body?.reasoning_effort ?? body?.reasoning?.effort ?? null,
    }) + "\n")
  })
  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: signal.signal })) {
      if (!event.type.startsWith("session.")) continue
      const data = event.data as any
      events.push(JSON.parse(JSON.stringify({ type: event.type, sessionID: data.sessionID, inboxID: data.inboxID, at: event.created })))
      for (const notify of listeners) notify()
    }
  })().catch(error => { if (!signal.signal.aborted) throw error })
  await ctx.rpc.register(Contract, { run: async (input: any) => {
    if (input.action === "events") return { events }
    return new Promise<any>((resolve, reject) => {
      const cleanup = () => { listeners.delete(notify); signal.signal.removeEventListener("abort", abort) }
      const abort = () => { cleanup(); reject(new Error("PNG observer stopped")) }
      const notify = () => {
        const own = events.filter(e => e.sessionID === input.sessionID)
        const queued = own.findIndex(e => e.type === "session.inbox.enqueued" && e.inboxID === input.inboxID)
        const delivered = own.findIndex((e, i) => i > queued && queued >= 0 && e.type === "session.inbox.delivered" && e.inboxID === input.inboxID)
        const started = own.findIndex((e, i) => i > delivered && delivered >= 0 && e.type === "session.step.started")
        const ended = own.findIndex((e, i) => i > started && started >= 0 && /^session\.execution\.(succeeded|failed|interrupted)$/.test(e.type))
        if (ended < 0) return
        cleanup(); resolve({ events: own, succeeded: own[ended].type === "session.execution.succeeded" })
      }
      listeners.add(notify); signal.signal.addEventListener("abort", abort, { once: true }); notify()
    })
  } })
  return () => signal.abort()
} })
