// Synthetic originals shared by the read-only fixture and the offline review checklist.
export const descriptions = {
  "APP-1": "Como comprador quiero cancelar mi compra y recibir el abono para recuperar mi dinero. CA-1: permitir o rechazar según acuerdo vigente APP-2. CA-2: comunicar el plazo de abono según acuerdo vigente APP-3. Los valores de ambas reglas aún deben cotejarse con sus acuerdos, no decidirse de nuevo.",
  "APP-2": "Acuerdo vigente E-CANCEL: solo se permite cancelar antes de la expedición y dentro de las 48 horas naturales desde la compra. Si falta cualquiera de las condiciones, rechazar sin cambiar la compra. Es requisito documental confirmado, no evidencia de ejecución.",
  "APP-3": "Acuerdo vigente E-ABONO: tras aceptar una cancelación, el abono se emite en un máximo de 7 días naturales. Comunicar al comprador ese plazo y la fecha límite calculada desde la aceptación. Es requisito documental confirmado, no evidencia de ejecución.",
}

export const reviewConditions = [
  ["APP-2", "Cancelación solo antes de la expedición"],
  ["APP-2", "Cancelación dentro de 48 horas naturales desde la compra; ambas condiciones son necesarias"],
  ["APP-2", "Si falta cualquiera de las condiciones, rechazar sin modificar la compra"],
  ["APP-3", "Abono como máximo en 7 días naturales desde la aceptación de la cancelación"],
  ["APP-3", "Comunicar al comprador el plazo y la fecha límite calculada desde la aceptación"],
]
