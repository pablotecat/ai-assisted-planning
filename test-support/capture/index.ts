// Private capture contract fixture. Not distributed with the planning package.
// Deterministic synthetic Jira (read-only) used by the S08 private server test.
// No real model, no forwarding to real Jira.
import { Plugin } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"

// One single HTML line over 2000 chars, with a table, mentions and numbering.
export const longHtml = `<table border="1"><tr><th>#</th><th>Regla</th><th>Anexo</th></tr>${Array.from({ length: 30 },
  (_, index) => `<tr><td>${index + 1}</td><td>condición ${index + 1} menciona APP-3 y APP-4</td><td>anexo-${index + 1}</td></tr>`)
  .join("")}</table>`

export default Plugin.define({
  id: "capture-test",
  async setup(ctx) {
    await ctx.tool.transform(editor => {
      editor.namespace({ name: "jira", description: "Jira sintético de captura, solo lectura, fixture.atlassian.net APP-1." })
      editor.add({
        name: "getJiraIssue", options: { namespace: "jira", codemode: true },
        description: "Lectura sintética getJiraIssue con description HTML larga en una línea.",
        input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
          fields: { type: "array", items: { type: "string" } }, view: { type: "string" } }, additionalProperties: false },
        async execute(input: any, context) {
          await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent,
            action: "jira_getJiraIssue", resources: ["*"], save: [] })
          const stamp = { sessionID: context.sessionID, messageID: context.messageID, callID: context.id,
            name: "getJiraIssue", key: input.issueIdOrKey, time: Date.now() }
          await appendFile(join(ctx.location.directory, "capture-fixture-calls.jsonl"), JSON.stringify(stamp) + "\n")
          if (input.cloudId !== "fixture.atlassian.net" || input.issueIdOrKey !== "APP-1")
            throw new Error("Historia fuera del corpus sintético")
          return { content: JSON.stringify({ key: input.issueIdOrKey, fields: {
            summary: "Consulta de captura", description: longHtml, comment: { total: 2 }, customFields: {} } }) }
        },
      })
    })
  },
})
