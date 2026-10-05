import { tool } from "@opencode-ai/plugin"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Guarda una copia de los requisitos recibidos en Originales/ antes de delegar; una sola vez por encargo.",
  args: { historias: tool.schema.array(tool.schema.object({ clave: tool.schema.string(), contenido: tool.schema.string() })).min(1) },
  async execute(args, context) {
    if (context.agent !== "agente-planificador") throw new Error("Solo agente-planificador puede publicar originales")
    const historias = args.historias.map((item) => ({ ...item, clave: item.clave.trim() }))
    if (historias.some((item) => !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(item.clave) || !item.contenido.trim()))
      throw new Error("Cada original necesita identificador simple y contenido")
    if (new Set(historias.map((item) => item.clave)).size !== historias.length) throw new Error("Los identificadores deben ser únicos")
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: historias[0].clave, group: "Originales",
      files: Object.fromEntries(historias.map((item) => [`${item.clave}.md`, item.contenido])),
      keys: historias.map((item) => item.clave) }))
  },
})
