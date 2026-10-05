import { tool } from "@opencode-ai/plugin"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Publica historias e incidencias juntas en la carpeta del planificador; devuelve guardado:false si está desactivado.",
  args: {
    historias: tool.schema.array(tool.schema.object({
      clave: tool.schema.string(), contenido: tool.schema.string(), incidencias: tool.schema.string(),
    })).min(1),
    incidencias_globales: tool.schema.string(),
    fuentes: tool.schema.array(tool.schema.string()).optional().describe("Fuentes consultadas para el índice de sesión"),
    decisiones: tool.schema.array(tool.schema.string()).optional().describe("Decisiones relevantes para el índice de sesión"),
  },
  async execute(args, context) {
    if (context.agent !== "agente-planificador") throw new Error("Solo agente-planificador puede publicar historias")
    const historias = args.historias.map((item) => ({ ...item, clave: item.clave.trim() }))
    if (historias.some((item) => !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(item.clave) || !item.contenido.trim() || !item.incidencias.trim()) || !args.incidencias_globales.trim())
      throw new Error("Cada historia necesita identificador simple, contenido e incidencias; el informe global es obligatorio")
    if (new Set(historias.map((item) => item.clave)).size !== historias.length) throw new Error("Los identificadores deben ser únicos")
    const files = Object.fromEntries(historias.flatMap((item) => [
      [`${item.clave}.md`, item.contenido], [`${item.clave}-incidencias.md`, item.incidencias],
    ]))
    files["incidencias-globales.md"] = args.incidencias_globales
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: historias[0].clave, group: "entrega", files,
      keys: historias.map((item) => item.clave), sources: args.fuentes, decisions: args.decisiones }))
  },
})
