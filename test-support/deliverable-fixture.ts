import type { ValidationInput } from "../tools/deliverable_validation.ts"
import { contentHash } from "../tools/deliverable_validation.ts"

export const story = `# H1 — Consultar saldo

**Identidad:** local H1
**Versión y procedencia:** v1; taller ficticio
**Estado:** pendiente de revisión

## Actor, objetivo y valor
Como titular, conocer mi saldo disponible.

## Alcance y reglas funcionales
- Consulta; sin descarga.

## Criterios de aceptación confirmados
- **CA-1 — Mostrar saldo**
  - **Dado** un titular autenticado
  - **Cuando** abre Bonos
  - **Entonces** se muestra el saldo

## Propuestas de criterios — pendientes de confirmación
- **PC-1 — Mostrar fecha**
  - **Dado** un titular autenticado
  - **Cuando** abre Bonos
  - **Entonces** se muestra la fecha
  Propuesta; decide producto.

## Dependencias, decisiones y preguntas pendientes
- Pendiente: confirmar PC-1; decide producto.
`
export const incidents = `# Incidencias — H1

**Entrega:** v1

## Hallazgos y decisiones pendientes
- **INC-1**; H1/PC-1; taller ficticio; fecha no acordada; decide producto; pendiente.

## Trazabilidad al original
| Criterio original y fuente | Destino (historia/criterio) | Estado y cambio justificado |
|---|---|---|
| OR-1: mostrar saldo, taller ficticio | H1/CA-1 | conservado |
`
export const files = { "H1.md": story, "H1-incidencias.md": incidents }
export const validation: ValidationInput = { perfil: "historia-incidencias-v1", documentos: [
  { archivo: "H1.md", tipo: "historia" }, { archivo: "H1-incidencias.md", tipo: "incidencias" },
] }
export const original = "OR-1: mostrar saldo; eliminaran los datos distintos de otros; presevar.\r\nOR-2: descargar movimientos."
export const sources = { "taller ficticio": original }
export const linked: ValidationInput = { ...validation, fuentes: [{ id: "taller ficticio", instantanea_id: "snap-fixture",
  sha256: contentHash(original), criterios: [{ id: "OR-1", inicio: 0, fin: original.indexOf("\r\n") },
    { id: "OR-2", inicio: original.indexOf("OR-2"), fin: original.length }] }], trazabilidad: [
  { fuente: "taller ficticio", original: "OR-1", archivo: "H1-incidencias.md", destinos: [{ archivo: "H1.md", criterio: "H1/CA-1" }], estado: "conservado" },
  { fuente: "taller ficticio", original: "OR-2", archivo: "H1-incidencias.md", destinos: [], estado: "pendiente" },
] }
export const linkedFiles = { ...files, "H1-incidencias.md": incidents + "| OR-2: descargar movimientos, taller ficticio | Pendiente | pendiente: decide producto |\n" }
const quotation = "> " + original.split("\r\n")[0]
const detail = linkedFiles["H1-incidencias.md"] + "\nArchivo cotejado: H1.md\n\n" + quotation
export const completeFiles = { ...linkedFiles, "H1-incidencias.md": detail }
export const completeValidation: ValidationInput = { ...linked,
  referencias: [{ archivo: "H1-incidencias.md", texto: "H1.md", destino: "H1.md", sha256: contentHash(story) }],
  citas: [{ archivo: "H1-incidencias.md", inicio: detail.length - quotation.length, fin: detail.length,
    fuente: "taller ficticio", inicio_fuente: 0, fin_fuente: original.indexOf("\r\n"), sha256: contentHash(original.split("\r\n")[0]) }],
}
