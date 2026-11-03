// Private S08 source-access fixture. Not distributed with the planning package.
// Deterministic synthetic read-only Jira under BOTH supported aliases (jira and
// atlassian) used by the permission and capture tests. No real model, no
// forwarding to real Jira or Atlassian.
import { Plugin } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"

// One single HTML line over 2000 chars: the captured original stays recoverable.
export const descriptionHtml = `<table border="1"><tr><th>#</th><th>Regla</th></tr>${Array.from({ length: 30 },
  (_, index) => `<tr><td>${index + 1}</td><td>regla ${index + 1} menciona APP-5 y APP-6</td></tr>`).join("")}</table>`

export const issueOf = (key: string, source: string) => ({ key, fields: {
  summary: `Historia sintética ${key}`,
  description: descriptionHtml,
  source,
  comment: { total: 1 },
  customFields: { customField_1001: "criterios en campo personalizado" },
} })

export default Plugin.define({
  id: "source-access-test",
  async setup(ctx) {
    await ctx.tool.transform(editor => {
      for (const [namespace, action] of [["jira", "jira_getJiraIssue"], ["atlassian", "atlassian_getJiraIssue"]] as const) {
        editor.namespace({ name: namespace, description: `Jira sintético de solo lectura (${namespace}), fixture.atlassian.net.` })
        editor.add({
          name: "getJiraIssue", options: { namespace, codemode: true },
          description: `Lectura sintética getJiraIssue del alias ${namespace}, solo lectura.`,
          input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
            fields: { type: "array", items: { type: "string" } }, view: { type: "string" } }, additionalProperties: false },
          async execute(input: any, context) {
            await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent,
              action, resources: ["*"], save: [] })
            await appendFile(join(ctx.location.directory, "source-access-calls.jsonl"), JSON.stringify({
              alias: namespace, sessionID: context.sessionID, messageID: context.messageID, callID: context.id,
              key: input.issueIdOrKey, time: Date.now() }) + "\n")
            if (input.cloudId !== "fixture.atlassian.net")
              throw new Error("Sitio fuera del fixture sintético")
            if (input.issueIdOrKey !== "APP-5" && input.issueIdOrKey !== "APP-6")
              throw new Error("Historia fuera del corpus sintético")
            return { content: JSON.stringify(issueOf(input.issueIdOrKey, namespace)) }
          },
        })
      }
    })
  },
})
