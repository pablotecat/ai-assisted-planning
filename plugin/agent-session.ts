import type { Plugin } from "@opencode-ai/plugin"
import { readAgentSettings } from "../tools/agent_settings.ts"
import { setSessionResolver } from "../tools/session_store.ts"

const packageAgents = new Set(["investigador", "lector-codigo", "lector-documentacion", "planificador",
  "refinador", "arquitecto", "arquitecto-test", "revisor"])

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
      throw new Error("Test requiere delegación de arquitecto")
    const parent = await identity(session.data.parentID)
    if (parent.agent !== "arquitecto" || parent.directory !== session.data.directory)
      throw new Error("Test requiere delegación de arquitecto del mismo proyecto")
  }
  return {
    config: async (config) => {
      const settings = await readAgentSettings()
      const allowed = settings.agentes.investigador.especialistasPermitidos
      const investigator = config.agent?.investigador
      if (investigator) {
        investigator.permission ??= {}
        if (typeof investigator.permission === "object") {
          investigator.permission.task = { "*": "deny",
            "lector-codigo": allowed.includes("lector-codigo") ? "allow" : "deny",
            "lector-documentacion": allowed.includes("lector-documentacion") ? "allow" : "deny",
            revisor: "allow" }
        }
      }
    },
    "chat.params": async (input) => {
      if (input.agent === "arquitecto-test") await requireTestParent(input.sessionID)
    },
    "tool.execute.before": async (input, output) => {
      const agent = (await identity(input.sessionID)).agent
      const resumed = input.tool === "task" && output.args?.task_id ? await identity(output.args.task_id) : undefined
      const target = resumed?.agent ?? output.args?.subagent_type
      if (input.tool === "task" && target === "lector-documentacion" &&
        ["planificador", "arquitecto"].includes(agent))
        throw new Error("Planificador y Arquitecto no pueden delegar en lector-documentacion")
      if (input.tool === "task" && target === "arquitecto-test" && agent !== "arquitecto")
        throw new Error("Solo arquitecto puede invocar Test")
      if (agent === "arquitecto-test") {
        await requireTestParent(input.sessionID)
        if (input.tool === "task" && target !== "revisor") throw new Error("Test solo delega en revisor")
      }
      if (!packageAgents.has(agent)) return
      if (["edit", "write", "apply_patch"].includes(input.tool)) throw new Error("Escritura local restringida a los publicadores de sesión")
      if (input.tool === "task" && agent === "investigador" && target !== "revisor") {
        const allowed = (await readAgentSettings()).agentes.investigador.especialistasPermitidos
        if (!allowed.includes(target)) throw new Error("Especialista deshabilitado en agent-settings.json")
      }
      if (input.tool === "bash") {
        const command = output.args?.command
        const code = agent === "lector-codigo" && /^(?:codegraph (?:status|query|explore|context|node|callers|callees|files)\b|git (?:status|rev-parse|branch --show-current|log|show|diff|ls-tree|cat-file|blame|grep)\b)/.test(command)
        const docs = agent === "lector-documentacion" && /^markitdown (?:--version|--help|"[^"\r\n]+")$/.test(command)
        const test = agent === "arquitecto-test" && /^git (?:status\b|rev-parse\b|branch --show-current$)/.test(command)
        if (typeof command !== "string" || !(code || docs || test) || /[;|&><`$\r\n]|\s(?:--output(?:=|\s)|--exec(?:=|\s)|--git-dir(?:=|\s)|-o(?:\s|$)|-c\s)/i.test(command))
          throw new Error("Comando de shell no permitido para estos agentes")
      }
    },
  }
}) satisfies Plugin
