import { tool } from "./define_tool.ts"

const text = tool.schema.string().min(1)
const offset = tool.schema.number().int().nonnegative()
const sha256 = tool.schema.string().regex(/^[a-f0-9]{64}$/)
export const validationContract = tool.schema.object({
  perfil: tool.schema.literal("historia-incidencias-v1"),
  documentos: tool.schema.array(tool.schema.object({ archivo: text, tipo: tool.schema.enum(["historia", "incidencias"]) }).strict()).min(1),
  fuentes: tool.schema.array(tool.schema.object({ id: text, instantanea_id: text, sha256,
    criterios: tool.schema.array(tool.schema.object({ id: text, inicio: offset, fin: offset }).strict()),
  }).strict()).optional(),
  trazabilidad: tool.schema.array(tool.schema.object({ fuente: text, original: text, archivo: text,
    destinos: tool.schema.array(tool.schema.object({ archivo: text, criterio: text }).strict()),
    estado: tool.schema.enum(["conservado", "repartido", "pendiente", "propuesta"]),
  }).strict()).optional(),
  referencias: tool.schema.array(tool.schema.object({ archivo: text, texto: text, destino: text, sha256 }).strict()).optional(),
  citas: tool.schema.array(tool.schema.object({ archivo: text, inicio: offset, fin: offset, fuente: text,
    inicio_fuente: offset, fin_fuente: offset, sha256 }).strict()).optional(),
}).strict()

export const validation = validationContract.optional()
  .describe("Perfil opt-in Historia/incidencias y vínculos a originales registrados; valida toda la entrega antes del commit, sin aprobación semántica")
