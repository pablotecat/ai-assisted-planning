import { tool } from "@opencode-ai/plugin"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Guarda un entregable propio en la delegación actual. Nombre simple .md, nunca ruta; devuelve guardado:false si está desactivado.",
  args: {
    nombre: tool.schema.string().describe("Nombre simple terminado en .md"),
    contenido: tool.schema.string().min(1),
    fuentes: tool.schema.array(tool.schema.string()).optional().describe("Fuentes consultadas para el índice de sesión"),
    decisiones: tool.schema.array(tool.schema.string()).optional().describe("Decisiones relevantes para el índice de sesión"),
  },
  async execute(args, context) {
    if (!["agente-arquitecto", "agente-refinamiento", "agente-coordinador", "agente-codigo", "agente-documentacion"].includes(context.agent)) throw new Error("Agente no autorizado")
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: args.nombre, files: { [args.nombre]: args.contenido },
      sources: args.fuentes, decisions: args.decisiones }))
  },
})
