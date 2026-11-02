import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { sessionWork, publishSession, type Resolver } from "./tools/session_store.ts"
import type { NativeMessage } from "./tools/work_execution.ts"

async function fixture(t: TestContext, limit = 2) {
  const dir = await mkdtemp(join(tmpdir(), "work-execution-"))
  t.diagnostic(dir)
  const lists: Record<string, NativeMessage[]> = { r: [{ id: "author-r", type: "assistant", agent: "refinador" }], i: [], j: [] }
  const agents: Record<string, string> = { r: "refinador", i: "investigador", j: "investigador" }
  const get: Resolver = Object.assign(async (id: string, messageID?: string) => {
    if (!agents[id] || messageID && !lists[id].some(m => m.id === messageID && m.type === "assistant")) throw new Error("Mensaje no atribuible")
    return { id, agent: agents[id], ...(id === "r" ? {} : { parentID: "r" }), title: "S07", created: 1, directory: dir }
  }, { messages: async (id: string) => lists[id] })
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"), get }
  const settings = await readAgentSettings(options.settingsPath)
  settings.agentes.refinador.maxConsultasParalelas = limit
  await writeFile(options.settingsPath, JSON.stringify(settings))
  const actor = (id: string) => ({ sessionID: id, agent: agents[id], messageID: id === "r" ? "author-r" : lists[id].findLast(m => m.type === "assistant")!.id })
  const call = (input: any, id = "r") => sessionWork(input, actor(id), options) as Promise<any>
  const root = (await call({ action: "create", pregunta: "Historia", criterios: ["CA"], corpus: "corpus", referencia: "v1" })).encargo
  let serial = 0
  const prepare = async (id: string) => {
    const n = ++serial, pregunta = `Pregunta ${n}`
    lists[id].push({ id: `user-prep-${n}`, type: "user", text: pregunta },
      { id: `prep-${n}`, type: "assistant", agent: agents[id], completed: n, finish: "stop", text: `PENDIENTE_CONFIRMACION ${pregunta} corpus v1` },
      { id: `idle-${n}`, type: "idle" })
    const w = (await call({ action: "create", padre_id: root.id, pregunta, criterios: ["CA"], corpus: "corpus", referencia: "v1",
      responsable_session_id: id, requerido: true })).encargo
    const confirm = { action: "confirm", encargo_id: w.id, pregunta, corpus: "corpus", referencia: "v1", preparacion_message_id: `prep-${n}` }
    return { w, confirm }
  }
  const start = async (q: any, id: string) => {
    const e = (await call(q.confirm)).ejecucion
    lists[id].push({ id: `user-${e.id}`, type: "user", text: `CONFIRMAR ${q.w.id} ${e.id}` },
      { id: `start-${e.id}`, type: "assistant", agent: agents[id], active: true })
    const request = { action: "start", encargo_id: q.w.id, ejecucion_id: e.id }
    const started = (await call(request, id)).ejecucion
    return { e: started, request }
  }
  const finish = async (q: any, e: any, id: string, extra = {}) => {
    lists[id].at(-1)!.active = false
    lists[id].push({ id: `result-${e.id}`, type: "assistant", agent: agents[id], completed: 1, finish: "stop", text: `Resultado íntegro ${q.w.pregunta}` },
      { id: `idle-${e.id}`, type: "idle" })
    const input = { action: "result", encargo_id: q.w.id, ejecucion_id: e.id, resultado_message_id: `result-${e.id}`, ...extra }
    return { input, e: (await call(input)).ejecucion }
  }
  const publish = (extra = {}) => publishSession({ ...actor("r"), topic: "candidata", workID: root.id,
    files: { "borrador.md": "Candidata íntegra" }, operationID: "candidata", ...extra }, options) as Promise<any>
  return { dir, lists, options, settings, actor, call, root, prepare, start, finish, publish }
}

test("S07 correlación: preparación no es resultado; transiciones repetidas, notificaciones tardías y duplicadas", async t => {
  const f = await fixture(t)
  const q = await f.prepare("i")
  await assert.rejects(f.call({ ...q.confirm, corpus: "otro" }), /corpus/)
  const first = (await f.call(q.confirm)).ejecucion
  assert.match(first.id, /^exec-/)
  assert.equal(first.turnID, undefined)
  assert.equal(first.executionID, undefined)
  assert.equal(first.provenance, "mensajes_nativos")
  assert.deepEqual((await f.call(q.confirm)).ejecucion, first)
  await assert.rejects(f.call({ action: "result", encargo_id: q.w.id, ejecucion_id: first.id, resultado_message_id: q.confirm.preparacion_message_id }), /tardío|distinta/)
  const { e, request } = await f.start(q, "i")
  assert.deepEqual((await f.call(request, "i")).ejecucion, e)
  await assert.rejects(f.call({ action: "result", encargo_id: q.w.id, ejecucion_id: e.id, resultado_message_id: q.confirm.preparacion_message_id }), /activa/)
  const result = await f.finish(q, e, "i")
  assert.deepEqual((await f.call(result.input)).ejecucion, result.e)
  await assert.rejects(f.call({ ...result.input, resultado_message_id: q.confirm.preparacion_message_id }), /preparación|otra ejecución/)
  const integrate = { action: "integrate", encargo_id: q.w.id, ejecucion_id: e.id,
    resultado_hash: result.e.result.sha256, efecto: "CA incorporado", siguiente_accion: "Revisar candidata" }
  await assert.rejects(f.call({ ...integrate, resultado_hash: "0".repeat(64) }), /exacto/)
  const integrated = (await f.call(integrate)).ejecucion
  assert.deepEqual((await f.call(integrate)).ejecucion, integrated)
  assert.equal(integrated.integration.source, "declaracion_coordinador")
  await assert.rejects(f.call({ ...integrate, efecto: "Cambio oculto" }), /distinto/)
  // Same work, a new real preparation and continuation: old notifications must not affect it.
  f.lists.i.push({ id: "new-user", type: "user", text: "Diferencia pendiente" },
    { id: "new-prep", type: "assistant", agent: "investigador", completed: 2, finish: "stop", text: `PENDIENTE_CONFIRMACION ${q.w.pregunta} corpus v1` },
    { id: "new-idle", type: "idle" })
  const newer = (await f.call({ ...q.confirm, preparacion_message_id: "new-prep" })).ejecucion
  await assert.rejects(f.call(result.input), /tardía/)
  await assert.rejects(f.call(integrate), /tardía/)
  await assert.rejects(f.call(q.confirm), /tardía/)
  assert.equal((await f.call({ action: "get", encargo_id: q.w.id })).encargo.executions.at(-1).id, newer.id)
  assert.equal(newer.state, "en_cola")
})

test("S07 cierre: dos resultados exactos integrados una vez, parcial explícito y barrera ante hijo activo", async t => {
  const f = await fixture(t)
  const q = await f.prepare("i"), r = await f.prepare("j")
  await assert.rejects(f.publish(), /Cierre completo bloqueado/)
  const a = await f.start(q, "i"), b = await f.start(r, "j")
  await assert.rejects(f.publish(), /Cierre completo bloqueado/)
  await assert.rejects(f.publish({ partial: { proposito: "", efecto: "x", siguiente_accion: "x" } }), /propósito/)
  const partial = await f.publish({ operationID: "preentrega", partial: { proposito: "Revisar CA disponible", efecto: "Dos consultas sin integrar", siguiente_accion: "Esperar notificación nativa" } })
  assert.equal(partial.cierre.estado, "parcial")
  assert.equal(partial.cierre.dependencias.filter((d: any) => d.estado === "en_curso").length, 2)
  assert.equal(await readFile(partial.rutas["borrador.md"], "utf8"), "Candidata íntegra")
  for (const [question, started, id] of [[r, b, "j"], [q, a, "i"]] as const) {
    const result = await f.finish(question, started.e, id)
    await assert.rejects(f.publish(), /Cierre completo bloqueado/)
    await f.call({ action: "integrate", encargo_id: question.w.id, ejecucion_id: started.e.id,
      resultado_hash: result.e.result.sha256, efecto: `${question.w.pregunta} integrada`, siguiente_accion: "Cotejar" })
  }
  const saved = await f.publish()
  assert.equal(saved.cierre.estado, "completo")
  assert.ok(saved.cierre.dependencias.every((d: any) => d.estado === "integrado" && d.resultado_hash))
  assert.deepEqual(await f.publish(), saved)
  f.lists.i.push({ id: "later-assistant", type: "assistant", agent: "investigador", text: "Generación posterior todavía activa" })
  await assert.rejects(f.publish({ operationID: "later-generation" }), /Cierre completo bloqueado/)
  f.lists.i.pop()
  // A new native turn is not covered by the previous integration receipt.
  f.lists.i.push({ id: "unexpected", type: "user", text: "Otra ejecución" })
  await assert.rejects(f.publish({ operationID: "new-complete" }), /Cierre completo bloqueado/)
  f.lists.i.push({ id: "unexpected-final", type: "assistant", agent: "investigador", completed: 1, finish: "stop", text: "Otro resultado no integrado" },
    { id: "unexpected-idle", type: "idle" })
  await assert.rejects(f.publish({ operationID: "new-idle-complete" }), /Cierre completo bloqueado/)
  assert.deepEqual(await f.publish(), saved, "Recuperar el commit anterior no crea una candidata nueva")
})

test("S07 límite local, corpus incorrecto aislado, impedimento concreto y guardado desactivado", async t => {
  const f = await fixture(t, 1)
  const q = await f.prepare("i"), r = await f.prepare("j")
  await assert.rejects(f.call({ ...r.confirm, referencia: "errónea" }), /referencia/)
  const a = await f.start(q, "i")
  await assert.rejects(f.call({ action: "assign", encargo_id: q.w.id, responsable_session_id: "j" }), /antes de sustituir/)
  await assert.rejects(f.call(r.confirm), /Límite configurado/)
  await assert.rejects(f.call({ action: "block", encargo_id: q.w.id, ejecucion_id: a.e.id, motivo: "Sin acceso", efecto: "CA pendiente", siguiente_accion: "Solicitar acceso" }), /activa/)
  const result = await f.finish(q, a.e, "i")
  await f.call({ action: "integrate", encargo_id: q.w.id, ejecucion_id: a.e.id, resultado_hash: result.e.result.sha256,
    efecto: "Integrado", siguiente_accion: "Revisar" })
  const b = (await f.call(r.confirm)).ejecucion
  await f.call({ action: "block", encargo_id: r.w.id, ejecucion_id: b.id, motivo: "Falta acceso confirmado", efecto: "CA no determinado", siguiente_accion: "Pedir acceso al responsable" })
  assert.equal((await f.publish()).cierre.dependencias[1].estado, "impedimento_concreto")
  f.settings.agentes.refinador.guardarEntregablesEnSesion = false
  await writeFile(f.options.settingsPath, JSON.stringify(f.settings))
  assert.deepEqual(await f.call(r.confirm), { guardado: false })
  assert.deepEqual(await f.publish(), { guardado: false })
})

test("S07 resultado publicado: manifiesto y mensaje del productor pertenecen a la ejecución exacta", async t => {
  const f = await fixture(t)
  const q = await f.prepare("i"), first = await f.start(q, "i")
  await assert.rejects(f.call({ action: "record", encargo_id: q.w.id, resultado: "Completo", suficiencia: "completo", pendientes: [], siguiente_accion: "Cotejar", fuentes: [], decisiones: [] }, "i"), /ejecución activa/)
  const publish = (operationID: string) => publishSession({ ...f.actor("i"), topic: "Conclusión", workID: q.w.id,
    operationID, files: { "conclusion.md": `Conclusión ${operationID}` } }, f.options) as Promise<any>
  const original = await publish("original")
  const result = await f.finish(q, first.e, "i", { artefacto_id: original.artefacto_id })
  assert.equal(result.e.result.manifestHash, original.hash_manifiesto)
  await f.call({ action: "integrate", encargo_id: q.w.id, ejecucion_id: first.e.id, resultado_hash: result.e.result.sha256,
    efecto: "Conclusión original incorporada", siguiente_accion: "Cotejar" })
  f.lists.i.push({ id: "prep-user-2", type: "user", text: "Ampliación" }, { id: "prep-2", type: "assistant", agent: "investigador",
    completed: 2, finish: "stop", text: `PENDIENTE_CONFIRMACION ${q.w.pregunta} corpus v1` }, { id: "prep-idle-2", type: "idle" })
  const second = await f.start({ ...q, confirm: { ...q.confirm, preparacion_message_id: "prep-2" } }, "i")
  const newer = await publish("correccion")
  f.lists.i.at(-1)!.active = false
  f.lists.i.push({ id: "final-2", type: "assistant", agent: "investigador", completed: 3, finish: "stop", text: "Conclusión de la ejecución nueva" }, { id: "idle-2", type: "idle" })
  const receive = { action: "result", encargo_id: q.w.id, ejecucion_id: second.e.id, resultado_message_id: "final-2" }
  await assert.rejects(f.call({ ...receive, artefacto_id: original.artefacto_id }), /Artefacto de otra ejecución/)
  const received = (await f.call({ ...receive, artefacto_id: newer.artefacto_id })).ejecucion
  assert.equal(received.result.manifestHash, newer.hash_manifiesto)
  assert.notEqual(received.result.sha256, result.e.result.sha256)
  const integrate = { action: "integrate", encargo_id: q.w.id, ejecucion_id: second.e.id, resultado_hash: received.result.sha256,
    efecto: "Corrección incorporada", siguiente_accion: "Cotejar" }
  await f.call(integrate)
  assert.equal((await f.publish()).cierre.estado, "completo")
  f.lists.i.push({ id: "other-work-user", type: "user", text: "Otro encargo/corpus" },
    { id: "other-work-result", type: "assistant", agent: "investigador", completed: 4, finish: "stop", text: "UNASSIGNED_OTHER_WORK" },
    { id: "other-work-idle", type: "idle" })
  const observation = await f.call({ action: "get", encargo_id: q.w.id })
  assert.doesNotMatch(JSON.stringify(observation.mensajes), /UNASSIGNED_OTHER_WORK/)
  assert.ok(observation.mensajes.some((m: any) => m.id === "final-2"), "El resultado propio anterior sigue recuperable")
  f.lists.i.splice(-3)
  const native = f.lists.i.find(m => m.id === "final-2")!, originalText = native.text
  native.text = "Resultado alterado después del recibo"
  await assert.rejects(f.call(integrate), /distinto de los mensajes/)
  await assert.rejects(f.publish({ operationID: "altered-message" }), /distinto de los mensajes/)
  native.text = originalText
  await writeFile(newer.rutas["conclusion.md"], "Bytes alterados después del recibo")
  await assert.rejects(f.publish({ operationID: "altered-artifact" }), /modificado/)
})
