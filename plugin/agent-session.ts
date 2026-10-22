import { Plugin } from "@opencode/plugin"
import { tool } from "@opencode-ai/plugin"
import agentSettings, { readAgentSettings } from "../tools/agent_settings.ts"
import architectureSettings from "../tools/architecture_settings.ts"
import investigatorDefaults from "../tools/investigator_defaults.ts"
import planningSettings from "../tools/planning_settings.ts"
import refinementSettings from "../tools/refinement_settings.ts"
import publishAgentDeliverable from "../tools/publish_agent_deliverable.ts"
import writePlanningOriginals from "../tools/write_planning_originals.ts"
import writePlanningDeliverables from "../tools/write_planning_deliverables.ts"
import writeReportPair from "../tools/write_report_pair.ts"
import writeReviewDocuments from "../tools/write_review_documents.ts"
import { setSessionResolver } from "../tools/session_store.ts"

const packageAgents = new Set(["investigador", "lector-codigo", "lector-documentacion", "planificador",
  "refinador", "arquitecto", "arquitecto-test", "revisor"])

export default Plugin.define({
  id: "ai-assisted-planning.agent-session",
  async setup(ctx) {
    async function identity(id: string, messageID?: string) {
      const session = await ctx.session.get({ sessionID: id })
      if (session.id !== id) throw new Error("Sesión OpenCode no verificable")
      let agent = session.agent
      if (messageID) {
        const messages = await ctx.session.context({ sessionID: id })
        const message = messages.find((message) => message.id === messageID)
        if (!message || message.type !== "assistant") throw new Error("No hay mensaje de agente atribuible")
        agent = message.agent
      }
      if (!agent) throw new Error("Agente OpenCode no verificable")
      return { id: session.id, parentID: session.parentID, agent,
        title: session.title ?? "", created: session.time.created, directory: session.location.directory }
    }
    setSessionResolver(identity)
    // Register explicitly: V2 does not expose the legacy tools/ files by itself.
    await ctx.tool.transform((editor) => {
      for (const [name, definition] of Object.entries({
        agent_settings: agentSettings, architecture_settings: architectureSettings,
        investigator_defaults: investigatorDefaults, planning_settings: planningSettings,
        refinement_settings: refinementSettings, publish_agent_deliverable: publishAgentDeliverable,
        write_planning_originals: writePlanningOriginals, write_planning_deliverables: writePlanningDeliverables,
        write_report_pair: writeReportPair, write_review_documents: writeReviewDocuments,
      })) {
        const schema = tool.schema.object(definition.args)
        editor.add({
          name, description: definition.description,
          input: tool.schema.toJSONSchema(schema, { unrepresentable: "any" }), options: { codemode: false },
          async execute(input, context) {
            await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent,
              source: { type: "tool", messageID: context.messageID, id: context.id },
              action: name, resources: ["*"], save: ["*"] })
            return { content: await definition.execute(schema.parse(input) as never, context as never) as string }
          },
        })
      }
    })
    async function requireTestParent(id: string) {
      const session = await ctx.session.get({ sessionID: id })
      if (session.id !== id || !session.parentID)
        throw new Error("Test requiere delegación de arquitecto")
      const parent = await identity(session.parentID)
      if (parent.agent !== "arquitecto" || parent.directory !== session.location.directory)
        throw new Error("Test requiere delegación de arquitecto del mismo proyecto")
    }
    const allowed = (await readAgentSettings()).agentes.investigador.especialistasPermitidos
    await ctx.agent.transform((editor) => {
      editor.update("investigador", (agent) => {
        agent.permissions.push({ action: "subagent", resource: "*", effect: "deny" },
          ...["lector-codigo", "lector-documentacion", "revisor"].map((name) => ({
            action: "subagent", resource: name, effect: name === "revisor" || allowed.includes(name as typeof allowed[number])
              ? "allow" as const : "deny" as const,
          })))
      })
    })
    // Runtime enforcement also covers config transforms registered after this plugin.
    await ctx.permission.hook("evaluate", async (event) => {
      if (event.action !== "subagent" || event.agent !== "investigador") return
      const allowed = (await readAgentSettings()).agentes.investigador.especialistasPermitidos
      if (event.resources.some(name => name !== "revisor" && !allowed.includes(name as typeof allowed[number]))) {
        event.effect = "deny"
        event.message = "Especialista deshabilitado en agent-settings.json"
      }
    })
    await ctx.session.hook("context", async (event) => {
      if (event.agent === "arquitecto-test") await requireTestParent(event.sessionID)
    })
    await ctx.tool.hook("execute.before", async (event) => {
      const agent = event.agent
      const args = event.input as { sessionID?: string; agent?: string; command?: string }
      const resumed = event.tool === "subagent" && args.sessionID ? await identity(args.sessionID) : undefined
      const target = resumed?.agent ?? args.agent
      if (event.tool === "subagent" && target === "lector-documentacion" &&
        ["planificador", "arquitecto"].includes(agent))
        throw new Error("Planificador y Arquitecto no pueden delegar en lector-documentacion")
      if (event.tool === "subagent" && target === "arquitecto-test" && agent !== "arquitecto")
        throw new Error("Solo arquitecto puede invocar Test")
      if (agent === "arquitecto-test") {
        await requireTestParent(event.sessionID)
        if (event.tool === "subagent" && target !== "revisor") throw new Error("Test solo delega en revisor")
      }
      if (!packageAgents.has(agent)) return
      if (["edit", "write", "patch"].includes(event.tool)) throw new Error("Escritura local restringida a los publicadores de sesión")
      if (event.tool === "subagent" && agent === "investigador" && target !== "revisor") {
        const allowed = (await readAgentSettings()).agentes.investigador.especialistasPermitidos
        if (!allowed.includes(target as typeof allowed[number])) throw new Error("Especialista deshabilitado en agent-settings.json")
      }
      if (event.tool === "shell") {
        const command = args.command
        if (typeof command !== "string") throw new Error("Comando de shell no permitido para estos agentes")
        const code = agent === "lector-codigo" && /^(?:codegraph (?:status|query|explore|context|node|callers|callees|files)\b|git (?:status|rev-parse|branch --show-current|log|show|diff|ls-tree|cat-file|blame|grep)\b)/.test(command)
        const docs = agent === "lector-documentacion" && /^markitdown (?:--version|--help|"[^"\r\n]+")$/.test(command)
        const test = agent === "arquitecto-test" && /^git (?:status\b|rev-parse\b|branch --show-current$)/.test(command)
        if (!(code || docs || test) || /[;|&><`$\r\n]|\s(?:--output(?:=|\s)|--exec(?:=|\s)|--git-dir(?:=|\s)|-o(?:\s|$)|-c\s)/i.test(command))
          throw new Error("Comando de shell no permitido para estos agentes")
      }
    })
  },
})
