import { tool } from "./define_tool.ts"
import { sessionArtifacts } from "./session_store.ts"
import { artifactFields } from "./work_contract.ts"

// V2-only presentation over an already authorized, hash-verified store result.
// Other tool results keep their historical string interface.
export function nativeArtifactContent(text: string) {
  const result = JSON.parse(text)
  if (!result.media) return text
  const { media, ...metadata } = result
  return [{ type: "text" as const, text: JSON.stringify({ ...metadata, presentacion: "archivo_nativo", lectura_visual: "no_acreditada" }) }, media]
}

export default tool({
  description: "Inventario/list y lectura/read de artefactos confirmados del encargo autorizado. Requiere encargo_id, corpus y referencia exactos; read añade artefacto_id y archivo exacto del manifiesto. El inventario incluye también la clave instantaneas: snapshots de fuente vigentes del encargo (propias o compartidas con él) con fuente, versión y cobertura por campos/páginas declaradas por su productor y hash del contenido verificado por el runtime; la vigencia no se decide por igualdad de fecha y una respuesta compacta no declara fuente completa. Consultar ese inventario antes de recuperar o delegar de nuevo; contrastar pregunta/criterios/corpus/referencia/versión/cobertura. Cursor opaco ligado a contenido y solicitante; limite: hasta 100 artefactos o 16000 unidades UTF-16 por lectura. Sigue cursor hasta null para lectura íntegra. Snapshots de texto (inicio snap-): read por su archivo fuentes/<slug>.txt; localizador L<número de línea 1-based> del original, exclusivo con cursor; vista:\"linea\" devuelve líneas estables del original intacto (una línea nunca se parte; una sola línea mayor que limite se emite entera) solo para formatos conocidos: un envoltorio desconocido produce diagnostico explícito, no undefined. PNG (representacion png_base64): read por ID y archivo .png devueltos, sin cursor/limite/localizador/vista; entrega bytes íntegros como archivo nativo V2, no texto base64 ni prueba automática de lectura visual. share: vínculo mínimo para reutilizar una instantánea de otro encargo del mismo corpus/referencia; solo quien gestiona ambos encargos puede compartir, el original se re-verifica por hash y la audiencia por rol no se amplía (las fuentes crudas de lectores siguen vetadas al Investigador). No acepta rutas arbitrarias ni amplía especialidad; sin encargo previo no infiere autorización histórica. No aprueba resultados.",
  args: artifactFields,
  async execute(args, context) {
    return JSON.stringify(await sessionArtifacts(args as never, context, { get: context.resolver }))
  },
})
