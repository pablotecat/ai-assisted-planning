import { tool } from "./define_tool.ts"
import { sessionWork } from "./session_store.ts"
import { workFields } from "./work_contract.ts"

export default tool({
  description: "Registro mínimo del encargo, no delega. create: pregunta/criterios/corpus/referencia y responsable real propio o hijo; list/get: trabajo autorizado; assign: mismo encargo a sustituto hijo; record: resultado, suficiencia (parcial/completo), pendientes, siguiente_accion, fuentes y decisiones, historial_revision opcional declarado; review: entrega exacta para Revisor hijo. IDs de encargo locales, no OpenCode. Guardado desactivado: sin persistencia nueva. Lee operativa-comun, recuperación.",
  args: workFields,
  async execute(args, context) {
    return JSON.stringify(await sessionWork(args as never, context, { get: context.resolver }))
  },
})
