// Private S13 trial observer; never installed in a consumer package. It never
// retains prompt text, tool arguments or reasoning: outgoing requests are
// reduced to model/effort/image-count diagnostics, and only session lifecycle
// events are kept for timing evidence.
import { Plugin, Rpc } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"

const Contract = Rpc.define({ id: "context-model-observer", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({ id: "context-model-observer", async setup(ctx) {
  const events: any[] = [], listeners = new Set<() => void>(), signal = new AbortController()
  await ctx.session.hook("title", event => { event.result = "S13 contexto" })
  await ctx.session.hook("retry", event => { event.decision = { retry: false } })
  await ctx.session.hook("context", event => {
    if (process.env.OPENCODE_CONTEXT_MODEL_CONSENT === "s13-context" &&
      (event.model.providerID !== "plainconcepts" || event.model.id !== "glm-5-3"))
      throw new Error("S13: unauthorized model; no fallback")
  })
  await ctx.session.hook("http.request", async event => {
    let body: any = null
    try { body = JSON.parse(await event.request.clone().text()) } catch { /* Unsupported wire format is not evidence. */ }
    const messages: any[] = Array.isArray(body?.messages) ? body.messages : []
    const parts: any[] = messages.flatMap((message: any) => Array.isArray(message?.content) ? message.content : [])
    await appendFile(join(ctx.location.directory, "dispatches.jsonl"), JSON.stringify({
      sessionID: event.sessionID, model: event.model, kind: event.kind, at: Date.now(),
      outgoingModel: body?.model ?? null,
      reasoningEffort: body?.reasoning_effort ?? body?.reasoning?.effort ?? null,
      imageParts: parts.filter(part => part?.type === "image_url" || part?.type === "input_image").length,
    }) + "\n")
  })
  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: signal.signal })) {
      if (!event.type.startsWith("session.")) continue
      const data = event.data as any
      events.push(JSON.parse(JSON.stringify({ type: event.type, sessionID: data.sessionID,
        parentID: data.parentID, inboxID: data.inboxID, at: event.created })))
      for (const notify of listeners) notify()
    }
  })().catch(error => { if (!signal.signal.aborted) throw error })
  await ctx.rpc.register(Contract, { run: async (input: any) => {
    if (input.action === "events") return { events }
    if (input.action === "active-child") return new Promise<any>((resolve, reject) => {
      const duration = Math.min(120_000, Math.max(1, Number(input.timeout) || 120_000))
      const timer = setTimeout(() => { cleanup(); resolve({ childID: null }) }, duration)
      const cleanup = () => { clearTimeout(timer); listeners.delete(notify); signal.signal.removeEventListener("abort", abort) }
      const abort = () => { cleanup(); reject(new Error("S13 observer stopped")) }
      const notify = () => {
        const children = events.filter(event => event.type === "session.created" && event.parentID === input.parentID)
        for (const child of children) {
          const own = events.filter(event => event.sessionID === child.sessionID)
          const last = own.findLast(event => /^session\.execution\.(started|succeeded|failed|interrupted)$/.test(event.type))
          if (last?.type === "session.execution.started") {
            cleanup(); resolve({ childID: child.sessionID, startedAt: last.at }); return
          }
        }
      }
      listeners.add(notify); signal.signal.addEventListener("abort", abort, { once: true }); notify()
    })
    return { unsupported: input.action }
  } })
  return () => signal.abort()
} })
