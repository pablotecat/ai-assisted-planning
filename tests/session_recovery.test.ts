import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test, { type TestContext } from "node:test"
import { readAgentSettings } from "../tools/agent_settings.ts"
import { publishReview, publishSession, sessionArtifacts, sessionWork, type Identity } from "../tools/session_store.ts"

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "work-recovery-"))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const base = { title: "Encargo", created: 1, directory: dir }
  const nodes: Record<string, Identity> = {}
  for (const [id, agent, parentID] of [["p", "planificador"], ["r", "refinador", "p"], ["sibling", "refinador", "p"],
    ["i", "investigador", "r"], ["replacement", "investigador", "r"], ["code", "lector-codigo", "i"],
    ["docs", "lector-documentacion", "i"], ["review", "revisor", "i"], ["otherReview", "revisor", "i"],
    ["a", "arquitecto"], ["test", "arquitecto-test", "a"], ["otherTest", "arquitecto-test", "a"], ["foreign", "investigador"]])
    nodes[id] = { ...base, id, agent, ...(parentID ? { parentID } : {}) }
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string, messageID?: string) => {
      if (!nodes[id]) throw new Error("Sesión real desconocida")
      if (messageID && messageID !== `msg-${id}`) throw new Error("Mensaje no atribuible")
      return nodes[id]
    } }
  await readAgentSettings(options.settingsPath)
  const actor = (id: string) => ({ sessionID: id, messageID: `msg-${id}`, agent: nodes[id].agent })
  const work = (id: string, input: any) => sessionWork(input, actor(id), options) as Promise<any>
  const create = async (id: string, extra: object = {}) => (await work(id, { action: "create", pregunta: "¿Qué está verificado?",
    criterios: ["CA-1"], corpus: "corpus-autorizado", referencia: "ref-v1", ...extra })).encargo
  const artifacts = (id: string, encargo_id: string, extra: object = {}) => sessionArtifacts({ action: "list", encargo_id,
    corpus: "corpus-autorizado", referencia: "ref-v1", ...extra } as never, actor(id), options) as Promise<any>
  const publish = async (id: string, workID?: string, extra: object = {}) => {
    const result = await publishSession({ ...actor(id), topic: "resultado", files: { "resultado.md": "Resultado íntegro" },
      operationID: "publicacion-1", publicationType: "publish_agent_deliverable", workID, ...extra }, options)
    assert.ok(result.guardado)
    return result
  }
  const statePath = (id = "p") => join(options.root, ".control", createHash("sha256").update(dir + "\0" + id).digest("hex"), "state.json")
  return { dir, nodes, options, actor, work, create, artifacts, publish, statePath }
}

test("S06 registro: varios encargos por sesión, identidad local/runtime y asociaciones verificables", async t => {
  const f = await fixture(t)
  const first = await f.create("r", { responsable_session_id: "i" })
  const second = await f.create("r", { responsable_session_id: "i", corpus: "otro-corpus" })
  assert.notEqual(first.id, second.id)
  assert.match(first.id, /^work-/)
  assert.equal(first.responsibleSessionID, "i")
  assert.equal(first.events[0].sessionID, "r")
  assert.equal(first.events[0].messageID, "msg-r")
  assert.equal(first.events[0].turnID, undefined, "No se inventa una frontera de turno")
  const noMessage = await sessionWork({ action: "create", pregunta: "Sin mensaje expuesto", criterios: [], corpus: "corpus-autorizado", referencia: "ref-v1" },
    { sessionID: "r", agent: "refinador" }, f.options) as any
  assert.equal(noMessage.encargo.events[0].messageID, undefined, "La ausencia disponible del runtime se conserva")
  assert.equal((await f.work("i", { action: "list" })).encargos.length, 2)
  assert.equal((await f.work("sibling", { action: "list" })).encargos.length, 0)
  for (const id of [first.id, "sibling", "foreign", "p", "inexistente"])
    await assert.rejects(f.create("r", { responsable_session_id: id }), /hijo directo|raíz|desconocida/)
  await assert.rejects(f.create("replacement", { padre_id: first.id }), /no asignado/)
  await assert.rejects(f.create("i", { padre_id: first.id, corpus: "otro-corpus" }), /corpus/)
  await assert.rejects(f.work("i", { action: "get", encargo_id: second.id, sessionID: "r" }), /Unrecognized/)
  await assert.rejects(sessionWork({ action: "get", encargo_id: first.id }, { ...f.actor("i"), agent: "refinador" }, f.options), /Autor/)
  await assert.rejects(sessionWork({ action: "get", encargo_id: first.id }, { ...f.actor("i"), messageID: "inventado" }, f.options), /atribuible/)
})

test("S06 matriz D05: coordinador, productor, sustituto y Revisor exacto; hermanos y otra raíz rechazados", async t => {
  const f = await fixture(t)
  const plan = await f.create("p")
  const story = await f.create("p", { padre_id: plan.id, responsable_session_id: "r" })
  const research = await f.create("r", { padre_id: story.id, responsable_session_id: "i" })
  const result = await f.publish("i", research.id)
  assert.equal((await f.artifacts("i", research.id)).artefactos[0].id, result.artefacto_id)
  assert.equal((await f.artifacts("r", research.id)).artefactos.length, 1)
  assert.equal((await f.artifacts("p", research.id)).artefactos.length, 1)
  for (const id of ["replacement", "sibling", "foreign", "review"])
    await assert.rejects(f.artifacts(id, research.id), /no asignado|ENOENT/)
  await assert.rejects(f.artifacts("i", research.id, { corpus: "otra" }), /Corpus/)
  await assert.rejects(f.artifacts("i", research.id, { referencia: "otra" }), /referencia/)
  await assert.rejects(f.work("i", { action: "review", encargo_id: research.id, artefacto_id: result.artefacto_id,
    revisor_session_id: "sibling" }), /Revisor/)
  await f.work("i", { action: "review", encargo_id: research.id, artefacto_id: result.artefacto_id, revisor_session_id: "review" })
  assert.equal((await f.artifacts("review", research.id)).artefactos.length, 1)
  await assert.rejects(f.artifacts("otherReview", research.id), /no asignado/)
  const newer = await f.publish("i", research.id, { operationID: "nueva", files: { "resultado.md": "Versión nueva" } })
  assert.equal((await f.artifacts("review", research.id)).artefactos.length, 1, "La autorización no se transfiere a la nueva versión")
  await assert.rejects(publishReview({ ...f.actor("review"), delivery: newer.rutas["resultado.md"], sanity: "No asignada" }, f.options), /no asignada/)
  const reviewed = await publishReview({ ...f.actor("review"), delivery: result.rutas["resultado.md"], sanity: "Comprobada" }, f.options)
  assert.ok(reviewed.guardado)
  assert.equal((await f.artifacts("r", research.id)).artefactos.length, 3)
  assert.equal((await f.artifacts("review", research.id)).artefactos.length, 2, "Revisor recupera también su informe, no otra versión del productor")
})

test("S06 lectura acotada: paginación íntegra, Unicode y cursor ligado al solicitante/archivo/versión", async t => {
  const f = await fixture(t)
  const work = await f.create("r", { responsable_session_id: "i" })
  const text = "<table>" + "dato 😀\r\n".repeat(1000) + "</table>"
  const result = await f.publish("i", work.id, { files: { "resultado.md": text, "segundo.md": "Segundo" } })
  await f.publish("i", work.id, { operationID: "otra", files: { "otro.md": "Otro" } })
  const page = await f.artifacts("i", work.id, { limite: 1 })
  assert.equal(page.artefactos.length, 1)
  assert.ok(page.cursor)
  assert.equal((await f.artifacts("i", work.id, { limite: 1, cursor: page.cursor })).cursor, null)
  const file = result.archivos!.find(file => file.path.endsWith("resultado.md"))!.path
  const read = (id: string, extra: object = {}) => f.artifacts(id, work.id, { action: "read", artefacto_id: result.artefacto_id, archivo: file, limite: 257, ...extra })
  let content = "", cursor: string | null = null
  do {
    const chunk = await read("i", cursor ? { cursor } : {})
    assert.equal(chunk.inicio, content.length)
    content += chunk.contenido
    cursor = chunk.cursor
  } while (cursor)
  assert.equal(content, text)
  const first = await read("i")
  for (const [id, extra] of [["r", { cursor: first.cursor }], ["i", { cursor: "invalido" }],
    ["i", { cursor: page.cursor }], ["i", { archivo: result.archivos![1].path, cursor: first.cursor }]])
    await assert.rejects(read(id as string, extra as object), /Cursor/)
  for (const archivo of ["../settings.json", f.options.settingsPath, "no-registrado.md"])
    await assert.rejects(read("i", { archivo }), /no asignado o no registrado/)
  await assert.rejects(read("i", { path: f.options.settingsPath }), /Unrecognized/)
  await assert.rejects(read("i", { limite: 16001 }), /16000/)
  await assert.rejects(read("i", { cursor: Buffer.from("null").toString("base64url") }), /Cursor/)
})

test("S06 registrar originales no concede lectura de documentos locales ni código crudo al Investigador", async t => {
  const f = await fixture(t)
  const work = await f.create("p")
  const original = await f.publish("p", work.id, { publicationType: "write_planning_originals", group: "Originales",
    files: { "LOCAL-1.md": "Documento local original" } })
  await f.work("p", { action: "assign", encargo_id: work.id, responsable_session_id: "r" })
  // The investigator receives a subquestion, not permission to all work in its root.
  const question = await f.create("r", { responsable_session_id: "i" })
  await assert.rejects(f.artifacts("i", work.id, { action: "read", artefacto_id: original.artefacto_id,
    archivo: original.archivos![0].path }), /no asignado/)
  await assert.rejects(f.artifacts("i", question.id, { action: "read", artefacto_id: original.artefacto_id,
    archivo: original.archivos![0].path }), /no asignado o no registrado/)
  await assert.rejects(f.work("i", { action: "record", encargo_id: question.id, resultado: "Usar original ajeno", suficiencia: "parcial",
    pendientes: ["fuente"], siguiente_accion: "Lector", fuentes: [], decisiones: [], artefacto_id: original.artefacto_id }), /no verificable/)
  const readerWork = await f.create("i", { padre_id: question.id, responsable_session_id: "code" })
  const conclusion = await f.publish("code", readerWork.id, { files: { "investigacion.md": "Conclusión derivada, con citas" } })
  assert.equal((await f.artifacts("i", readerWork.id)).artefactos[0].id, conclusion.artefacto_id)
  await assert.rejects(f.artifacts("docs", readerWork.id), /no asignado/)
  await assert.rejects(f.artifacts("i", question.id, { action: "read", artefacto_id: conclusion.artefacto_id,
    archivo: "src/raw.ts" }), /no asignado o no registrado/)
  // Trusted storage fixtures simulate raw registered sources. Registration itself is
  // not a public filesystem import or permission to classify an original as a report.
  for (const [reader, publicationType] of [["code", "fuente-codigo"], ["docs", "fuente-documento-local"]]) {
    const assigned = reader === "code" ? readerWork : await f.create("i", { padre_id: question.id, responsable_session_id: reader })
    const raw = await f.publish(reader, assigned.id, { operationID: `raw-${reader}`, publicationType,
      files: { "original.md": "Fuente cruda asignada solo al lector" } })
    assert.ok((await f.artifacts(reader, assigned.id)).artefactos.some((a: any) => a.id === raw.artefacto_id))
    assert.ok(!(await f.artifacts("i", assigned.id)).artefactos.some((a: any) => a.id === raw.artefacto_id))
    await assert.rejects(f.artifacts("i", assigned.id, { action: "read", artefacto_id: raw.artefacto_id,
      archivo: raw.archivos![0].path }), /no asignado o no registrado/)
  }
  const settings = await readAgentSettings(f.options.settingsPath)
  settings.agentes.investigador.especialistasPermitidos = ["lector-documentacion"]
  await writeFile(f.options.settingsPath, JSON.stringify(settings))
  await assert.rejects(f.artifacts("code", readerWork.id), /Especialista deshabilitado/)
})

test("S06 symlinks, otra ubicación y contenido alterado impiden inventario y lectura", async t => {
  const f = await fixture(t)
  const work = await f.create("r", { responsable_session_id: "i" })
  const result = await f.publish("i", work.id, { group: "entrega" })
  const target = dirname(result.rutas["resultado.md"]), saved = `${target}-saved`
  await rename(target, saved)
  await symlink(saved, target, process.platform === "win32" ? "junction" : "dir")
  await assert.rejects(f.artifacts("i", work.id), /enlazada|no segura/)
  await rm(target)
  await rename(saved, target)
  await writeFile(result.rutas["resultado.md"], "Alterado")
  await assert.rejects(f.artifacts("i", work.id), /modificado/)
  f.nodes.i.directory = join(f.dir, "otro-proyecto")
  await assert.rejects(f.artifacts("i", work.id), /Proyecto/)
})

test("S06 recuperar tras publicación conserva fuentes, decisiones, IDs e intentos sin suplantar al productor", async t => {
  const f = await fixture(t)
  const work = await f.create("r", { responsable_session_id: "i" })
  const readerWork = await f.create("i", { padre_id: work.id, responsable_session_id: "code" })
  const readerResult = await f.publish("code", readerWork.id, { files: { "investigacion.md": "Resultado ya publicado por el lector" } })
  const history = { intentos_consumidos: 2, limite: 3, referencias: ["informe-versión-exacta"] }
  await f.work("i", { action: "record", encargo_id: work.id, resultado: "CA-1 localizado", suficiencia: "parcial", pendientes: ["CA-2"],
    siguiente_accion: "Leer fuente decisiva CA-2", fuentes: ["APP-1"], decisiones: ["Sin acuerdo nuevo"], historial_revision: history })
  const sources = ["fuente\n".repeat(100)]
  await assert.rejects(publishSession({ ...f.actor("i"), topic: "resultado", files: { "conclusion.md": "CA-1 verificado; CA-2 pendiente" },
    workID: work.id, operationID: "respuesta-perdida", sources, decisions: ["No inferir CA-2"] }, { ...f.options,
    checkpoint: phase => { if (phase === "confirmed") throw new Error("Corte sintético después de confirmar") } }), /Corte sintético/)
  const inventory = await f.artifacts("r", work.id)
  const artifact = inventory.artefactos[0]
  assert.equal(artifact.operacion_id, "respuesta-perdida")
  assert.deepEqual(artifact.fuentes, sources, "Metadatos completos, no el texto truncado del índice")
  const before = await readFile(f.statePath())
  await f.work("r", { action: "assign", encargo_id: work.id, responsable_session_id: "replacement" })
  const recovered = (await f.work("replacement", { action: "get", encargo_id: work.id })).encargo
  assert.equal(recovered.id, work.id)
  assert.deepEqual(recovered.events[1].historial_revision, history)
  assert.deepEqual(recovered.events[1].pendientes, ["CA-2"])
  assert.equal(recovered.events[1].suficiencia, "parcial")
  assert.equal((await f.artifacts("replacement", work.id)).artefactos[0].producerSessionID, "i")
  assert.equal((await f.artifacts("replacement", readerWork.id)).artefactos[0].id, readerResult.artefacto_id,
    "La asignación recupera conclusiones del subárbol previo, no solo la publicación del investigador")
  await assert.rejects(f.publish("i", work.id, { operationID: "ya-sustituido" }), /responsable actual/)
  await assert.rejects(publishSession({ ...f.actor("replacement"), agent: "investigador", sessionID: "i", files: { "x.md": "Suplantar" },
    topic: "suplantar", workID: work.id }, f.options), /atribuible/)
  await assert.rejects(f.work("replacement", { action: "record", encargo_id: work.id, resultado: "Continuación", suficiencia: "parcial", pendientes: ["CA-2"],
    siguiente_accion: "Continuar", fuentes: [], decisiones: [], historial_revision: { ...history, intentos_consumidos: 0 } }), /no se reinicia/)
  await assert.rejects(f.work("replacement", { action: "record", encargo_id: work.id, resultado: "Completo sin fuente", suficiencia: "completo", pendientes: ["CA-2"],
    siguiente_accion: "Continuar", fuentes: [], decisiones: [] }), /sigue siendo parcial/)
  const after = JSON.parse(await readFile(f.statePath(), "utf8"))
  assert.equal(Object.keys(after.artifacts).length, Object.keys(JSON.parse(before.toString()).artifacts).length)
})

test("S06 guardado desactivado y lectura legacy: ningún archivo oculto ni historial inventado", async t => {
  const f = await fixture(t)
  const settings = await readAgentSettings(f.options.settingsPath)
  settings.agentes.arquitecto.guardarEntregablesEnSesion = false
  await writeFile(f.options.settingsPath, JSON.stringify(settings))
  assert.deepEqual(await f.work("a", { action: "create", pregunta: "Continuar", criterios: [], corpus: "Test", referencia: "v1" }), { guardado: false })
  assert.deepEqual(await f.work("a", { action: "list" }), { encargos: [] })
  await assert.rejects(readdir(f.options.root), { code: "ENOENT" })
  const work = await f.create("r", { responsable_session_id: "i" })
  await f.publish("i", work.id)
  const before = await readFile(f.statePath())
  settings.agentes.investigador.guardarEntregablesEnSesion = false
  await writeFile(f.options.settingsPath, JSON.stringify(settings))
  assert.deepEqual(await f.work("i", { action: "record", encargo_id: work.id, resultado: "Parcial en conversación", suficiencia: "parcial", pendientes: ["CA-2"],
    siguiente_accion: "Conservar contexto", fuentes: [], decisiones: [] }), { guardado: false })
  assert.equal((await f.artifacts("i", work.id)).artefactos.length, 1, "El artefacto anterior sigue autorizado")
  assert.deepEqual(await readFile(f.statePath()), before)
  const legacy = JSON.parse(before.toString()); delete legacy.schemaVersion; delete legacy.work
  await writeFile(f.statePath(), JSON.stringify(legacy))
  assert.deepEqual(await f.work("r", { action: "list" }), { encargos: [] })
  assert.equal(await readFile(f.statePath(), "utf8"), JSON.stringify(legacy))
  assert.ok(!(await readdir(dirname(f.statePath()))).includes("state.v0.json"), "Consultar no migra ni crea copias")
})

test("S06 Test conserva especialidad e historial desconocido; promoción no atraviesa encargos", async t => {
  const f = await fixture(t)
  const work = await f.create("a", { responsable_session_id: "test" })
  const record = await f.work("test", { action: "get", encargo_id: work.id })
  assert.ok(record.encargo.events.every((e: any) => e.historial_revision === undefined), "Ausencia no significa cero intentos")
  await f.publish("test", work.id)
  await assert.rejects(f.artifacts("otherTest", work.id), /no asignado/)
  await assert.rejects(f.work("a", { action: "assign", encargo_id: work.id, responsable_session_id: "code" }), /raíz/)
  const own = await f.create("i")
  const other = await f.create("i", { corpus: "otro-corpus" })
  const result = await f.publish("i", own.id)
  const file = result.archivos![0]
  await assert.rejects(f.publish("i", other.id, { operationID: "promocion-ajena", files: {
    "resultado.md": { artefacto_id: result.artefacto_id, archivo: file.path, sha256: file.sha256 } } }), /otro encargo\/corpus/)
})
