// Private synthetic Jira. It cannot forward requests to real Jira.
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { Plugin, Rpc } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { descriptions, unavailable } from "../data.mjs"
import { createNotifications } from "../../delegation/model-fixture/observer.mjs"

const Observer = Rpc.define({ id: "evidence-model-observer", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })

export default Plugin.define({ id: "evidence-model-fixture", async setup(ctx) {
  const signal = new AbortController(), observer = createNotifications(signal.signal)
  void (async () => {
    for await (const event of ctx.event.subscribe({ signal: signal.signal })) observer.observe(event)
  })().catch(error => { if (!signal.signal.aborted) throw error })
  await ctx.rpc.register(Observer, { run: async (input: any, rpc) => {
    try { return input.action === "events" ? { events: observer.events } : { admission: await observer.wait(input) } }
    catch { return rpc.error("failed", "Private evidence observer stopped", {}) }
  } })
  await ctx.tool.transform(editor => {
    editor.namespace({ name: "jira", description: "Jira sintético, solo lectura, fixture.atlassian.net APP-1 a APP-4." })
    for (const name of ["getAccessibleAtlassianResources", "getJiraIssue", "listJiraIssueComments"]) editor.add({
      name, options: { namespace: "jira", codemode: true }, description: `Lectura sintética ${name}.`,
      input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
        fields: { type: "array", items: { type: "string" } }, view: { type: "string" }, startAt: { type: "number" }, maxResults: { type: "number" } }, additionalProperties: false },
      async execute(input: any, context) {
        await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: `jira_${name}`, resources: ["*"], save: [] })
        const stamp = { sessionID: context.sessionID, messageID: context.messageID, callID: context.id, name, key: input.issueIdOrKey }
        const record = (state: string, extra = {}) => appendFile(join(ctx.location.directory, "fixture-calls.jsonl"),
          JSON.stringify({ ...stamp, state, time: Date.now(), ...extra }) + "\n")
        await record("started")
        if (input.cloudId && input.cloudId !== "fixture.atlassian.net") {
          await record("rejected"); throw new Error("Sitio fuera del corpus sintético")
        }
        let result
        if (name === "getAccessibleAtlassianResources") result = [{ id: "fixture.atlassian.net", url: "https://fixture.atlassian.net", name: "Ficticio" }]
        else if (Object.hasOwn(unavailable, input.issueIdOrKey)) result = { key: input.issueIdOrKey, error: unavailable[input.issueIdOrKey] }
        else if (!Object.hasOwn(descriptions, input.issueIdOrKey)) {
          await record("rejected"); throw new Error("Historia fuera del corpus sintético")
        } else if (name === "listJiraIssueComments") result = { startAt: 0, maxResults: 100, total: 0, comments: [] }
        else result = { key: input.issueIdOrKey, fields: { summary: input.issueIdOrKey === "APP-1" ? "Consulta de cancelación y abono" : "Acta común",
          description: descriptions[input.issueIdOrKey], comment: { total: 0 }, customFields: {} } }
        const content = JSON.stringify(result)
        await record("completed", { outcome: result.error ? "source_unavailable" : "available", resultSha256: createHash("sha256").update(content).digest("hex"), result })
        return { content }
      },
    })
  })
  return () => signal.abort()
} })
