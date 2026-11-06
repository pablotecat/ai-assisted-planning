// Private-server contract fixture. Not distributed with the planning package.
import { Plugin, Rpc } from "@opencode/plugin"

const Contract = Rpc.define({ id: "delegation-test", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({
  id: "delegation-test",
  async setup(ctx) {
    const events: any[] = [], gates = new Map<string, () => void>()
    const listeners = new Set<() => void>()
    const signal = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: signal.signal })) {
        if (!event.type.startsWith("session.")) continue
        const data = event.data as any
        events.push(JSON.parse(JSON.stringify({ id: event.id, type: event.type, created: event.created, sessionID: data.sessionID,
          messageID: data.assistantMessageID, seq: "durable" in event ? event.durable?.seq : undefined })))
        for (const notify of listeners) notify()
      }
    })().catch(error => { if (!signal.signal.aborted) throw error })
    await ctx.session.hook("title", event => { event.result = "Contract fixture" })
    await ctx.tool.transform(editor => editor.add({ name: "contract_gate", description: "Synthetic barrier",
      input: { type: "object", properties: {}, additionalProperties: false }, options: { codemode: false },
      async execute(_input, context) {
        await new Promise<void>((resolve, reject) => {
          gates.set(context.sessionID, resolve)
          context.signal.addEventListener("abort", () => reject(new Error("Interrupted fixture")), { once: true })
          for (const notify of listeners) notify()
        })
        gates.delete(context.sessionID)
        return { content: "Evidence from the synthetic barrier" }
      } }))
    await ctx.rpc.register(Contract, { run: async (input: any, rpc) => {
      try {
      if (input.action === "release") { gates.get(input.sessionID)?.(); return {} }
      if (input.action === "gate") {
        const entered = new Promise<void>(resolve => {
          const notify = () => { if (gates.has(input.sessionID)) { listeners.delete(notify); resolve() } }
          listeners.add(notify); notify()
        })
        await (input.settledCheck ? Promise.race([entered, ctx.session.wait({ sessionID: input.sessionID }).then(async () => {
          if (!gates.has(input.sessionID)) {
            const context = await ctx.session.context({ sessionID: input.sessionID })
            throw new Error("Child settled before the synthetic barrier: " + JSON.stringify(context.flatMap((m: any) => m.content ?? [])
              .filter((p: any) => p.type === "tool").map((p: any) => ({ name: p.name, status: p.state.status, error: p.state.error }))))
          }
        })]) : entered)
        return { active: true, events }
      }
      if (input.action === "events") return { events }
      if (input.action === "agents") return { agents: await ctx.agent.list(), tools: (await ctx.tool.list()).map(t => t.id) }
      if (input.action === "wait") { await ctx.session.wait({ sessionID: input.sessionID }); return { waited: true } }
      const tool = (await ctx.tool.list()).find(t => t.id === (input.tool ?? "subagent"))!
      const result = await tool.execute(input.args, { sessionID: input.sessionID, agent: input.agent,
        messageID: input.messageID, id: input.callID ?? "native-contract", signal: new AbortController().signal,
        progress: async () => {} } as never)
      return { result }
      } catch (error) { return rpc.error("failed", String(error), { stack: (error as Error).stack }) }
    } })
    return () => signal.abort()
  },
})
