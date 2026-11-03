// Private S08 behavior-trial fixture. Not distributed with the planning package.
// Deterministic synthetic Jira (read-only): one complete source whose original
// includes a >2000-char single-line HTML description, custom fields and
// paginated comments. Every call is stamped to a durable counter file, so the
// driver records real observed recoveries, never estimates. No real model, no
// real Jira, no forwarding, no secrets.
import { Plugin } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { sourceContent, sourceSha256 } from "../data.mjs"

export default Plugin.define({
  id: "source-model-fixture",
  async setup(ctx) {
    await ctx.tool.transform(editor => {
      editor.namespace({ name: "jira", description: "Jira sintético del ensayo S08, solo lectura, fixture.atlassian.net APP-1." })
      for (const name of ["getAccessibleAtlassianResources", "getJiraIssue"]) editor.add({
        name, options: { namespace: "jira", codemode: true },
        description: `Lectura sintética ${name} del ensayo S08.`,
        input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
          fields: { type: "array", items: { type: "string" } }, view: { type: "string" } }, additionalProperties: false },
        async execute(input: any, context) {
          await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent,
            action: `jira_${name}`, resources: ["*"], save: [] })
          const stamp = { sessionID: context.sessionID, messageID: context.messageID, callID: context.id, name, key: input.issueIdOrKey }
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
          } else content = sourceContent
          await record("completed", { outcome: "available", resultSha256: sourceSha256 })
          return { content }
        },
      })
    })
  },
})
