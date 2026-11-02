import { tool } from "./define_tool.ts"
import { sessionWork } from "./session_store.ts"
import { workFields } from "./work_contract.ts"

export default tool({
  description: "Registro del encargo, no delega. create: pregunta/criterios/corpus/referencia, responsable real propio/hijo, padre_id y requerido opcionales; list/get: registro y mensajes finales del responsable con IDs nativos; assign: sustituto hijo. confirm: propietario, pregunta/corpus/referencia exactos y preparacion_message_id nativo PENDIENTE_CONFIRMACION; devuelve ejecucion.id local. start: responsable tras CONFIRMAR con encargo/ejecucion_id en mensaje nativo. result: propietario, ejecucion_id/resultado_message_id final y artefacto_id opcional; integrate: propietario, ejecucion_id/resultado_hash exacto, efecto/siguiente_accion; block: propietario, ejecucion_id/motivo/efecto/siguiente_accion sin hijo activo. record: resultado/suficiencia/pendientes/siguiente_accion/fuentes/decisiones, historial_revision opcional; review: entrega exacta para Revisor hijo. IDs work/exec locales, no nativos. Guardado:false sin persistencia. Lee operativa-comun, delegación y recuperación.",
  args: workFields,
  async execute(args, context) {
    return JSON.stringify(await sessionWork(args as never, context, { get: context.resolver }))
  },
})
