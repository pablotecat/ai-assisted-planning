// Loaded only by isolated integration tests; never distributed as a project plugin.
import { Plugin, Rpc } from "@opencode/plugin"

const Probe = Rpc.define({ id: "planning-test", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({
  id: "planning-test",
  async setup(ctx) {
    await ctx.rpc.register(Probe, {
      run: async (input: any, context) => {
        const session = input.sessionID ? await ctx.session.get({ sessionID: input.sessionID })
          : await ctx.session.create({ agent: input.agent, title: "Permission probe" })
        const decisions: Record<string, string> = {}
        try {
          for (const { action, resource } of input.checks ?? []) {
            try {
              await ctx.permission.assert({ sessionID: session.id, agent: input.agent,
                action, resources: [resource], save: [] })
              decisions[`${action}:${resource}`] = "allow"
            } catch { decisions[`${action}:${resource}`] = "deny" }
          }
          let result
          if (input.tool) {
            const tool = (await ctx.tool.list()).find(tool => tool.id === input.tool)
            if (!tool) throw new Error(`Missing tool: ${input.tool}`)
            result = await tool.execute(input.args ?? {}, { sessionID: session.id, agent: input.agent,
              messageID: input.messageID ?? "msg_probe", id: "probe", signal: new AbortController().signal,
              progress: async () => {} } as never)
          }
          return { decisions, ...(result === undefined ? {} : { result }), tools: (await ctx.tool.list()).map(tool => tool.id) }
        } catch (error) {
          return context.error("failed", String(error), { stack: (error as Error).stack })
        } finally { if (!input.sessionID) await ctx.session.remove({ sessionID: session.id }) }
      },
    })
  },
})
