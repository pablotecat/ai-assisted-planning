// Synthetic read-only Jira for the opt-in S07 model check. No workflow instructions.
import { appendFile } from "node:fs/promises"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin"

export default Plugin.define({ id: "delegation-model-fixture", async setup(ctx) {
  await ctx.tool.transform(editor => {
    editor.namespace({ name: "jira", description: "Jira sintético de fixture.atlassian.net, solo lectura, APP-1 a APP-3." })
    for (const name of ["getAccessibleAtlassianResources", "getJiraIssue", "listJiraIssueComments"]) editor.add({
      name, options: { namespace: "jira", codemode: true }, description: `Lectura sintética ${name} de historias y acuerdos vigentes confirmados.`,
      input: { type: "object", properties: { cloudId: { type: "string" }, issueIdOrKey: { type: "string" },
        fields: { type: "array", items: { type: "string" } }, view: { type: "string" }, startAt: { type: "number" }, maxResults: { type: "number" } }, additionalProperties: false },
      async execute(input: any, context) {
        await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: `jira_${name}`, resources: ["*"], save: [] })
        const stamp = { sessionID: context.sessionID, name, key: input.issueIdOrKey }
        const record = (state: string) => appendFile(join(ctx.location.directory, "fixture-calls.jsonl"), JSON.stringify({ ...stamp, state, time: Date.now() }) + "\n")
        await record("started")
        if (name === "getAccessibleAtlassianResources") return { content: JSON.stringify([{ id: "fixture.atlassian.net", url: "https://fixture.atlassian.net", name: "Ficticio" }]) }
        if (!["APP-1", "APP-2", "APP-3"].includes(input.issueIdOrKey)) throw new Error("Historia fuera del corpus sintético")
        if (name === "getJiraIssue" && input.issueIdOrKey !== "APP-1") await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, input.issueIdOrKey === "APP-2" ? 8_000 : 2_000)
          context.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Ensayo interrumpido")) }, { once: true })
        })
        const descriptions: Record<string, string> = {
          "APP-1": "Como comprador quiero cancelar mi compra y recibir el abono para recuperar mi dinero. CA-1: permitir o rechazar según acuerdo vigente APP-2. CA-2: comunicar el plazo de abono según acuerdo vigente APP-3. Los valores de ambas reglas aún deben cotejarse con sus acuerdos, no decidirse de nuevo.",
          "APP-2": "Acuerdo vigente E-CANCEL: solo se permite cancelar antes de la expedición y dentro de las 48 horas naturales desde la compra. Si falta cualquiera de las condiciones, rechazar sin cambiar la compra. Es requisito documental confirmado, no evidencia de ejecución.",
          "APP-3": "Acuerdo vigente E-ABONO: tras aceptar una cancelación, el abono se emite en un máximo de 7 días naturales. Comunicar al comprador ese plazo y la fecha límite calculada desde la aceptación. Es requisito documental confirmado, no evidencia de ejecución.",
        }
        const result = name === "listJiraIssueComments" ? { startAt: 0, maxResults: 100, total: 0, comments: [] }
          : { key: input.issueIdOrKey, fields: { summary: input.issueIdOrKey === "APP-1" ? "Cancelar compra y recibir abono" : `Acuerdo ${input.issueIdOrKey}`,
            description: descriptions[input.issueIdOrKey], status: { name: "Acordado" }, comment: { total: 0 }, customFields: {} } }
        await record("completed")
        return { content: JSON.stringify(result) }
      },
    })
  })
} })
