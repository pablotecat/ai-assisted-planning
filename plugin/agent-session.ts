import type { Plugin } from "@opencode-ai/plugin"
import { readAgentSettings } from "../tools/agent_settings.ts"
import { setSessionResolver } from "../tools/session_store.ts"

export default (async ({ client, directory }) => {
  async function identity(id: string, messageID?: string) {
    const session = await client.session.get({ path: { id }, query: { directory } })
    if (!session.data || session.error) throw new Error("Sesión OpenCode no verificable")
    const response = messageID
      ? await client.session.message({ path: { id, messageID }, query: { directory } })
      : await client.session.messages({ path: { id }, query: { directory, limit: 30 } })
    if (!response.data || response.error) throw new Error("Agente OpenCode no verificable")
    const messages = Array.isArray(response.data) ? response.data : [response.data]
    const assistant = messages.map((m) => m.info).filter((m) => m.role === "assistant" && !m.summary).at(-1)
    if (!assistant) throw new Error("No hay mensaje de agente atribuible")
    const agent = (assistant as typeof assistant & { agent?: string }).agent ?? assistant.mode
    return { id: session.data.id, parentID: session.data.parentID, agent,
      title: session.data.title, created: session.data.time.created, directory: session.data.directory }
  }
  setSessionResolver(identity)
  return {
    config: async (config) => {
      const settings = await readAgentSettings()
      const allowed = settings.agentes.coordinador.especialistasPermitidos
      const coordinator = config.agent?.["agente-coordinador"]
      if (coordinator) {
        coordinator.permission ??= {}
        if (typeof coordinator.permission === "object") {
          coordinator.permission.task = { "*": "deny",
            "agente-codigo": allowed.includes("codigo") ? "allow" : "deny",
            "agente-documentacion": allowed.includes("documentacion") ? "allow" : "deny" }
        }
      }
    },
    "tool.execute.before": async (input, output) => {
      const agent = (await identity(input.sessionID)).agent
      if (!agent.startsWith("agente-")) return
      if (["edit", "write", "apply_patch"].includes(input.tool)) throw new Error("Escritura local restringida a los publicadores de sesión")
      if (input.tool === "task" && agent === "agente-coordinador") {
        const allowed = (await readAgentSettings()).agentes.coordinador.especialistasPermitidos
        const target = output.args?.subagent_type
        if (!allowed.some((name) => target === `agente-${name}`)) throw new Error("Especialista deshabilitado en agent-settings.json")
      }
      if (input.tool === "bash") {
        const command = output.args?.command
        const code = agent === "agente-codigo" && /^(?:codegraph (?:status|query|explore|context|node|callers|callees|files)\b|git (?:status|rev-parse|branch --show-current|log|show|diff|ls-tree|cat-file|blame|grep)\b)/.test(command)
        const docs = agent === "agente-documentacion" && /^markitdown (?:--version|--help|"[^"\r\n]+")$/.test(command)
        if (typeof command !== "string" || !(code || docs) || /[;|&><`$\r\n]|\s(?:--output(?:=|\s)|--exec(?:=|\s)|--git-dir(?:=|\s)|-o(?:\s|$)|-c\s)/i.test(command))
          throw new Error("Comando de shell no permitido para estos agentes")
      }
    },
  }
}) satisfies Plugin
