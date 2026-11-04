// S08 behavior trial case: fixed synthetic facts, never instructions to the
// agent under test. One complete source whose original includes a single-line
// HTML description over 2000 chars, custom fields and paginated comments; two
// questions in turn 1 and a different question of the same source in turn 2.
// The model under trial stays a declared parameter (default plainconcepts/
// glm-5-3, overridable with OPENCODE_EVIDENCE_MODEL; a provider not in
// models.json also needs OPENCODE_EVIDENCE_PROVIDER_PLUGIN, the existing
// read-by-URL plugin variable of the S02 driver). Declaring any of them never
// executes the trial: only the explicit orchestrator CLI invocation runs it.
import { createHash } from "node:crypto"

export const model = { providerID: "plainconcepts", id: "glm-5-3" }
export const site = { cloudId: "fixture.atlassian.net", url: "https://fixture.atlassian.net", name: "Ficticio" }
export const fuente = "APP-1"
export const reference = "acta-completa-2026-11-03"

// Answers actually contained in the original. A contradiction probe that is
// NOT in the source backs the contradictory-sources review condition.
export const cancellationRule = "una compra puede cancelarse dentro de las 48 horas siguientes al pago cuando el anexo firmado APP-3 la autoriza"
export const refundRule = "7 días naturales desde la cancelación confirmada"
export const guaranteePending = "el anexo de garantías no está firmado ni incluido en APP-1 según los comentarios de la historia"
export const contradictionProbe = "15 días naturales desde la solicitud"

// One single HTML line over 2000 chars, with a table, mentions and numbering.
const rows = Array.from({ length: 30 }, (_, index) => index === 6
  ? `<tr><td>7</td><td>condición 7: ${cancellationRule}</td><td>anexo-7</td></tr>`
  : `<tr><td>${index + 1}</td><td>condición ${index + 1}: sin efecto sobre cancelación, abono o garantía</td><td>anexo-${index + 1}</td></tr>`)
export const longHtml = `<table border="1"><tr><th>#</th><th>Regla</th><th>Anexo</th></tr>${rows.join("")}</table>`

// Ground truth of APP-1. The issue read exposes only the comment count; the
// actual comments must be obtained through their two paginated reads. Keeping
// them inline would make those extra recoveries artificial and redundant.
export const issue = {
  key: "APP-1",
  fields: {
    summary: "Condiciones de cancelación, abono y garantía de una compra",
    description: longHtml,
    customFields: { "Regla de cancelación vigente": cancellationRule, "Plazo de abono": refundRule },
    comment: {
      total: 4,
      comments: [
        { id: "c-1", page: 1, author: "Marta", text: "La regla vigente de cancelación es la publicada en la descripción y en el campo personalizado correspondiente." },
        { id: "c-2", page: 1, author: "Luis", text: "El plazo de abono se cuenta desde la cancelación confirmada, no desde la solicitud de cancelación." },
        { id: "c-3", page: 2, author: "Ana", text: "Sobre garantías: el anexo de garantías no está firmado ni incluido en esta historia." },
        { id: "c-4", page: 2, author: "Marta", text: "Aclaración: la versión vigente del acta es esta; ignoren versiones anteriores." },
      ],
    },
  },
}
export const issueRead = { ...issue, fields: { ...issue.fields, comment: { total: issue.fields.comment.total } } }
export const sourceContent = JSON.stringify(issueRead)
// Same structure, keys sorted: the byte-exact blob expected when the identical
// result is captured as an object (objeto_serializado).
export const stableStringify = value => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}
export const sourceObjectContent = stableStringify(issueRead)
export const sourceSha256 = createHash("sha256").update(sourceContent).digest("hex")
export const commentContents = [0, 2].map(startAt => JSON.stringify({ startAt, maxResults: 2, total: 4,
  comments: issue.fields.comment.comments.slice(startAt, startAt + 2) }))
export const sourceComponents = { issue: sourceContent, "comments:0": commentContents[0], "comments:2": commentContents[1] }

// The original exigido for completeness credit of this trial. A snapshot that
// does not declare (or does not cover) these pages and fields is never
// complete, and its pendientes stay separate from any other version's.
export const requiredCoverage = {
  paginas: { recuperadas: [1, 2], pendientes: [], total: 2 },
  campos: { recuperados: ["summary", "description", "customFields", "comment"], pendientes: [] },
}

// The prompts express objectives, scope, reference and questions only. They
// never order to capture, reuse, call a tool or follow a sequence: that
// behavior is what the trial must accredit from real observations.
export const promptTurn1 = "Investiga en https://fixture.atlassian.net las dos cuestiones de APP-1: Q-CANCELACION, ¿en qué condiciones se permite cancelar una compra?, y Q-ABONO, ¿qué plazo rige para emitir su abono? La respuesta funcional de cada cuestión necesita el original completo de la historia, incluidos la descripción con su tabla HTML, los campos personalizados y los comentarios paginados. Entrega la respuesta y los pendientes separados por cuestión, con sus evidencias. Sitio y alcance confirmados: únicamente APP-1 de fixture.atlassian.net; referencia acta-completa-2026-11-03. La entrega debe poder cotejarse de forma independiente con el original utilizado. Guardado confirmado. Son datos ficticios."
export const promptTurn2 = "Nueva cuestión del encargo en curso sobre la misma historia APP-1 de fixture.atlassian.net con la misma referencia acta-completa-2026-11-03: Q-GARANTIA, ¿qué cobertura de garantía acompaña a la ampliación de una compra? Entrega la respuesta y sus pendientes para Q-GARANTIA, separados de las cuestiones anteriores. Son datos ficticios."

export const reviewConditions = [
  ["Q-CANCELACION", "original", "La respuesta cita la regla realmente contenida en el original completo de APP-1 y su pendiente propio, separado de las demás cuestiones; no inventa condiciones."],
  ["Q-ABONO", "original", "La respuesta cita el plazo realmente contenido en el original completo de APP-1 y su pendiente propio, separado de las demás cuestiones; no inventa plazos."],
  ["ambas", "reutilización", "Las cuestiones se responden con el original ya disponible en el encargo: cada recuperación adicional observada está justificada por ampliación de alcance o cambio de versión, con evidencia del registro, no con estimaciones; una ruta o hash citados sin lectura real no acreditan reutilización."],
  ["completitud", "cobertura", "La completitud se declara solo con las páginas y campos del original exigido recuperados y sin pendientes; una captura o lectura parcial nunca se presenta como completa."],
  ["revisión", "independencia", "Si existe revisión de la entrega, leyó realmente la misma versión de la fuente que la entrega utilizó y su dictamen cita la entrega y el hash exactos; no hereda aprobación ajena."],
  ["contradicciones", "original", "Ninguna afirmación contradice el original conservado; versiones o fuentes contradictorias se registran con sus diferencias, sin conflatarse ni cerrar pendientes ajenos."],
]
