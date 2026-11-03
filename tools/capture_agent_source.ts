import { tool } from "./define_tool.ts"
import { captureSource, type SnapshotInput } from "./session_store.ts"

const text = tool.schema.string().trim().min(1)
const strings = tool.schema.array(text)
export const captureFields = {
  encargo_id: text.describe("ID local del encargo de session_work que autoriza corpus y referencia"),
  corpus: text, referencia: text,
  fuente: text.describe("Identificador de la fuente dentro del corpus, p. ej. APP-1"),
  operacion_id: tool.schema.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/)
    .describe("Identidad lógica de captura: mismo ID y contenido recuperan el mismo resultado; otro ID crea instantánea nueva sin sobrescribir la anterior"),
  representacion: tool.schema.enum(["texto_literal", "objeto_serializado"]).optional()
    .describe("Cuál representación se obtuvo; sin ella el runtime la deduce del valor recibido (string→texto literal, objeto→serializado determinista)"),
  version: tool.schema.object({ tipo: tool.schema.enum(["hash", "fecha", "referencia", "otro"]), valor: text })
    .strict().optional().describe("Versión o hash observado de la fuente en esta recuperación"),
  paginas: tool.schema.object({ recuperadas: tool.schema.array(tool.schema.number().int().min(0)).min(1),
    pendientes: tool.schema.array(tool.schema.number().int().min(0)), total: tool.schema.number().int().min(1) })
    .strict().optional().describe("Cobertura de páginas de este componente"),
  campos: tool.schema.object({ recuperados: strings, pendientes: strings })
    .strict().optional().describe("Cobertura de campos, incluidos campos personalizados"),
  pendientes: strings.optional().describe("Componentes aún no recuperados; una instantánea no declara completitud sin el original exigido"),
  resultado: tool.schema.union([tool.schema.string(), tool.schema.object({}).passthrough()]).optional()
    .describe("Respuesta de lectura ya obtenida en este mismo código: texto literal tal cual u objeto que el runtime serializa de forma determinista. No es una retranscripción del modelo"),
}
export const captureRequest = tool.schema.object(captureFields).strict()
export type CaptureRequest = SnapshotInput

export default tool({
  description: "Captura dentro de Code Mode un resultado de lectura ya obtenido (tools.jira.getJiraIssue, etc.), pasándolo directamente en el mismo código sin retranscripción del modelo. La herramienta de Code Mode y la lectura ocurren dentro del mismo execute; el runtime verifica productor, encargo y corpus por identidad real y no acepta autor declarado, ni rutas de destino (el blob se guarda por hash en el registro del encargo). Devuelve instantanea_id, representación obtenida, versión/hash y cobertura por campos/páginas con pendientes; una versión que cambia durante la recuperación añade instantánea, no sobrescribe. La instantánea se lee después con session_artifacts (read, cursores UTF-16, localizadores L<n> y vista linea para HTML largo). Con guardado desactivado devuelve exactamente {guardado:false} sin persistencia. No es un proxy HTTP ni ejecuta operaciones remotas.",
  args: captureFields,
  async execute(args, context) {
    return JSON.stringify(await captureSource(captureRequest.parse(args) as never, context, { get: context.resolver }))
  },
})
