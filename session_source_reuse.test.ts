import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test, { type TestContext } from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { captureSource, publishReview, publishSession, sessionArtifacts, sessionWork, type Identity } from "./tools/session_store.ts"
import { prepareConsumer, evidenceWriter, loadStates } from "./test-support/evidence-model/verify-model.mjs"
import { nativeWait, privateRequest } from "./test-support/delegation/verify-model.mjs"
import { probe, probePlugin, withServer } from "./test-support/opencode.mjs"
import { startReuseFlow, corpus as reuseCorpus, referencia as reuseReferencia } from "./test-support/source-reuse/index.ts"

const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
const base = { title: "Encargo", created: 1, directory: "proyecto" }

// Deterministic local fixture: tree identity, one control per root, no models.
async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "source-reuse-"))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const nodes: Record<string, Identity> = {}
  for (const [id, agent, parentID] of [["p", "planificador"], ["r", "refinador", "p"], ["sibling", "refinador", "p"],
    ["i", "investigador", "r"], ["i2", "investigador", "r"], ["replacement", "investigador", "r"],
    ["code", "lector-codigo", "i"], ["docs", "lector-documentacion", "i"], ["review", "revisor", "i"],
    ["otherReview", "revisor", "i"], ["foreign", "investigador"]])
    nodes[id] = { ...base, id, agent, directory: dir, ...(parentID ? { parentID } : {}) }
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string, messageID?: string) => {
      if (!nodes[id]) throw new Error("Sesión real desconocida")
      if (messageID && messageID !== `msg-${id}`) throw new Error("Mensaje no atribuible")
      return nodes[id]
    } }
  await readAgentSettings(options.settingsPath)
  const actor = (id: string) => ({ sessionID: id, messageID: `msg-${id}`, agent: nodes[id].agent })
  const work = (id: string, input: any) => sessionWork(input, actor(id), options) as Promise<any>
  const create = async (id: string, extra: object = {}) => (await work(id, { action: "create",
    pregunta: "¿Qué está verificado?", criterios: ["CA-1"], corpus: "corpus-autorizado", referencia: "ref-v1", ...extra })).encargo
  const capture = (id: string, input: any) => captureSource(input, actor(id), options) as Promise<any>
  const call = (id: string, input: object) => sessionArtifacts(input as never, actor(id), options) as Promise<any>
  const list = (id: string, encargo_id: string, extra: object = {}) =>
    call(id, { action: "list", encargo_id, corpus: "corpus-autorizado", referencia: "ref-v1", ...extra })
  const read = (id: string, encargo_id: string, artefacto_id: string, archivo: string, extra: object = {}) =>
    call(id, { action: "read", encargo_id, corpus: "corpus-autorizado", referencia: "ref-v1", artefacto_id, archivo, ...extra })
  const share = (id: string, encargo_id: string, origen_encargo_id: string, instantanea_id: string, extra: object = {}) =>
    call(id, { action: "share", encargo_id, corpus: "corpus-autorizado", referencia: "ref-v1", origen_encargo_id, instantanea_id, ...extra })
  const statePath = (id = "p") => join(options.root, ".control", createHash("sha256").update(dir + "\0" + id).digest("hex"), "state.json")
  const state = async () => JSON.parse(await readFile(statePath(), "utf8"))
  const blob = async (sha256: string) => readFile(join(dirname(statePath()), "snapshots", sha256))
  const snapshotCount = async () => Object.keys((await state()).snapshots).length
  return { dir, nodes, options, actor, work, create, capture, call, list, read, share, state, blob, snapshotCount }
}

//// S08 8.4 — bounded snapshot inventory before recovering or delegating. ////

test("S08 8.4 inventario: instantáneas del encargo con cobertura declarada, cursor compartido y aislamiento", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i", pregunta: "Pregunta A" })
  const published = await publishSession({ ...f.actor("i"), topic: "resultado", files: { "resultado.md": "Conclusión" },
    operationID: "pub-1", publicationType: "publish_agent_deliverable", workID: w.id }, f.options)
  assert.ok(published.guardado)
  const complete = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-1", resultado: '{"key":"APP-1"}',
    version: { tipo: "hash", valor: "v1" }, paginas: { recuperadas: [1], pendientes: [], total: 1 },
    campos: { recuperados: ["summary"], pendientes: [] } })
  await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-2", operacion_id: "cap-2", resultado: "Parcial", pendientes: ["pagina-2"] })
  const list = await f.list("i", w.id)
  assert.equal(list.instantaneas.length, 2)
  assert.equal(list.artefactos.length, 1, "El contrato de artefactos del inventario se conserva")
  for (const entry of list.instantaneas) {
    assert.match(entry.id, /^snap-/)
    assert.equal(entry.corpus, "corpus-autorizado")
    assert.equal(entry.referencia, "ref-v1")
    assert.deepEqual(entry.productor, { sesion: "i", agente: "investigador", mensaje: "msg-i" },
      "El productor es una identidad declarada y verificable, no una ruta")
    assert.ok(/^[a-f0-9]{64}$/.test(entry.contenido.sha256))
    // Vigencia no se decide por fecha ni se computa nada parecido a un estado global.
    for (const key of ["vigente", "vigencia", "obsoleta", "completa"]) assert.ok(!(key in entry))
  }
  const app1 = list.instantaneas.find((entry: any) => entry.fuente === "APP-1")!
  const app2 = list.instantaneas.find((entry: any) => entry.fuente === "APP-2")!
  assert.deepEqual(app1.cobertura_paginas, { recuperadas: [1], pendientes: [], total: 1 })
  assert.deepEqual(app1.cobertura_campos, { recuperados: ["summary"], pendientes: [] })
  assert.equal(app1.version.valor, "v1")
  assert.equal(app1.contenido.sha256, complete.contenido.sha256)
  assert.deepEqual(app2.pendientes, ["pagina-2"])
  assert.equal(app2.cobertura_paginas, undefined, "La cobertura no se declara si no se obtuvo")
  // Cursor compartido entre artefactos e instantáneas, hasta null.
  const firstPage = await f.list("i", w.id, { limite: 1 })
  assert.equal(firstPage.instantaneas.length, 1)
  assert.ok(firstPage.cursor)
  const secondPage = await f.list("i", w.id, { limite: 1, cursor: firstPage.cursor })
  assert.equal(secondPage.artefactos.length, 0)
  assert.equal(secondPage.instantaneas.length, 1)
  assert.equal(secondPage.cursor, null)
  await assert.rejects(f.list("i", w.id, { limite: 1, cursor: firstPage.cursor, corpus: "otro" }), /Corpus/)
  // Aislamiento por encargo: otra pregunta del mismo coordinador empieza vacía.
  const other = await f.create("r", { responsable_session_id: "i2", pregunta: "Pregunta B" })
  const otherList = await f.list("r", other.id)
  assert.deepEqual(otherList.instantaneas, [])
  await assert.rejects(f.list("sibling", w.id), /no asignado/)
  await assert.rejects(f.list("foreign", w.id), /no asignado|ENOENT/)
})

test("S08 8.4 reutilización: dos preguntas con recorrido común usan la instantánea vigente sin repetir recuperación", async t => {
  const f = await fixture(t)
  const original = "Original íntegro de APP-1\r\nlínea 2 con mención"
  // Una sesión admite varios encargos: el investigador plantea sus dos preguntas.
  const q1 = await f.create("i", { pregunta: "Pregunta A sobre APP-1" })
  const captured = await f.capture("i", { encargo_id: q1.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-a1", resultado: original,
    version: { tipo: "hash", valor: "aaa" }, paginas: { recuperadas: [1], pendientes: [], total: 1 } })
  const q2 = await f.create("i", { pregunta: "Pregunta B sobre el mismo APP-1" })
  // Búsqueda antes de recuperar: el inventario del encargo anterior muestra la
  // fuente con versión y cobertura completas, contraste pregunta/criterios.
  const candidate = (await f.list("i", q1.id)).instantaneas.find((entry: any) => entry.fuente === "APP-1")
  assert.ok(candidate, "La instantánea de la primera pregunta aparece en el inventario")
  assert.deepEqual(candidate.cobertura_paginas, { recuperadas: [1], pendientes: [], total: 1 })
  assert.equal(candidate.pendientes, undefined)
  // Reutilización: la segunda pregunta lee el mismo original, sin nueva captura.
  const reused = await f.read("i", q1.id, captured.instantanea_id, captured.archivo)
  assert.equal(reused.instantanea, true)
  assert.equal(reused.contenido, original)
  assert.deepEqual(reused.cobertura_paginas, { recuperadas: [1], pendientes: [], total: 1 },
    "El read acarrea la cobertura declarada para el contraste, distinta de un recibo nativo")
  // Resultado propio y pendientes propios de cada pregunta.
  await f.work("i", { action: "record", encargo_id: q1.id, resultado: "Pregunta A respondida",
    pendientes: [], siguiente_accion: "Cerrada", fuentes: ["APP-1"], decisiones: ["Original capturado"], suficiencia: "completo" })
  await f.work("i", { action: "record", encargo_id: q2.id, resultado: "Pregunta B respondida reutilizando APP-1",
    pendientes: ["APP-3"], siguiente_accion: "Resolver APP-3", fuentes: ["APP-1"],
    decisiones: ["Reutilización sin lectura remota adicional"], suficiencia: "parcial" })
  const works = (await f.state()).work
  const first = works[q1.id], second = works[q2.id]
  assert.notEqual(first.id, second.id)
  assert.deepEqual(first.events.at(-1).pendientes, [])
  assert.deepEqual(second.events.at(-1).pendientes, ["APP-3"], "Los pendientes no se comparten entre preguntas")
  // Recuperación evitada, observada localmente: sigue habiendo exactamente una instantánea.
  assert.equal(await f.snapshotCount(), 1)
  assert.equal((await f.blob(captured.contenido.sha256)).toString("utf8"), original)
})

test("S08 8.4 share: vínculo mínimo entre encargos del mismo corpus/referencia sin ampliar la audiencia por rol", async t => {
  const f = await fixture(t)
  const q1 = await f.create("r", { responsable_session_id: "i", pregunta: "Pregunta A" })
  const q2 = await f.create("r", { responsable_session_id: "i2", pregunta: "Pregunta B" })
  const captured = await f.capture("i", { encargo_id: q1.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-share", resultado: '{"key":"APP-1","fields":{"summary":"s"}}' })
  // Sin vínculo, el responsable de la segunda pregunta no puede leer por su encargo.
  await assert.rejects(f.read("i2", q2.id, captured.instantanea_id, captured.archivo), /no asignado o no registrado/)
  // Solo quien gestiona ambos encargos establece el vínculo; el responsable ajeno
  // es rechazado antes, fail-closed, porque no ve el encargo de origen.
  await assert.rejects(f.share("i2", q2.id, q1.id, captured.instantanea_id), /no asignado/,
    "Un responsable que no ve el encargo de origen no puede compartir desde él")
  await assert.rejects(f.share("i", q2.id, q1.id, captured.instantanea_id), /no asignado/,
    "El responsable del origen tampoco comparte hacia un encargo que no gestiona")
  const shared = await f.share("r", q2.id, q1.id, captured.instantanea_id)
  assert.equal(shared.guardado, true)
  assert.equal(shared.origen_encargo_id, q1.id)
  assert.equal(shared.instantanea_id, captured.instantanea_id)
  // Idempotente: repetir el vínculo no duplica ni falla.
  const again = await f.share("r", q2.id, q1.id, captured.instantanea_id)
  assert.equal(again.ya_compartida, true)
  // El responsable de la segunda pregunta lee el mismo original por su encargo.
  const read = await f.read("i2", q2.id, captured.instantanea_id, captured.archivo)
  assert.equal(read.instantanea, true)
  assert.equal(read.contenido, '{"key":"APP-1","fields":{"summary":"s"}}')
  const view = await f.read("i2", q2.id, captured.instantanea_id, captured.archivo, { vista: "linea" })
  assert.deepEqual(view.lineas, [{ numero: 1, contenido: '{"key":"APP-1","fields":{"summary":"s"}}' }])
  // El inventario de destino incluye la compartida; el de origen declara el vínculo.
  const listQ2 = await f.list("i2", q2.id)
  assert.deepEqual(listQ2.instantaneas.map((entry: any) => entry.fuente), ["APP-1"])
  assert.deepEqual(listQ2.instantaneas[0].compartida_con, [q2.id])
  const listQ1 = await f.list("i", q1.id)
  assert.deepEqual(listQ1.instantaneas[0].compartida_con, [q2.id])
  // Corpus/referencia incompatibles con el original no reciben el vínculo.
  const q3 = await f.create("r", { responsable_session_id: "i2", corpus: "otro-corpus", referencia: "ref-v1", pregunta: "C" })
  await assert.rejects(f.share("r", q3.id, q1.id, captured.instantanea_id, { corpus: "otro-corpus" }), /incompatibles/)
  const q4 = await f.create("r", { responsable_session_id: "i2", corpus: "corpus-autorizado", referencia: "otra-ref", pregunta: "D" })
  await assert.rejects(f.share("r", q4.id, q1.id, captured.instantanea_id, { referencia: "otra-ref" }), /incompatibles/)
  // La instantánea propia del encargo no se "comparte" a sí misma.
  await assert.rejects(f.share("r", q1.id, q1.id, captured.instantanea_id), /ya pertenece/)
  // Un hermano del coordinador sigue sin ver el encargo destino.
  await assert.rejects(f.list("sibling", q2.id), /no asignado/)
  // Fuentes crudas del lector: el vínculo no las abre al Investigador.
  const readerWork = await f.create("i", { padre_id: q1.id, responsable_session_id: "code" })
  const raw = await f.capture("code", { encargo_id: readerWork.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "codigo/datos.ts", operacion_id: "cap-raw", resultado: "export const raw = 1" })
  await f.share("r", q2.id, readerWork.id, raw.instantanea_id) // r gestiona q2 y, vía el padre q1, el subencargo del lector
  await assert.rejects(f.read("i2", q2.id, raw.instantanea_id, raw.archivo), /no asignado o no registrado/,
    "El Investigador no adquiere fuentes crudas del lector por un vínculo entre encargos")
  await assert.rejects(f.read("i", q1.id, raw.instantanea_id, raw.archivo), /no asignado o no registrado/)
})

test("S08 8.4 alcance y versión: recuperar solo la diferencia añade instantáneas y conserva la anterior intacta", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const base = { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1", fuente: "APP-1" }
  const first = await f.capture("i", { ...base, operacion_id: "cap-v1", resultado: "Página 1",
    version: { tipo: "hash", valor: "aaa" }, paginas: { recuperadas: [1], pendientes: [2, 3], total: 3 } })
  // El inventario declara el componente pendiente: la nueva pregunta exige página 2.
  const pending = (await f.list("i", w.id)).instantaneas.find((entry: any) => entry.fuente === "APP-1")
  assert.deepEqual(pending.cobertura_paginas, { recuperadas: [1], pendientes: [2, 3], total: 3 })
  const second = await f.capture("i", { ...base, operacion_id: "cap-v2-dif", resultado: "Página 2",
    version: { tipo: "hash", valor: "aaa" }, paginas: { recuperadas: [2], pendientes: [3], total: 3 } })
  assert.notEqual(second.instantanea_id, first.instantanea_id)
  assert.equal(second.aviso_version, undefined, "Misma versión: la recuperación de la diferencia no es un cambio de fuente")
  assert.deepEqual((await f.list("i", w.id)).instantaneas.filter((entry: any) => entry.fuente === "APP-1").length, 2)
  assert.equal((await f.blob(first.contenido.sha256)).toString("utf8"), "Página 1", "La instantánea anterior queda intacta")
  // Cambio de versión: se avisa sin sobrescribir y ambas anteriores se conservan.
  const third = await f.capture("i", { ...base, operacion_id: "cap-v3", resultado: "Páginas 1-2 revisadas",
    version: { tipo: "hash", valor: "bbb" } })
  assert.deepEqual(third.aviso_version.map((item: any) => item.version_anterior.valor).sort(), ["aaa", "aaa"])
  assert.equal((await f.blob(first.contenido.sha256)).toString("utf8"), "Página 1")
  assert.equal((await f.blob(second.contenido.sha256)).toString("utf8"), "Página 2")
  // Igualdad de fecha no decide vigencia: dos capturas con la misma fecha coexisten legibles.
  const dateA = await f.capture("i", { ...base, fuente: "APP-9", operacion_id: "cap-f1", resultado: "A",
    version: { tipo: "fecha", valor: "2026-11-03" } })
  const dateB = await f.capture("i", { ...base, fuente: "APP-9", operacion_id: "cap-f2", resultado: "B",
    version: { tipo: "fecha", valor: "2026-11-03" } })
  assert.notEqual(dateA.instantanea_id, dateB.instantanea_id)
  assert.equal((await f.read("i", w.id, dateA.instantanea_id, dateA.archivo)).contenido, "A")
  assert.equal((await f.read("i", w.id, dateB.instantanea_id, dateB.archivo)).contenido, "B")
})

test("S08 8.4 share con guardado desactivado devuelve exactamente {guardado:false} sin persistencia oculta", async t => {
  const f = await fixture(t)
  const q1 = await f.create("r", { responsable_session_id: "i" })
  const captured = await f.capture("i", { encargo_id: q1.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-off", resultado: "Original" })
  const q2 = await f.create("r", { responsable_session_id: "i2", pregunta: "B" })
  const before = JSON.stringify(await readdir(f.options.root, { recursive: true }))
  const settings = JSON.parse(await readFile(f.options.settingsPath, "utf8"))
  settings.agentes.refinador.guardarEntregablesEnSesion = false
  await writeFile(f.options.settingsPath, JSON.stringify(settings))
  assert.deepEqual(await f.share("r", q2.id, q1.id, captured.instantanea_id), { guardado: false })
  assert.equal(JSON.stringify(await readdir(f.options.root, { recursive: true })), before,
    "Ningún archivo o carpeta nueva bajo la raíz de sesiones")
  // Sin el vínculo persistido, la segunda pregunta sigue sin acceso.
  await assert.rejects(f.read("i2", q2.id, captured.instantanea_id, captured.archivo), /no asignado o no registrado/)
})

//// S08 8.5 — reviewer independence over the same complete snapshot. ////

test("S08 8.5 Revisor: misma instantánea íntegra, cotejo anterior conservado y aprobación no heredada", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const original = "Acta original de APP-1\r\nCondición 1 citada por la entrega"
  const captured = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-review", resultado: original })
  const v1 = await publishSession({ ...f.actor("i"), topic: "resultado", files: { "resultado.md": "Entrega v1" },
    operationID: "v1", publicationType: "publish_agent_deliverable", workID: w.id }, f.options)
  assert.ok(v1.guardado)
  await f.work("i", { action: "review", encargo_id: w.id, artefacto_id: v1.artefacto_id, revisor_session_id: "review" })
  const reviewV1 = await publishReview({ ...f.actor("review"), delivery: v1.rutas["resultado.md"],
    sanity: "Cotejo de v1 contra la instantánea original",
    verdict: { artefacto_id: v1.artefacto_id, hash_manifiesto: v1.hash_manifiesto, resultado: "favorable",
      alcance: ["entrega"], aprobados: ["entrega"], pendientes: [], bloqueados: [] } }, f.options)
  assert.ok(reviewV1.guardado)
  // Entrega nueva (corrección) y asignación de su versión exacta al mismo Revisor.
  const v2 = await publishSession({ ...f.actor("i"), topic: "resultado", files: { "resultado.md": "Entrega v2 corregida" },
    operationID: "v2", publicationType: "publish_agent_deliverable", workID: w.id }, f.options)
  await f.work("i", { action: "review", encargo_id: w.id, artefacto_id: v2.artefacto_id, revisor_session_id: "review" })
  // El Revisor LEE la misma instantánea completa por identidad real, no por ruta.
  const read = await f.read("review", w.id, captured.instantanea_id, captured.archivo)
  assert.equal(read.instantanea, true)
  assert.equal(read.contenido, original)
  assert.equal(read.sha256, captured.contenido.sha256)
  const view = await f.read("review", w.id, captured.instantanea_id, captured.archivo, { vista: "linea" })
  assert.deepEqual(view.lineas.map((line: any) => line.contenido), original.split("\r\n"))
  // Conserva el cotejo verificable anterior: su propio informe de v1 sigue legible.
  const reportFile = reviewV1.archivos!.find(file => file.path.includes("sanity-check"))!.path
  const priorReport = await f.read("review", w.id, reviewV1.artefacto_id, reportFile)
  assert.equal(priorReport.contenido, "Cotejo de v1 contra la instantánea original")
  // No hereda aprobación ni estado revisado: los punteros quedan por versión.
  const version = Object.values((await f.state()).versions).find((v: any) => v.workID === w.id && v.type === "publish_agent_deliverable")!
  assert.equal(version.published, v2.artefacto_id)
  assert.equal(version.reviewed, v1.artefacto_id)
  assert.equal(version.approved, v1.artefacto_id)
  assert.notEqual(version.reviewed, version.published, "La nueva entrega no está revisada por herencia")
  // La revisión de la nueva versión es propia y posterior, con el mismo original sin cambios.
  await publishReview({ ...f.actor("review"), delivery: v2.rutas["resultado.md"], sanity: "Cotejo de v2 contra la misma instantánea original",
    verdict: { artefacto_id: v2.artefacto_id, hash_manifiesto: v2.hash_manifiesto, resultado: "favorable",
      alcance: ["entrega"], aprobados: ["entrega"], pendientes: [], bloqueados: [] } }, f.options)
  const after = Object.values((await f.state()).versions).find((v: any) => v.workID === w.id && v.type === "publish_agent_deliverable")!
  assert.equal(after.reviewed, v2.artefacto_id)
  assert.equal(after.approved, v2.artefacto_id)
  const reread = await f.read("review", w.id, captured.instantanea_id, captured.archivo)
  assert.equal(reread.contenido, original, "El original sin cambios sigue cotejable tras revisar la nueva entrega")
  // Negativos por identidad y asignación, no por ruta.
  await assert.rejects(f.read("otherReview", w.id, captured.instantanea_id, captured.archivo), /no asignado/)
  await assert.rejects(f.read("sibling", w.id, captured.instantanea_id, captured.archivo), /no asignado/)
  await assert.rejects(f.read("review", w.id, captured.instantanea_id, captured.archivo, { corpus: "otro" }), /Corpus/)
  await assert.rejects(sessionArtifacts({ action: "read", encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    artefacto_id: captured.instantanea_id, archivo: captured.archivo } as never,
    { ...f.actor("review"), agent: "investigador" }, f.options), /Lector del artefacto diferente/)
  await assert.rejects(sessionArtifacts({ action: "read", encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    artefacto_id: captured.instantanea_id, archivo: captured.archivo } as never,
    { ...f.actor("review"), messageID: "inventado" }, f.options), /atribuible/)
  // El Revisor consulta instantáneas y no captura ni comparte.
  await assert.rejects(f.capture("review", { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-review", operacion_id: "cap-r", resultado: "x" }), /Revisor consulta/)
  await assert.rejects(f.share("review", w.id, w.id, captured.instantanea_id), /Revisor consulta/)
})

test("S08 8.5 enrutado intacto: las fuentes crudas locales del lector siguen vetadas al Investigador dentro del subárbol", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const readerWork = await f.create("i", { padre_id: w.id, responsable_session_id: "docs" })
  const local = await f.capture("docs", { encargo_id: readerWork.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "documento/local.md", operacion_id: "cap-docs", resultado: "# Documento local" })
  const jira = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1",
    fuente: "APP-1", operacion_id: "cap-jira", resultado: '{"key":"APP-1"}' })
  await assert.rejects(f.read("i", readerWork.id, local.instantanea_id, local.archivo), /no asignado o no registrado/,
    "El Investigador no reclasifica documentos locales del lector")
  await assert.rejects(f.read("i", w.id, local.instantanea_id, local.archivo), /no asignado o no registrado/)
  assert.ok((await f.read("docs", readerWork.id, local.instantanea_id, local.archivo)).instantanea,
    "El lector sigue leyendo su propia fuente local")
  assert.ok((await f.read("i", w.id, jira.instantanea_id, jira.archivo)).instantanea,
    "El Investigador sigue leyendo su original Jira")
  await assert.rejects(f.read("docs", w.id, jira.instantanea_id, jira.archivo), /no asignado/,
    "El lector sin asignación al encargo del Investigador no consulta sus fuentes")
})

//// Real private server: reuse flow with a programmed provider, zero real models. ////

test("S08 8.4 motor privado: dos preguntas con recorrido común, una sola lectura remota observada", { timeout: 300_000 }, async t => {
  const root = await mkdtemp(join(temp, "source-reuse-"))
  const flow = await startReuseFlow(root)
  t.after(() => flow.close())
  const { host, env, config, settings } = await prepareConsumer(root, { providerID: "fixture", id: "test" })
  settings.plugins = [new URL("./test-support/capture", import.meta.url).href, probePlugin]
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { name: "Programmed; not a model", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${flow.port}/v1` },
    models: { test: { capabilities: { tools: true } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  const summary: any = { scope: "S08 8.4 deterministic reuse flow; programmed provider, not a model",
    model: { providerID: "fixture", id: "test" }, realModelCalls: 0 }
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host)
    let history: any[] = []
    try {
    const session = (await request("POST", "/api/session", { agent: "investigador",
      model: { providerID: "fixture", id: "test" }, title: "S08 reutilización" })).data
    summary.sessionID = session.id
    await request("POST", `/api/session/${session.id}/prompt`,
      { text: "Responde la pregunta A sobre el original completo de APP-1 y después la pregunta B sobre el mismo original, sin recuperar la fuente dos veces. Datos ficticios." })
    await nativeWait(request, session.id, Date.now() + 120_000, () => {}, "reuse")
    for (let attempt = 0; attempt < 50; attempt++) {
      history = (await request("GET", `/api/session/${session.id}/message`)).data
      if (history.find((message: any) => message.type === "assistant")?.finish === "stop") break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    const finalMessage = history.find((message: any) => message.type === "assistant")
    assert.equal(finalMessage?.finish, "stop")
    assert.ok(finalMessage?.content?.some((part: any) => part.type === "text" &&
      part.text.includes("REUTILIZACION_COMPLETADA")), "Respuesta final del flujo programado")
    const calls = history.flatMap((message: any) => message.content ?? []).filter((part: any) => part.type === "tool")
    // History arrives newest-first: reverse it to check the chronological order.
    const completed = [...history].reverse().flatMap((message: any) => message.content ?? [])
      .filter((part: any) => part.type === "tool" && part.state?.status === "completed").map((part: any) => part.name)
    assert.deepEqual(completed, ["session_work", "execute", "session_work", "session_artifacts",
      "session_work", "session_artifacts", "session_work"], "Secuencia completa de reutilización con dos preguntas")
    assert.equal(calls.filter((part: any) => part.name === "execute").length, 1, "Una sola ejecución de lectura en Code Mode")
    // Recuperaciones evitadas OBSERVADAS: una lectura común, cero remotas adicionales.
    const fixtureCalls = (await readFile(join(host, "capture-fixture-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    assert.equal(fixtureCalls.length, 1, "Exactamente una lectura del fixture: la pregunta B no releyó APP-1")
    assert.equal(fixtureCalls[0].name, "getJiraIssue")
    assert.equal(fixtureCalls[0].key, "APP-1")
    // Registro: dos encargos con pendientes separados y una sola instantánea.
    const states = await loadStates(host)
    const works = states.flatMap((state: any) => Object.values(state.work ?? {}))
    const q1 = works.find((work: any) => work.pregunta.includes("Pregunta A"))
    const q2 = works.find((work: any) => work.pregunta.includes("Pregunta B"))
    assert.ok(q1 && q2)
    assert.deepEqual(q1.events.at(-1).pendientes, ["APP-2"])
    assert.deepEqual(q2.events.at(-1).pendientes, ["APP-5"], "Pendientes separados por pregunta")
    const snapshots = states.flatMap((state: any) => Object.values(state.snapshots ?? {}))
    assert.equal(snapshots.length, 1, "Una sola instantánea para las dos preguntas")
    const snap = snapshots[0]
    assert.equal(snap.fuente, "APP-1")
    assert.equal(snap.corpus, reuseCorpus)
    assert.equal(snap.referencia, reuseReferencia)
    // El original reutilizado por la segunda pregunta es el mismo blob íntegro.
    const control = join(host, "informes-agente/sesiones/.control")
    let blob: Buffer | undefined
    for (const dir of await readdir(control)) {
      blob = await readFile(join(control, dir, "snapshots", snap.contentSha256)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
        return undefined
      })
      if (blob) break
    }
    assert.ok(blob, "Blob de la instantánea presente por hash en el control")
    const call = (args: object) => JSON.parse(probe(host, connected, { sessionID: session.id,
      messageID: finalMessage.id, agent: "investigador", tool: "session_artifacts", args }).result.content)
    const reused = await call({ action: "read", encargo_id: snap.workID, corpus: reuseCorpus,
      referencia: reuseReferencia, artefacto_id: snap.id, archivo: snap.archivo, limite: 16000 })
    assert.equal(reused.total, blob.toString("utf8").length)
    assert.equal(reused.contenido, blob.toString("utf8"))
    assert.equal(reused.cursor, null)
    assert.equal(reused.instantanea, true)
    assert.equal(flow.requests(), 8, "Ocho vueltas del proveedor programado: create, capture, record, list, create, read, record y cierre")
    } catch (error) {
      await evidenceWriter(root).save("callback-failure.json", { error: String(error), providerRequests: flow.requests() })
      await evidenceWriter(root).save("history-failure.json", history.map((message: any) =>
        ({ id: message.id, type: message.type, finish: message.finish,
          parts: (message.content ?? []).map((part: any) => ({ type: part.type, name: part.name, status: part.state?.status })) })))
      throw error
    }
  }, ["capture-test", "planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  await evidenceWriter(root).save("deterministic-verification.json", { ...summary, providerRequests: flow.requests(),
    realModelCalls: 0, serverExited: true })
  t.diagnostic(`Private server exited; retained PROGRAMMED-only evidence: ${root}`)
})
