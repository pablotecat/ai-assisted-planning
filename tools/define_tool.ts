import { tool as legacyTool, type ToolContext as LegacyToolContext } from "@opencode-ai/plugin"
import type { Resolver } from "./session_store.ts"

export type ToolContext = Pick<LegacyToolContext, "sessionID" | "messageID" | "agent"> & { resolver: Resolver }

// Keep the existing schemas, but require a resolver supplied by the registering plugin.
export function tool<Args extends legacyTool.schema.ZodRawShape>(definition: {
  description: string
  args: Args
  execute(args: legacyTool.schema.infer<legacyTool.schema.ZodObject<Args>>, context: ToolContext): Promise<string>
}) {
  return definition
}
tool.schema = legacyTool.schema

export const operationID = tool.schema.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/).optional()
  .describe("Identidad lógica estable: conserva el mismo valor y petición al reintentar; usa otro para una corrección deliberada")

export const workID = tool.schema.string().min(1).optional()
  .describe("ID local de session_work; vincula esta publicación al encargo/corpus asignado. No es un ID de OpenCode")

export const partial = tool.schema.object({
  proposito: tool.schema.string().trim().min(1), efecto: tool.schema.string().trim().min(1),
  siguiente_accion: tool.schema.string().trim().min(1),
}).strict().optional().describe("Entrega parcial explícita con dependencias activas; requiere encargo_id. Omitir exige integración de trabajos requeridos registrados")

export const fileOrigin = tool.schema.object({
  artefacto_id: tool.schema.string().min(1),
  archivo: tool.schema.string().min(1).describe("Ruta relativa exacta del archivo en el manifiesto registrado; nunca ruta arbitraria"),
  sha256: tool.schema.string().regex(/^[a-f0-9]{64}$/),
  transformaciones: tool.schema.array(tool.schema.object({
    anterior: tool.schema.string().min(1), nuevo: tool.schema.string(), coincidencias: tool.schema.number().int().positive(),
  }).strict()).optional().describe("Sustituciones exactas en orden sobre una copia del origen; cada una declara la cantidad esperada de coincidencias"),
  extraccion: tool.schema.object({ encabezado: tool.schema.string().min(1) }).strict().optional()
    .describe("Extrae la única sección cuyo encabezado '# ' coincide exactamente, hasta el siguiente encabezado '# '"),
})

export function fileInput(content?: string, origin?: { artefacto_id: string; archivo: string; sha256: string }) {
  if ((content !== undefined) === (origin !== undefined)) throw new Error("Indica contenido literal u origen, exclusivamente uno por archivo")
  if (content !== undefined && !content.trim()) throw new Error("Entregables vacíos")
  return origin ?? content!
}
