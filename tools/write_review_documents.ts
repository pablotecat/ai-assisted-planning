import { operationID, tool } from "./define_tool.ts"
import { publishReview } from "./session_store.ts"

export default tool({
  description: "El revisor adjunta sanidad y disputa a una entrega de su padre, sin reemplazar archivos. Dictamen estructurado opcional ligado a artefacto/hash, solo tras guardar sanidad; narrativa sin aprobación inferida.",
  args: {
    operacion_id: operationID,
    entrega: tool.schema.string().describe("Ruta absoluta confirmada de la carpeta o archivo entregado por el productor"),
    sanidad: tool.schema.string().optional().describe("Informe de revisión, también obligatorio si no hay hallazgos; omitir solo al adjuntar una disputa después"),
    disputa: tool.schema.string().optional().describe("Desacuerdo entre productor y revisor, redactado por el revisor"),
    dictamen: tool.schema.object({
      artefacto_id: tool.schema.string().min(1), hash_manifiesto: tool.schema.string().regex(/^[a-f0-9]{64}$/),
      resultado: tool.schema.enum(["favorable", "parcial", "con_hallazgos"]),
      alcance: tool.schema.array(tool.schema.string()).min(1), aprobados: tool.schema.array(tool.schema.string()),
      pendientes: tool.schema.array(tool.schema.string()), bloqueados: tool.schema.array(tool.schema.string()),
    }).optional().describe("Resultado explícito de esta versión completa; requiere sanidad guardada en la misma operación"),
  },
  async execute(args, context) {
    if (context.agent !== "revisor") throw new Error("Solo revisor puede publicar revisiones")
    return JSON.stringify(await publishReview({ sessionID: context.sessionID, messageID: context.messageID,
      delivery: args.entrega, sanity: args.sanidad, dispute: args.disputa,
      operationID: args.operacion_id, verdict: args.dictamen }, { get: context.resolver }))
  },
})
