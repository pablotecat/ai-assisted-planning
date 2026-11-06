import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { captureSource, publishSession, sessionWork, type Identity } from "../tools/session_store.ts"
import { contentHash, DeliverableValidationError } from "../tools/deliverable_validation.ts"
import { completeFiles, completeValidation, incidents, linkedFiles, original, story } from "../test-support/deliverable-fixture.ts"

const globals = "# Incidencias — globales\n\n**Entrega:** v1\n\n## Hallazgos y decisiones pendientes\n- Ninguna identificada\n\n## Trazabilidad al original\n| Criterio original y fuente | Destino (historia/criterio) | Estado y cambio justificado |\n|---|---|---|\n"

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/transforms-"))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const nodes: Record<string, Identity> = {
    p: { id: "p", agent: "planificador", title: "Historia", created: 1, directory: dir },
    r: { id: "r", agent: "refinador", parentID: "p", title: "borrador", created: 2, directory: dir },
  }
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string): Promise<Identity> => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  const act = (id: string) => ({ sessionID: id, agent: nodes[id].agent })
  const work: any = await sessionWork({ action: "create", pregunta: "Saldo", criterios: ["OR-1", "OR-2"], corpus: "fixture", referencia: "v1" }, act("p"), options)
  const snap: any = await captureSource({ encargo_id: work.encargo.id, corpus: "fixture", referencia: "v1", fuente: "taller ficticio",
    operacion_id: "captura", resultado: original }, act("p"), options)
  const profile = { ...completeValidation, fuentes: [{ ...completeValidation.fuentes![0], instantanea_id: snap.instantanea_id }] }
  const delivery = (files: any, validation: any, operationID: string) => publishSession({ ...act("p"), topic: "H1", group: "entrega",
    publicationType: "write_planning_deliverables", workID: work.encargo.id, operationID, files, validation }, options)
  const v1: any = await delivery(completeFiles, profile, "v1")
  assert.ok(v1.guardado && !v1.validacion.errores.length)
  const origin = (publication: any, name: string, extra: object = {}) => {
    const file = publication.archivos.find((entry: any) => entry.path.endsWith(name) || entry.path === name)
    return { artefacto_id: publication.artefacto_id, archivo: file.path, sha256: file.sha256, ...extra }
  }
  const state = async () => JSON.parse(await readFile(join(options.root, ".control", createHash("sha256").update(dir + "\0p").digest("hex"), "state.json"), "utf8"))
  const publish = (files: any, operationID: string, topic = "borrador") => publishSession({ ...act("p"), topic,
    workID: work.encargo.id, operationID, files }, options)
  return { dir, options, act, nodes, v1, profile, delivery, origin, state, publish }
}

test("S11 11.1 sustituciones exactas: coincidencia esperada, cero/múltiples, hash y encadenamiento sobre copia", async t => {
  const f = await fixture(t)
  const changed = completeFiles["H1.md"].replace("conocer", "comprobar")
  const profileFor = (text: string) => ({ ...f.profile, referencias: [{ archivo: "H1-incidencias.md", texto: "H1.md", destino: "H1.md", sha256: contentHash(text) }] })
  const promote = (transformaciones: any, operationID: string, text: string) => f.delivery({
    "H1.md": f.origin(f.v1, "H1.md", { transformaciones }),
    "H1-incidencias.md": f.origin(f.v1, "H1-incidencias.md"),
  }, profileFor(text), operationID)
  // Una palabra corregida: nueva versión completa con todos los archivos restantes.
  const v2: any = await promote([{ anterior: "conocer", nuevo: "comprobar", coincidencias: 1 }], "v2", changed)
  assert.ok(v2.guardado)
  assert.equal(await readFile(v2.rutas["H1.md"], "utf8"), changed)
  assert.deepEqual(await readFile(v2.rutas["H1-incidencias.md"]), await readFile(f.v1.rutas["H1-incidencias.md"]))
  assert.equal(await readFile(f.v1.rutas["H1.md"], "utf8"), completeFiles["H1.md"], "El origen queda intacto")
  assert.deepEqual(await promote([{ anterior: "conocer", nuevo: "comprobar", coincidencias: 1 }], "v2", changed), v2, "Reintento idempotente")
  assert.equal((await f.state()).artifacts[v2.artefacto_id].origin.files["H1.md"].transformaciones.length, 1, "Procedencia del origen con sustitución")
  // Cero o múltiples coincidencias frente a la esperada: rechazo íntegro.
  const before = await f.state()
  const inventory = await readdir(f.v1.sesion, { recursive: true })
  await assert.rejects(promote([{ anterior: "palabraAusente", nuevo: "x", coincidencias: 1 }], "cero", changed), /Sustitución ambigua/)
  await assert.rejects(promote([{ anterior: "titular", nuevo: "cliente", coincidencias: 1 }], "multiples", changed), /coincidencias/)
  await assert.rejects(f.delivery({ "H1.md": f.origin(f.v1, "H1.md", { sha256: "0".repeat(64), transformaciones: [{ anterior: "conocer", nuevo: "x", coincidencias: 1 }] }),
    "H1-incidencias.md": f.origin(f.v1, "H1-incidencias.md") }, profileFor(changed), "hash"), /Hash de origen incorrecto/)
  assert.deepEqual(await f.state(), before, "Sin reserva ni entrega parcial")
  assert.deepEqual(await readdir(f.v1.sesion, { recursive: true }), inventory)
  // Encadenamiento determinista sobre una copia del origen: cada versión conserva su texto.
  const chained = changed.replace("comprobar", "verificar")
  const v3: any = await promote([{ anterior: "conocer", nuevo: "comprobar", coincidencias: 1 },
    { anterior: "comprobar", nuevo: "verificar", coincidencias: 1 }], "cadena", chained)
  assert.ok(v3.guardado && (await readFile(v3.rutas["H1.md"], "utf8")).includes("verificar"))
  assert.equal(await readFile(f.v1.rutas["H1.md"], "utf8"), completeFiles["H1.md"])
  assert.equal(await readFile(v2.rutas["H1.md"], "utf8"), changed)
  await assert.rejects(promote([{ anterior: "conocer", nuevo: "x", coincidencias: 1 }], "cadena", chained), /reutilizada con contenido distinto/)
})

test("S11 11.2–11.4 extracción única, validación de la entrega completa, versiones con revisión pendiente", async t => {
  const f = await fixture(t)
  const draft = story + linkedFiles["H1-incidencias.md"]
  const refiner: any = await f.publish({ "borrador.md": draft }, "contenedor")
  assert.ok(refiner.guardado)
  const fromDraft = (extra: object) => f.origin(refiner, "borrador.md", extra)
  const documents = [{ archivo: "H1.md", tipo: "historia" }, { archivo: "H1-incidencias.md", tipo: "incidencias" },
    { archivo: "incidencias-globales.md", tipo: "incidencias" }]
  const extractArgs = (contenido: object, incidencias: object, operationID: string) => f.delivery({
    "H1.md": contenido, "H1-incidencias.md": incidencias, "incidencias-globales.md": globals,
  }, { ...f.profile, documentos: documents, referencias: undefined, citas: undefined }, operationID)
  // Extracción con delimitación exacta y única; el original no cambia.
  const extracted: any = await extractArgs(fromDraft({ extraccion: { encabezado: "H1 — Consultar saldo" } }),
    fromDraft({ extraccion: { encabezado: "Incidencias — H1" } }), "extraida")
  assert.ok(extracted.guardado && !extracted.validacion.errores.length)
  assert.deepEqual(await readFile(extracted.rutas["H1.md"], "utf8"), story.replace(/\r\n/g, "\n"))
  assert.deepEqual(await readFile(refiner.rutas["borrador.md"], "utf8"), draft)
  // Sección inexistente, duplicada y versión distinta: sin selección heurística.
  const before = await f.state()
  await assert.rejects(extractArgs(fromDraft({ extraccion: { encabezado: "H99 — Inexistente" } }),
    fromDraft({ extraccion: { encabezado: "Incidencias — H1" } }), "inesistente"), /delimitación única/)
  assert.deepEqual(await f.state(), before)
  const duplicate: any = await f.publish({ "borrador-duplicado.md": story + story }, "duplicado")
  const beforeRejections = await f.state()
  await assert.rejects(f.delivery({ "H1.md": f.origin(duplicate, "borrador-duplicado.md", { extraccion: { encabezado: "H1 — Consultar saldo" } }),
    "H1-incidencias.md": fromDraft({ extraccion: { encabezado: "Incidencias — H1" } }),
    "incidencias-globales.md": globals }, { perfil: "historia-incidencias-v1", documentos: [documents[0]] } as never, "duplicada"), /delimitación única/)
  await assert.rejects(extractArgs({ ...fromDraft({}), sha256: "0".repeat(64), extraccion: { encabezado: "H1 — Consultar saldo" } },
    fromDraft({ extraccion: { encabezado: "Incidencias — H1" } }), "version"), /Hash de origen incorrecto/)
  assert.deepEqual(await f.state(), beforeRejections, "Ningún rechazo deja entrega parcial")
  // 11.3: la transformación se valida en memoria; romper IDs o citas rechaza todo antes del commit.
  await assert.rejects(f.delivery({ "H1.md": fromDraft({ extraccion: { encabezado: "H1 — Consultar saldo" },
      transformaciones: [{ anterior: "CA-1", nuevo: "CA-9", coincidencias: 1 }] }),
    "H1-incidencias.md": fromDraft({ extraccion: { encabezado: "Incidencias — H1" } }), "incidencias-globales.md": globals },
    { ...f.profile, documentos: documents, referencias: undefined, citas: undefined }, "rompe-ids"),
    (error: any) => { assert.ok(error instanceof DeliverableValidationError); assert.ok(error.report.errores.some((e: string) => e.includes("destino inexistente"))); return true })
  await assert.rejects(f.delivery({ "H1.md": f.origin(f.v1, "H1.md"), "H1-incidencias.md": f.origin(f.v1, "H1-incidencias.md",
      { transformaciones: [{ anterior: "eliminaran", nuevo: "eliminararan", coincidencias: 1 }] }) }, f.profile, "rompe-cita"),
    (error: any) => { assert.ok(error instanceof DeliverableValidationError); assert.ok(error.report.errores.some((e: string) => e.includes("cita literal distinta"))); return true })
  assert.deepEqual(await f.state(), beforeRejections, "Sin cambios tras rechazos totales")
  // 11.4: nueva corrección deliberada como otra versión completa con revisión propia pendiente.
  const deliberateInput = {
    "H1.md": f.origin(f.v1, "H1.md", { transformaciones: [{ anterior: "titular", nuevo: "cliente", coincidencias: 3 }] }),
    "H1-incidencias.md": f.origin(f.v1, "H1-incidencias.md"),
  }
  const deliberateProfile = { ...f.profile, referencias: [{ archivo: "H1-incidencias.md", texto: "H1.md", destino: "H1.md",
    sha256: contentHash(completeFiles["H1.md"].replaceAll("titular", "cliente")) }] }
  const deliberate: any = await f.delivery(deliberateInput, deliberateProfile, "correccion")
  assert.ok(deliberate.guardado)
  assert.equal((await readFile(deliberate.rutas["H1.md"], "utf8")).match(/cliente/g)?.length, 3)
  assert.deepEqual(await readFile(f.v1.rutas["H1.md"], "utf8"), completeFiles["H1.md"], "La versión anterior queda intacta")
  const state = await f.state()
  const version = Object.values<any>(state.versions).find(version => version.type === "write_planning_deliverables" && version.workID)
  assert.equal(version.published, deliberate.artefacto_id)
  assert.equal(version.reviewed, undefined, "La versión nueva no hereda revisión")
  assert.equal(version.approved, undefined)
  assert.deepEqual(await f.delivery(deliberateInput, deliberateProfile, "correccion"), deliberate)
})
