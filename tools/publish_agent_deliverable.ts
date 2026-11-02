import { fileInput, fileOrigin, operationID, tool, workID } from "./define_tool.ts"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Guarda un entregable propio: contenido literal u origen registrado, exclusivamente uno. Nombre simple .md, nunca ruta; devuelve guardado:false si está desactivado.",
  args: {
    operacion_id: operationID,
    encargo_id: workID,
    nombre: tool.schema.string().describe("Nombre simple terminado en .md"),
    contenido: tool.schema.string().min(1).optional(),
    origen: fileOrigin.optional().describe("Alternativa a contenido: promueve un archivo registrado accesible sin reemitirlo"),
    fuentes: tool.schema.array(tool.schema.string()).optional().describe("Fuentes consultadas para el índice de sesión"),
    decisiones: tool.schema.array(tool.schema.string()).optional().describe("Decisiones relevantes para el índice de sesión"),
  },
  async execute(args, context) {
    if (!["arquitecto", "arquitecto-test", "refinador", "investigador", "lector-codigo", "lector-documentacion"].includes(context.agent)) throw new Error("Agente no autorizado")
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: args.nombre, files: { [args.nombre]: fileInput(args.contenido, args.origen) },
      sources: args.fuentes, decisions: args.decisiones, operationID: args.operacion_id,
      workID: args.encargo_id,
      publicationType: "publish_agent_deliverable" }, { get: context.resolver }))
  },
})
