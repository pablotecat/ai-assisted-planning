import { createHash } from "node:crypto"

// Perfil opt-in del formato Historia/incidencias. Sin I/O ni decisiones semánticas.
export type ValidationSource = { id: string; instantanea_id: string; sha256: string;
  criterios: { id: string; inicio: number; fin: number }[] }
export type ValidationInput = {
  perfil: "historia-incidencias-v1"
  documentos: { archivo: string; tipo: "historia" | "incidencias" }[]
  fuentes?: ValidationSource[]
  trazabilidad?: { fuente: string; original: string; archivo: string;
    destinos: { archivo: string; criterio: string }[]; estado: "conservado" | "repartido" | "pendiente" | "propuesta" }[]
  referencias?: { archivo: string; texto: string; destino: string; sha256: string }[]
  citas?: { archivo: string; inicio: number; fin: number; fuente: string;
    inicio_fuente: number; fin_fuente: number; sha256: string }[]
}
export type ValidationReport = {
  perfil?: string
  errores: string[]
  alertas: string[]
  pendientes: string[]
  recuentos: { confirmados: number; propuestos: number; incidencias: number }
}
export class DeliverableValidationError extends Error {
  report: ValidationReport
  constructor(report: ValidationReport) {
    super("Validación mecánica rechazada: " + JSON.stringify(report))
    this.name = "DeliverableValidationError"
    this.report = report
  }
}

const sections = {
  historia: ["Actor, objetivo y valor", "Alcance y reglas funcionales", "Criterios de aceptación confirmados",
    "Propuestas de criterios — pendientes de confirmación", "Dependencias, decisiones y preguntas pendientes"],
  incidencias: ["Hallazgos y decisiones pendientes", "Trazabilidad al original"],
}
const ids = (text: string) => [...text.matchAll(/^\s*- (?:\*\*)?((?:CA|PC|INC)-[\p{L}\p{N}_-]+)\b/ugm)].map(match => match[1])

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex")
export function fragment(text: string, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length)
    throw new Error("Fragmento fuera del original (índices UTF-16, fin exclusivo)")
  return text.slice(start, end)
}
export function normalizeLiteral(text: string) {
  const plain = text.replace(/\r\n/g, "\n").replace(/^> ?/gm, "")
  return plain.startsWith("`") && plain.endsWith("`") && !plain.slice(1, -1).includes("`") ? plain.slice(1, -1) : plain
}

export function validateDeliverable(files: Record<string, string>, input?: ValidationInput,
  sources: Record<string, string> = {}): ValidationReport {
  const report: ValidationReport = { ...(input ? { perfil: input.perfil } : {}), errores: [], alertas: [],
    pendientes: [], recuentos: { confirmados: 0, propuestos: 0, incidencias: 0 } }
  if (!input) {
    report.pendientes.push("Sin perfil: validación mecánica no determinada; no implica aprobación")
    return report
  }
  if (input.perfil !== "historia-incidencias-v1") {
    report.errores.push("Perfil de validación desconocido")
    return report
  }
  if (!input.documentos.length || new Set(input.documentos.map(doc => doc.archivo)).size !== input.documentos.length)
    report.errores.push("Declara documentos únicos y no vacíos")
  for (const name of Object.keys(files)) if (!input.documentos.some(doc => doc.archivo === name))
    report.errores.push(`${name}: archivo sin tipo declarado en el perfil`)
  const declarations = new Map<string, Set<string>>()
  const evidence = new Map<string, { start: number; end: number }[]>()
  const storyIDs = new Set<string>()
  const originals = new Set<string>()
  for (const doc of input.documentos) {
    const raw = files[doc.archivo]
    if (raw === undefined) { report.errores.push(`${doc.archivo}: archivo declarado inexistente`); continue }
    if (!(doc.tipo in sections)) { report.errores.push(`${doc.archivo}: tipo desconocido`); continue }
    const blocks = doc.tipo === "historia" ? raw.split(/(?=^# )/m).filter(part => part.trim()) : [raw]
    const declared = new Set<string>()
    declarations.set(doc.archivo, declared)
    let offset = 0
    for (const block of blocks) {
      const text = block.replace(/\r\n/g, "\n")
      const kind = /^# Incidencias — /m.test(text) ? "incidencias" : doc.tipo
      const identity = text.match(/^# (\S+)/m)?.[1]
      if (kind === "historia" && identity) {
        if (storyIDs.has(identity)) report.errores.push(`${doc.archivo}: identidad duplicada ${identity}`)
        storyIDs.add(identity)
      }
      const start = raw.indexOf(block, offset), end = start + block.length
      offset = end
      if (kind === "incidencias") evidence.set(doc.archivo, [...evidence.get(doc.archivo) ?? [], { start, end }])
      const parts = text.split(/^## /m)
      const body = new Map(parts.slice(1).map(part => [part.split("\n")[0], part.slice(part.indexOf("\n") + 1)]))
      for (const heading of sections[kind]) {
        if (parts.filter(part => part.startsWith(heading + "\n")).length !== 1 || !body.get(heading)?.trim())
          report.errores.push(`${doc.archivo}: apartado obligatorio único y no vacío: ${heading}`)
      }
      const fields = kind === "historia" ? ["Identidad", "Versión y procedencia", "Estado"] : ["Entrega"]
      if (!/^# .+/m.test(text)) report.errores.push(`${doc.archivo}: título obligatorio`)
      for (const field of fields) if (!text.match(new RegExp(`^\\*\\*${field}:\\*\\* .+`, "m")))
        report.errores.push(`${doc.archivo}: campo obligatorio: ${field}`)
      if (kind === "historia") {
        for (const [heading, prefix] of [[sections.historia[2], "CA-"], [sections.historia[3], "PC-"]]) {
          const found = ids(body.get(heading) ?? "")
          for (const id of found) declared.add(`${identity}/${id}`)
          if (found.some(id => !id.startsWith(prefix))) report.errores.push(`${doc.archivo}: espacio de IDs incorrecto en ${heading}`)
          report.recuentos[prefix === "CA-" ? "confirmados" : "propuestos"] += new Set(found.filter(id => id.startsWith(prefix))).size
        }
      } else {
        const found = ids(body.get(sections.incidencias[0]) ?? "").filter(id => id.startsWith("INC-"))
        report.recuentos.incidencias += new Set(found).size
      }
      const all = ids(kind === "historia" ? [body.get(sections.historia[2]), body.get(sections.historia[3])].join("\n") : body.get(sections.incidencias[0]) ?? "")
      if (new Set(all).size !== all.length) report.errores.push(`${doc.archivo}: IDs duplicados en ${identity}`)
    }
  }
  const sourceIDs = new Set<string>()
  for (const source of input.fuentes ?? []) {
    if (sourceIDs.has(source.id)) report.errores.push(`Fuente duplicada: ${source.id}`)
    sourceIDs.add(source.id)
    const text = sources[source.id]
    if (text === undefined) report.pendientes.push(`${source.id}: fuente vinculada no disponible`)
    else if (contentHash(text) !== source.sha256) report.errores.push(`${source.id}: hash/versión de fuente incorrecto`)
    for (const criterion of source.criterios) {
      const key = `${source.id}/${criterion.id}`
      if (originals.has(key)) report.errores.push(`${key}: ID original duplicado`)
      originals.add(key)
      if (text !== undefined) try { fragment(text, criterion.inicio, criterion.fin) } catch (error) { report.errores.push(`${key}: ${(error as Error).message}`) }
      const rows = (input.trazabilidad ?? []).filter(row => row.fuente === source.id && row.original === criterion.id)
      if (rows.length !== 1) report.errores.push(`${key}: requiere una trazabilidad única, incluso pendiente o repartida`)
    }
  }
  for (const row of input.trazabilidad ?? []) {
    if (!originals.has(`${row.fuente}/${row.original}`)) report.errores.push(`${row.original}: original no vinculado`)
    if (!evidence.has(row.archivo))
      report.errores.push(`${row.original}: la trazabilidad pertenece al archivo de incidencias`)
    const table = (evidence.get(row.archivo) ?? []).map(range => files[row.archivo].slice(range.start, range.end)).join("\n")
      .split(/\r?\n/).filter(line => /^\|/.test(line))
      .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()))
      .filter(cells => cells[0]?.match(new RegExp(`^${row.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|:)`)))
    if (table.length !== 1 || !table[0][0].includes(row.fuente) || !table[0][2]?.includes(row.estado))
      report.errores.push(`${row.original}: tabla de trazabilidad ausente o inconsistente`)
    if (!row.destinos.length && !["pendiente", "propuesta"].includes(row.estado))
      report.errores.push(`${row.original}: criterio sin destino ni estado pendiente explícito`)
    for (const dest of row.destinos) {
      if (!declarations.get(dest.archivo)?.has(dest.criterio)) report.errores.push(`${row.original}: destino inexistente ${dest.archivo}/${dest.criterio}`)
      if (!table[0]?.[1]?.includes(dest.criterio)) report.errores.push(`${row.original}: destino no reflejado en incidencias ${dest.criterio}`)
    }
  }
  for (const ref of input.referencias ?? []) {
    if (!files[ref.archivo]?.includes(ref.texto) || !ref.texto.includes(ref.destino)) report.errores.push(`${ref.archivo}: referencia textual no verificable`)
    if (files[ref.destino] === undefined || contentHash(files[ref.destino]) !== ref.sha256)
      report.errores.push(`${ref.archivo}: archivo/versión referenciado incorrecto ${ref.destino}`)
  }
  for (const cite of input.citas ?? []) {
    if (!sourceIDs.has(cite.fuente)) { report.errores.push(`${cite.fuente}: cita sin vínculo de fuente`); continue }
    if (!evidence.get(cite.archivo)?.some(range => cite.inicio >= range.start && cite.fin <= range.end))
      report.errores.push(`${cite.archivo}: la evidencia literal pertenece a incidencias`)
    const source = sources[cite.fuente]
    if (source === undefined) { report.pendientes.push(`${cite.archivo}: cita sin fuente disponible`); continue }
    try {
      const original = fragment(source, cite.inicio_fuente, cite.fin_fuente)
      const quoted = fragment(files[cite.archivo] ?? "", cite.inicio, cite.fin)
      if (contentHash(original) !== cite.sha256) report.errores.push(`${cite.archivo}: hash del fragmento fuente incorrecto`)
      if (normalizeLiteral(original) !== normalizeLiteral(quoted)) report.errores.push(`${cite.archivo}: cita literal distinta del fragmento fuente`)
    } catch (error) { report.errores.push(`${cite.archivo}: ${(error as Error).message}`) }
  }
  for (const [name, text] of Object.entries(files)) for (const id of new Set(text.match(/\bOR-\d+\b/g) ?? [])) {
    if (!originals.size || ![...originals].some(key => key.endsWith(`/${id}`)))
      report.alertas.push(`${name}: referencia inconsistente a ${id}; cotejo semántico pendiente del Revisor`)
  }
  if (!input.fuentes?.length) report.pendientes.push("Cobertura original no comprobada: faltan fuentes vinculadas")
  if (!input.referencias?.length) report.pendientes.push("Referencias a archivos/versión no vinculadas")
  if (!input.citas?.length) report.pendientes.push("Cotejo literal no realizado: citas no vinculadas")
  report.pendientes.push("Suficiencia de fuentes y validación semántica/aprobación corresponden al Revisor")
  return report
}
