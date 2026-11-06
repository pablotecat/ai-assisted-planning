import assert from "node:assert/strict"
import test from "node:test"
import { contentHash, validateDeliverable } from "../tools/deliverable_validation.ts"
import { files, story, validation, linked, linkedFiles, sources, original } from "../test-support/deliverable-fixture.ts"

test("S10 10.1 perfil explícito: apartados vigentes, IDs separados y documentos genéricos sin reinterpretar", () => {
  const valid = validateDeliverable(files, validation)
  assert.deepEqual(valid.errores, [])
  assert.deepEqual(valid.recuentos, { confirmados: 1, propuestos: 1, incidencias: 1 })
  for (const heading of ["Actor, objetivo y valor", "Alcance y reglas funcionales", "Criterios de aceptación confirmados",
    "Propuestas de criterios — pendientes de confirmación", "Dependencias, decisiones y preguntas pendientes"])
    assert.ok(validateDeliverable({ ...files, "H1.md": story.replace(`## ${heading}`, "## Otro") }, validation).errores.some(e => e.includes(heading)))
  for (const [before, after] of [["CA-1", "PC-2"], ["PC-1", "CA-2"]])
    assert.ok(validateDeliverable({ ...files, "H1.md": story.replace(before, after) }, validation).errores.some(e => e.includes("espacio de IDs")))
  assert.ok(validateDeliverable(files).pendientes.some(e => e.includes("Sin perfil")))
  assert.deepEqual(validateDeliverable({ "nota.md": "Documento anterior" }).errores, [])
  assert.ok(validateDeliverable(files, { ...validation, perfil: "otro" } as never).errores.length)
})

test("S10 10.3 cotejo literal por fragmento/hash: erratas originales, palabras distintas y solo formato D10", () => {
  const check = (quote: string, sha256?: string, source = original) => {
    const text = linkedFiles["H1-incidencias.md"] + "\n" + quote
    return validateDeliverable({ ...linkedFiles, "H1-incidencias.md": text }, { ...linked,
      fuentes: [{ ...linked.fuentes![0], sha256: contentHash(source), criterios: [] }], trazabilidad: [], citas: [{
        archivo: "H1-incidencias.md", inicio: text.length - quote.length, fin: text.length, fuente: "taller ficticio",
        inicio_fuente: 0, fin_fuente: source.length, sha256: sha256 ?? contentHash(source),
      }] }, { "taller ficticio": source })
  }
  assert.deepEqual(check(original).errores, [])
  assert.deepEqual(check(original.replaceAll("\r\n", "\n").split("\n").map(line => "> " + line).join("\n")).errores, [])
  assert.deepEqual(check("`presevar`", undefined, "presevar").errores, [])
  for (const altered of [original.replace("eliminaran", "eliminararan"), original.replace("distintos de", "diferentes de"),
    original.replace("presevar", "preservar"), original.replace("saldo;", "saldo:"), original.replace("saldo", "sáldo")])
    assert.ok(check(altered).errores.some(e => e.includes("cita literal distinta")), altered)
  assert.ok(check(original, "0".repeat(64)).errores.some(e => e.includes("hash del fragmento")))
  assert.ok(validateDeliverable(linkedFiles, linked).pendientes.some(e => e.includes("no disponible")))
})

test("S10 10.2 cobertura original, IDs únicos, pendientes/repartidos, archivos/versión y nueve incidencias", () => {
  assert.deepEqual(validateDeliverable(linkedFiles, linked, sources).errores, [])
  const nine = { ...linkedFiles, "H1-incidencias.md": linkedFiles["H1-incidencias.md"].replace("## Trazabilidad", Array.from({ length: 8 }, (_, n) => `- **INC-${n + 2}**: pendiente`).join("\n") + "\n\n## Trazabilidad") }
  assert.equal(validateDeliverable(nine, linked, sources).recuentos.incidencias, 9)
  assert.ok(validateDeliverable({ ...linkedFiles, "H1.md": story.replace("## Propuestas", "- **CA-1 — Duplicado**\n\n## Propuestas") }, linked, sources).errores.some(e => e.includes("duplicados")))
  assert.ok(validateDeliverable(linkedFiles, { ...linked, trazabilidad: linked.trazabilidad!.slice(0, 1) }, sources).errores.some(e => e.includes("trazabilidad única")))
  const distributed = structuredClone(linked)
  distributed.documentos.push({ archivo: "H2.md", tipo: "historia" })
  distributed.trazabilidad![0].destinos.push({ archivo: "H2.md", criterio: "H2/CA-1" })
  distributed.trazabilidad![0].estado = "repartido"
  const split = { ...linkedFiles, "H2.md": story.replaceAll("H1", "H2"), "H1-incidencias.md": linkedFiles["H1-incidencias.md"].replace("H1/CA-1 | conservado", "H1/CA-1, H2/CA-1 | repartido") }
  assert.deepEqual(validateDeliverable(split, distributed, sources).errores, [])
  assert.ok(validateDeliverable({ ...split, "H2.md": story.replaceAll("CA-1", "CA-2") }, distributed, sources).errores.some(e => e.includes("destino inexistente")))
  const refs = { ...linked, referencias: [{ archivo: "H1-incidencias.md", texto: "H1.md", destino: "H1.md", sha256: contentHash(story) }] }
  const withRef = { ...linkedFiles, "H1-incidencias.md": linkedFiles["H1-incidencias.md"] + "\nVersión cotejada: H1.md; duda OR-13.\n" }
  assert.deepEqual(validateDeliverable(withRef, refs, sources).errores, [])
  assert.ok(validateDeliverable(withRef, refs, sources).alertas.some(e => e.includes("OR-13")))
  assert.ok(validateDeliverable({ ...withRef, "H1.md": story + "\nCambió" }, refs, sources).errores.some(e => e.includes("versión referenciado")))
  assert.ok(validateDeliverable(linkedFiles, linked, { "taller ficticio": "Otra versión" }).errores.some(e => e.includes("hash/versión")))
  const draft = { "borrador.md": story + "\n" + story.replaceAll("H1", "H2") }
  assert.deepEqual(validateDeliverable(draft, { perfil: "historia-incidencias-v1", documentos: [{ archivo: "borrador.md", tipo: "historia" }] }).errores, [])
})
