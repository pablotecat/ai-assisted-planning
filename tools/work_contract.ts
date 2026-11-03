import { tool } from "./define_tool.ts"

const text = tool.schema.string().trim().min(1)
const strings = tool.schema.array(text)
export const workFields = {
  action: tool.schema.enum(["create", "list", "get", "assign", "record", "review", "confirm", "start", "result", "integrate", "block"]),
  encargo_id: text.optional(),
  padre_id: text.optional(),
  pregunta: text.optional(), criterios: strings.optional(),
  corpus: text.optional(), referencia: text.optional(),
  responsable_session_id: text.optional(),
  requerido: tool.schema.boolean().optional(),
  preparacion_message_id: text.optional(), ejecucion_id: text.optional(), resultado_message_id: text.optional(),
  resultado_hash: text.regex(/^[a-f0-9]{64}$/).optional(), efecto: text.optional(), motivo: text.optional(),
  resultado: text.optional(), pendientes: strings.optional(), siguiente_accion: text.optional(),
  suficiencia: tool.schema.enum(["parcial", "completo"]).optional(),
  fuentes: strings.optional(), decisiones: strings.optional(),
  artefacto_id: text.optional(), revisor_session_id: text.optional(),
  historial_revision: tool.schema.object({ intentos_consumidos: tool.schema.number().int().min(0),
    limite: tool.schema.number().int().positive(), referencias: strings.min(1) }).strict().optional(),
}
const base = tool.schema.object(workFields)
// Each action rejects irrelevant fields too: IDs and recipients are not ambient authority.
export const workRequest = tool.schema.discriminatedUnion("action", [
  base.pick({ action: true, padre_id: true, pregunta: true, criterios: true, corpus: true, referencia: true,
    responsable_session_id: true, requerido: true }).extend({ action: tool.schema.literal("create"), pregunta: text,
    criterios: strings, corpus: text, referencia: text }).strict(),
  base.pick({ action: true }).extend({ action: tool.schema.literal("list") }).strict(),
  base.pick({ action: true, encargo_id: true }).extend({ action: tool.schema.literal("get"), encargo_id: text }).strict(),
  base.pick({ action: true, encargo_id: true, responsable_session_id: true }).extend({ action: tool.schema.literal("assign"),
    encargo_id: text, responsable_session_id: text }).strict(),
  base.pick({ action: true, encargo_id: true, resultado: true, pendientes: true, siguiente_accion: true, suficiencia: true,
    fuentes: true, decisiones: true, artefacto_id: true, historial_revision: true }).extend({ action: tool.schema.literal("record"),
    encargo_id: text, resultado: text, pendientes: strings, siguiente_accion: text, fuentes: strings, decisiones: strings,
    suficiencia: tool.schema.enum(["parcial", "completo"]) }).strict(),
  base.pick({ action: true, encargo_id: true, artefacto_id: true, revisor_session_id: true }).extend({ action: tool.schema.literal("review"),
    encargo_id: text, artefacto_id: text, revisor_session_id: text }).strict(),
  base.pick({ action: true, encargo_id: true, pregunta: true, corpus: true, referencia: true, preparacion_message_id: true })
    .required().extend({ action: tool.schema.literal("confirm") }).strict(),
  base.pick({ action: true, encargo_id: true, ejecucion_id: true }).required().extend({ action: tool.schema.literal("start") }).strict(),
  base.pick({ action: true, encargo_id: true, ejecucion_id: true, resultado_message_id: true }).required()
    .extend({ action: tool.schema.literal("result"), artefacto_id: text.optional() }).strict(),
  base.pick({ action: true, encargo_id: true, ejecucion_id: true, resultado_hash: true, efecto: true, siguiente_accion: true }).required()
    .extend({ action: tool.schema.literal("integrate") }).strict(),
  base.pick({ action: true, encargo_id: true, ejecucion_id: true, motivo: true, efecto: true, siguiente_accion: true }).required()
    .extend({ action: tool.schema.literal("block") }).strict(),
])
export type WorkRequest = ReturnType<typeof workRequest.parse>

export const artifactFields = {
  action: tool.schema.enum(["list", "read"]), encargo_id: text, corpus: text, referencia: text,
  artefacto_id: text.optional(), archivo: text.optional(), cursor: text.optional(),
  limite: tool.schema.number().int().min(1).max(16000).optional(),
  vista: tool.schema.enum(["linea"]).optional().describe("Vista derivada estable por líneas del original intacto; solo formatos conocidos, un envoltorio desconocido produce diagnóstico"),
  localizador: text.optional().describe("Localizador de fragmento L<número de línea 1-based> del original registrado; exclusivo con cursor"),
}
const artifacts = tool.schema.object(artifactFields)
export const artifactRequest = tool.schema.discriminatedUnion("action", [
  artifacts.omit({ archivo: true, artefacto_id: true, vista: true, localizador: true })
    .extend({ action: tool.schema.literal("list") }).strict(),
  artifacts.extend({ action: tool.schema.literal("read"), artefacto_id: text, archivo: text }).strict(),
])
export type ArtifactRequest = ReturnType<typeof artifactRequest.parse>
