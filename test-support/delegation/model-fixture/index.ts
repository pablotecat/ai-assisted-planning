// Synthetic read-only Jira for the opt-in S07 model check. No workflow instructions.
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { Plugin, Rpc } from "@opencode/plugin"
import { descriptions } from "./data.mjs"
import { createNotifications } from "./observer.mjs"

const Observer = Rpc.define({ id: "delegation-model-observer", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({ id: "delegation-model-fixture", async setup(ctx) {
  const signal = new AbortController(), observer = createNotifications(signal.signal)
  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: signal.signal })) observer.observe(event)
  })().catch(error => { if (!signal.signal.aborted) throw error })
  await ctx.rpc.register(Observer, { run: async (input: any, rpc) => {
    try { return input.action === "events" ? { events: observer.events } : { admission: await observer.wait(input) } }
    catch (error) { return rpc.error("failed", String(error), {}) }
  } })
  await ctx.tool.transform(editor => {
    editor.namespace({ name: "jira", description: "Jira sintético de fixture.atlassian.net, solo lectura, APP-1 a APP-3." })
    for (const name of ["getAccessibleAtlassianResources", "getJiraIssue", "listJiraIssueComments"]) editor.add({
      name, options: { namespace: "jira", codemode: true }, description: `Lectura sintética ${name} de historias y acuerdos vigentes confirmados.`,
      input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
        fields: { type: "array", items: { type: "string" } }, view: { type: "string" }, startAt: { type: "number" }, maxResults: { type: "number" } }, additionalProperties: false },
      async execute(input: any, context) {
        await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: `jira_${name}`, resources: ["*"], save: [] })
        const stamp = { sessionID: context.sessionID, messageID: context.messageID, callID: context.id, name, key: input.issueIdOrKey }
        const record = (state: string) => appendFile(join(ctx.location.directory, "fixture-calls.jsonl"), JSON.stringify({ ...stamp, state, time: Date.now() }) + "\n")
        await record("started")
        try {
        if (name === "getAccessibleAtlassianResources") {
          await record("completed")
          return { content: JSON.stringify([{ id: "fixture.atlassian.net", url: "https://fixture.atlassian.net", name: "Ficticio" }]) }
        }
        if (!["APP-1", "APP-2", "APP-3"].includes(input.issueIdOrKey)) throw new Error("Historia fuera del corpus sintético")
        if (name === "getJiraIssue" && input.issueIdOrKey !== "APP-1")
          await setTimeout(input.issueIdOrKey === "APP-2" ? 8_000 : 2_000, undefined, { signal: context.signal })
        const result = name === "listJiraIssueComments" ? { startAt: 0, maxResults: 100, total: 0, comments: [] }
          : { key: input.issueIdOrKey, fields: { summary: input.issueIdOrKey === "APP-1" ? "Cancelar compra y recibir abono" : `Acuerdo ${input.issueIdOrKey}`,
            description: descriptions[input.issueIdOrKey], status: { name: "Acordado" }, comment: { total: 0 }, customFields: {} } }
        await record("completed")
        return { content: JSON.stringify(result) }
        } catch (error) { await record("failed"); throw error }
      },
    })
  })
  return () => signal.abort()
} })
