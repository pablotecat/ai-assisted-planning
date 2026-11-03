// Only an isolated test server loads this probe. No model-change or retry proxy.
import { Plugin, Rpc } from "@opencode/plugin"

const Contract = Rpc.define({ id: "recovery-test", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({
  id: "recovery-test",
  async setup(ctx) {
    const events: any[] = [], listeners = new Set<() => void>(), controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (!event.type.startsWith("session.")) continue
        const data = event.data as any
        // OpenCode retry events for transport errors carry no status or retryAfterMs; keep them
        // absent instead of undefined, which Effect cannot serialize in an RPC response.
        const error = data.error ? {
          ...(typeof data.error.type === "string" ? { type: data.error.type } : {}),
          ...(Number.isInteger(data.error.status) ? { status: data.error.status } : {}),
          ...(Number.isInteger(data.error.retryAfterMs) ? { retryAfterMs: data.error.retryAfterMs } : {}),
        } : undefined
        events.push({ id: event.id, type: event.type, created: event.created, sessionID: data.sessionID,
          ...(data.assistantMessageID ? { messageID: data.assistantMessageID } : {}),
          ...(error ? { error } : {}),
          ...(typeof data.at === "number" ? { at: data.at } : {}) })
        for (const notify of listeners) notify()
      }
    })().catch(() => {})
    await ctx.session.hook("title", event => { event.result = "Recovery fixture" })
    await ctx.rpc.register(Contract, { run: async (input: any, rpc) => {
      try {
        if (input.action === "events") return { events }
        if (input.action === "event") {
          const match = () => events.find(e => e.sessionID === input.sessionID && e.type === input.type && e.created >= input.after)
          if (!match()) await new Promise<void>(resolve => {
            const notify = () => { if (match()) { listeners.delete(notify); resolve() } }
            listeners.add(notify); notify()
          })
          return { event: match() }
        }
        if (input.action === "wait") { await ctx.session.wait({ sessionID: input.sessionID }); return { waited: true } }
        const tool = (await ctx.tool.list()).find(t => t.id === input.tool)
        if (!tool) throw new Error("Missing fixture tool")
        const result = await tool.execute(input.args, { sessionID: input.sessionID, agent: input.agent,
          messageID: input.messageID, id: "recovery-probe", signal: new AbortController().signal, progress: async () => {} } as never)
        return { result }
      } catch (error) {
        if (input.captureError) return { error: String(error) }
        return rpc.error("failed", String(error))
      }
    } })
    return () => controller.abort()
  },
})
