import { tool } from "./define_tool.ts"
import { sessionArtifacts } from "./session_store.ts"
import { artifactFields } from "./work_contract.ts"

export default tool({
  description: "Inventario/list y lectura/read de artefactos confirmados del encargo autorizado. Requiere encargo_id, corpus y referencia exactos; read añade artefacto_id y archivo exacto del manifiesto. Cursor opaco ligado a contenido y solicitante; limite: hasta 100 artefactos o 16000 unidades UTF-16 por lectura. Sigue cursor hasta null para lectura íntegra. No acepta rutas arbitrarias ni amplía especialidad; sin encargo previo no infiere autorización histórica. No escribe ni aprueba resultados.",
  args: artifactFields,
  async execute(args, context) {
    return JSON.stringify(await sessionArtifacts(args as never, context, { get: context.resolver }))
  },
})
