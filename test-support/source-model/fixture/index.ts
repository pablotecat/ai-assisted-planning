// Private S08 behavior-trial fixture. Not distributed with the planning package.
// Deterministic synthetic Jira (read-only): one complete source whose original
// includes a >2000-char single-line HTML description, custom fields and
// paginated comments. Every call is stamped to a durable counter file, so the
// driver records real observed recoveries, never estimates. No real model, no
// real Jira, no forwarding, no secrets.
import { Plugin, Rpc } from "@opencode/plugin"
import { createHash, randomUUID } from "node:crypto"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { sourceContent, commentContents } from "../data.mjs"

const Contract = Rpc.define({ id: "source-model-observer", methods: {
  run: { input: { type: "object" }, output: { type: "object" }, errors: { failed: { type: "object" } } },
}, events: {} })
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export default Plugin.define({
  id: "source-model-fixture",
  async setup(ctx) {
    const events: any[] = [], listeners = new Set<() => void>(), signal = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: signal.signal })) {
        if (!event.type.startsWith("session.")) continue
        const data = event.data as any
        events.push(JSON.parse(JSON.stringify({ type: event.type, sessionID: data.sessionID, inboxID: data.inboxID,
          messageID: data.assistantMessageID, inputHash: data.item?.type === "user" ? hash(data.item.payload.text) : undefined })))
        for (const notify of listeners) notify()
      }
    })().catch(error => { if (!signal.signal.aborted) throw error })
    await ctx.rpc.register(Contract, { run: async (input: any) => {
      if (input.action === "events") return { events }
      return new Promise<any>((resolve, reject) => {
        const cleanup = () => { listeners.delete(notify); signal.signal.removeEventListener("abort", abort) }
        const abort = () => { cleanup(); reject(new Error("Source observer stopped")) }
        const notify = () => {
          const queued = events.findIndex(e => e.type === "session.inbox.enqueued" && e.sessionID === input.sessionID && e.inputHash === input.inputHash)
          const delivered = events.findIndex((e, i) => i > queued && queued >= 0 && e.type === "session.inbox.delivered" && e.sessionID === input.sessionID && e.inboxID === events[queued].inboxID)
          const step = events.findIndex((e, i) => i > delivered && delivered >= 0 && e.type === "session.step.started" && e.sessionID === input.sessionID)
          if (queued < 0 || delivered < 0 || step < 0) return
          const end = events.findIndex((e, i) => i > step && e.sessionID === input.sessionID && /^session\.execution\.(started|succeeded|failed|interrupted)$/.test(e.type))
          if (input.settled && end < 0) return
          if (input.settled && events[end].type !== "session.execution.succeeded") {
            cleanup(); reject(new Error("The admitted source turn did not succeed")); return
          }
          cleanup(); resolve({ admission: { inboxID: events[queued].inboxID, messageID: events[step].messageID, queued, delivered, step,
            ...(input.settled ? { settled: end } : {}) } })
        }
        listeners.add(notify); signal.signal.addEventListener("abort", abort, { once: true }); notify()
      })
    } })
    // Test-only native receipt: the id is the outer execute call ID (V2), not
    // merely its assistant message. Record the actual capture arguments/result.
    await ctx.tool.hook("execute.after", async event => {
      if (event.tool !== "sesion_capture_agent_source" || event.status !== "completed") return
      await appendFile(join(ctx.location.directory, "capture-calls.jsonl"), JSON.stringify({
        sessionID: event.sessionID, messageID: event.messageID, callID: event.id, time: Date.now(),
        input: event.input, result: event.result,
      }) + "\n")
    })
    await ctx.tool.transform(editor => {
      editor.namespace({ name: "jira", description: "Jira sintético del ensayo S08, solo lectura, fixture.atlassian.net APP-1." })
      for (const name of ["getAccessibleAtlassianResources", "getJiraIssue", "getJiraIssueComments"]) editor.add({
        name, options: { namespace: "jira", codemode: true },
        description: `Lectura sintética ${name} del ensayo S08.`,
        input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
          fields: { type: "array", items: { type: "string" } }, view: { type: "string" },
          startAt: { type: "integer", enum: [0, 2] }, maxResults: { type: "integer", enum: [2] } }, additionalProperties: false },
        async execute(input: any, context) {
          await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent,
            action: `jira_${name}`, resources: ["*"], save: [] })
          const stamp = { sessionID: context.sessionID, messageID: context.messageID, callID: context.id,
            invocationID: randomUUID(), name, key: input.issueIdOrKey,
            component: name === "getJiraIssueComments" ? `comments:${input.startAt ?? 0}` : "issue" }
          // Durable read counter: the only admissible basis for observed
          // recoveries and their attribution to a turn.
          const record = (state: string, extra = {}) => appendFile(join(ctx.location.directory, "fixture-calls.jsonl"),
            JSON.stringify({ ...stamp, state, time: Date.now(), ...extra }) + "\n")
          await record("started")
          if (input.cloudId && input.cloudId !== "fixture.atlassian.net") {
            await record("rejected"); throw new Error("Sitio fuera del corpus sintético")
          }
          let content: string
          if (name === "getAccessibleAtlassianResources")
            content = JSON.stringify([{ id: "fixture.atlassian.net", url: "https://fixture.atlassian.net", name: "Ficticio" }])
          else if (input.issueIdOrKey !== "APP-1") {
            await record("rejected"); throw new Error("Historia fuera del corpus sintético")
          } else content = name === "getJiraIssueComments" ? commentContents[(input.startAt ?? 0) / 2] : sourceContent
          await record("completed", { outcome: "available", result: content, resultSha256: hash(content) })
          return { content }
        },
      })
    })
    return () => signal.abort()
  },
})
