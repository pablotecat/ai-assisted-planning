import { fileInput, fileOrigin, operationID, tool } from "./define_tool.ts"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Publica resumen ejecutivo e informe detallado juntos: literal u origen registrado por archivo, exclusivamente uno; devuelve guardado:false si está desactivado.",
  args: {
    operacion_id: operationID,
    slug: tool.schema.string().describe("Tema breve de la consulta; nunca es una ruta"),
    resumen_ejecutivo: tool.schema.string().min(1).optional(),
    origen_resumen_ejecutivo: fileOrigin.optional(),
    informe_detallado: tool.schema.string().min(1).optional(),
    origen_informe_detallado: fileOrigin.optional(),
    fuentes: tool.schema.array(tool.schema.string()).optional().describe("Fuentes consultadas para el índice de sesión"),
    decisiones: tool.schema.array(tool.schema.string()).optional().describe("Decisiones relevantes para el índice de sesión"),
  },
  async execute(args, context) {
    if (context.agent !== "investigador") throw new Error("Solo investigador puede publicar informes")
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: args.slug, group: "consulta", sources: args.fuentes, decisions: args.decisiones,
      files: { "resumen-ejecutivo.md": fileInput(args.resumen_ejecutivo, args.origen_resumen_ejecutivo),
        "informe-detallado.md": fileInput(args.informe_detallado, args.origen_informe_detallado) },
      operationID: args.operacion_id, publicationType: "write_report_pair" }, { get: context.resolver }))
  },
})
