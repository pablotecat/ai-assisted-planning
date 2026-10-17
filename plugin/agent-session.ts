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
  async function requireTestParent(id: string) {
    const session = await client.session.get({ path: { id }, query: { directory } })
    if (!session.data || session.error || session.data.id !== id || !session.data.parentID)
      throw new Error("Test requiere delegación de agente-arquitecto")
    const parent = await identity(session.data.parentID)
    if (parent.agent !== "agente-arquitecto" || parent.directory !== session.data.directory)
      throw new Error("Test requiere delegación de agente-arquitecto del mismo proyecto")
  }
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
            "agente-documentacion": allowed.includes("documentacion") ? "allow" : "deny",
            "agente-revisor": "allow" }
        }
      }
    },
    "chat.params": async (input) => {
      if (input.agent === "agente-arquitecto-test") await requireTestParent(input.sessionID)
    },
    "tool.execute.before": async (input, output) => {
      const agent = (await identity(input.sessionID)).agent
      const resumed = input.tool === "task" && output.args?.task_id ? await identity(output.args.task_id) : undefined
      const target = resumed?.agent ?? output.args?.subagent_type
      if (input.tool === "task" && target === "agente-documentacion" &&
        ["agente-planificador", "agente-arquitecto"].includes(agent))
        throw new Error("Planificador y Arquitecto no pueden delegar en agente-documentacion")
      if (input.tool === "task" && target === "agente-arquitecto-test" && agent !== "agente-arquitecto")
        throw new Error("Solo agente-arquitecto puede invocar Test")
      if (agent === "agente-arquitecto-test") {
        await requireTestParent(input.sessionID)
        if (input.tool === "task" && target !== "agente-revisor") throw new Error("Test solo delega en agente-revisor")
      }
      if (!agent.startsWith("agente-")) return
      if (["edit", "write", "apply_patch"].includes(input.tool)) throw new Error("Escritura local restringida a los publicadores de sesión")
      if (input.tool === "task" && agent === "agente-coordinador" && target !== "agente-revisor") {
        const allowed = (await readAgentSettings()).agentes.coordinador.especialistasPermitidos
        if (!allowed.some((name) => target === `agente-${name}`)) throw new Error("Especialista deshabilitado en agent-settings.json")
      }
      if (input.tool === "bash") {
        const command = output.args?.command
        const code = agent === "agente-codigo" && /^(?:codegraph (?:status|query|explore|context|node|callers|callees|files)\b|git (?:status|rev-parse|branch --show-current|log|show|diff|ls-tree|cat-file|blame|grep)\b)/.test(command)
        const docs = agent === "agente-documentacion" && /^markitdown (?:--version|--help|"[^"\r\n]+")$/.test(command)
        const test = agent === "agente-arquitecto-test" && /^git (?:status\b|rev-parse\b|branch --show-current$)/.test(command)
        if (typeof command !== "string" || !(code || docs || test) || /[;|&><`$\r\n]|\s(?:--output(?:=|\s)|--exec(?:=|\s)|--git-dir(?:=|\s)|-o(?:\s|$)|-c\s)/i.test(command))
          throw new Error("Comando de shell no permitido para estos agentes")
      }
    },
  }
}) satisfies Plugin
