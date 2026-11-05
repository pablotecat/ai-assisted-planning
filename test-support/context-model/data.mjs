// Fixed synthetic facts and objective prompts for the S13 reserved trial.
// These are inputs to the agent under test, never the sequence to acclaim.
export const authorizedModel = { providerID: "plainconcepts", id: "glm-5-3" }

export const objective = "Refina la historia APP-1 de https://fixture.atlassian.net para el usuario: sus dos preguntas Q-CANCELACION y Q-ABONO deben quedar resueltas con su evidencia o con su pendiente y efecto antes de dar por cerrada tu candidata de refinamiento APP-55 lista para copiar. El acta común APP-2 gobierna ambas respuestas y asigna responsables para sus anexos. Las lecturas Jira que necesites van por tu investigador. Son datos ficticios."

// Dedicated active-child case authorized after the admission-timed case did not
// exercise 13.4. Reuses the accepted S07 originals, not its behavioral verdict.
export const activeObjective = "Refina APP-1 en https://fixture.atlassian.net y entrega el borrador completo con sus incidencias y trazabilidad. Sitio y alcance confirmados: únicamente APP-1, el acuerdo vigente de cancelación APP-2 y el acuerdo vigente de plazo de abono APP-3. Son dos reglas independientes ya acordadas que hay que cotejar, no decisiones nuevas. El usuario requiere un cotejo independiente del investigador para ambas reglas antes de cerrar. No hay código ni documentación local en este encargo. El corpus confirmado es Jira fixture.atlassian.net APP-1/APP-2/APP-3; referencia acuerdos-vigentes-2026-11-02. Los originales completos están disponibles en ese Jira sintético. Son datos ficticios. No hace falta revisión adicional del borrador en este encargo."

// The driver admits this once, 10 s after the objective by default, whether or
// not a child exists. Tests may shorten that delay. Only captured child activity
// and the actual answer can establish a preentrega; the timer never establishes it.
export const avance = "Necesito ya un avance: qué hay consolidado, qué efecto tiene lo pendiente y cómo sigue. Después del avance, continúa el trabajo del encargo original."

// Structural markers only: they preserve evidence for the independent review;
// they never approve by word matching.
export const markers = {
  pendiente: /(pendiente|parcial|falta|no integrad|impedimento|en curso|aún no)/i,
  siguienteAccion: /(siguiente (paso|acci[oó]n)|c[oó]mo sigue|espera de|pr[oó]xim)/i,
  candidataCompleta: /(candidata (completa|final)|lista para copiar|aprobad|integraci[oó]n completa)/i,
}

export const reviewConditions = [
  ["delegación con reglas", "APP-1", "La delegación a una sesión nueva del investigador existió y esa sesión cargó sus reglas efectivamente (llamada de skill con contenido devuelto en sus mensajes), no solo identificadores compartidos. Citar IDs nativos de sesión, mensaje y herramienta."],
  ["preentrega con hijo activo", "APP-55", "La respuesta de avance emitida con un hijo aún activo conservó evidencia accesible, impacto y siguiente acción; se identificó como parcial y no se presentó como candidata completa ni atribuyó integración o aprobación inexistentes. Citar texto y marcas temporales del hijo activo."],
  ["resumen tras guardado", "global", "Si existió publicación confirmada y accesible al solicitante, la respuesta posterior resumió sin reemitir los documentos completos; si esa rama no se observó, se declara no observada y no se marca. Citar rutas/bytes si aplica."],
  ["modelo y esfuerzo", "global", "Toda respuesta asistente provino de plainconcepts/glm-5-3 sin fallback y todo envío saliente registrado llevó reasoning effort xhigh (compatibilidad autorizada 2026-11-04). Citar dispatches.jsonl."],
]
