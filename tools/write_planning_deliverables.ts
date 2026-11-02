import { fileInput, fileOrigin, operationID, tool, workID } from "./define_tool.ts"
import { publishSession } from "./session_store.ts"

export default tool({
  description: "Publica todas las historias, incidencias y globales juntas: literal u origen registrado por archivo, exclusivamente uno; devuelve guardado:false si está desactivado.",
  args: {
    operacion_id: operationID,
    encargo_id: workID,
    historias: tool.schema.array(tool.schema.object({
      clave: tool.schema.string(), contenido: tool.schema.string().optional(), origen_contenido: fileOrigin.optional(),
      incidencias: tool.schema.string().optional(), origen_incidencias: fileOrigin.optional(),
    })).min(1),
    incidencias_globales: tool.schema.string().optional(),
    origen_incidencias_globales: fileOrigin.optional(),
    fuentes: tool.schema.array(tool.schema.string()).optional().describe("Fuentes consultadas para el índice de sesión"),
    decisiones: tool.schema.array(tool.schema.string()).optional().describe("Decisiones relevantes para el índice de sesión"),
  },
  async execute(args, context) {
    if (context.agent !== "planificador") throw new Error("Solo planificador puede publicar historias")
    const historias = args.historias.map((item) => ({ ...item, clave: item.clave.trim() }))
    if (!historias.length || historias.some((item) => !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(item.clave)))
      throw new Error("Cada historia necesita identificador simple, contenido e incidencias; el informe global es obligatorio")
    if (new Set(historias.map((item) => item.clave)).size !== historias.length) throw new Error("Los identificadores deben ser únicos")
    const names = [...historias.flatMap(item => [`${item.clave}.md`, `${item.clave}-incidencias.md`]), "incidencias-globales.md"]
    if (new Set(names).size !== names.length) throw new Error("Los nombres de historias e incidencias deben ser únicos")
    const files = Object.fromEntries(historias.flatMap((item) => [
      [`${item.clave}.md`, fileInput(item.contenido, item.origen_contenido)],
      [`${item.clave}-incidencias.md`, fileInput(item.incidencias, item.origen_incidencias)],
    ]))
    files["incidencias-globales.md"] = fileInput(args.incidencias_globales, args.origen_incidencias_globales)
    return JSON.stringify(await publishSession({ sessionID: context.sessionID, messageID: context.messageID,
      agent: context.agent, topic: historias[0].clave, group: "entrega", files,
      keys: historias.map((item) => item.clave), sources: args.fuentes, decisions: args.decisiones,
      operationID: args.operacion_id, publicationType: "write_planning_deliverables", workID: args.encargo_id }, { get: context.resolver }))
  },
})
