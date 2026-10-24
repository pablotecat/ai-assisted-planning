import { tool } from "./define_tool.ts"
import { publishReview } from "./session_store.ts"

export default tool({
  description: "El revisor adjunta sanidad y, si procede, disputa a una entrega ya publicada por su agente padre. Nunca reemplaza archivos.",
  args: {
    entrega: tool.schema.string().describe("Ruta absoluta confirmada de la carpeta o archivo entregado por el productor"),
    sanidad: tool.schema.string().optional().describe("Informe de revisión, también obligatorio si no hay hallazgos; omitir solo al adjuntar una disputa después"),
    disputa: tool.schema.string().optional().describe("Desacuerdo entre productor y revisor, redactado por el revisor"),
  },
  async execute(args, context) {
    if (context.agent !== "revisor") throw new Error("Solo revisor puede publicar revisiones")
    return JSON.stringify(await publishReview({ sessionID: context.sessionID, messageID: context.messageID,
      delivery: args.entrega, sanity: args.sanidad, dispute: args.disputa }, { get: context.resolver }))
  },
})
