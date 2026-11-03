import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdtemp, appendFile, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test, { type TestContext } from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { captureSource, publishSession, sessionArtifacts, sessionWork, type Identity, type Snapshot } from "./tools/session_store.ts"
import { captureRequest } from "./tools/capture_agent_source.ts"
import plugin from "./plugin/agent-session.ts"
import { longHtml } from "./test-support/capture/index.ts"
import { prepareConsumer, evidenceWriter, loadStates } from "./test-support/evidence-model/verify-model.mjs"
import { nativeWait, privateRequest } from "./test-support/delegation/verify-model.mjs"
import { probe, probePlugin, withServer } from "./test-support/opencode.mjs"

const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
const base = { title: "Encargo", created: 1, directory: "proyecto" }

//// S08 8.1 — registration as a Code Mode tool with role identity and saving. ////

async function adapter(nodes: Record<string, Identity>) {
  const tools: Record<string, any> = {}
  const permissions: any[] = []
  const ctx = {
    agent: { transform: async (fn: any) => fn({ update: (_id: string, update: any) => update({ permissions: [] }) }) },
    session: {
      get: async ({ sessionID }: any) => ({ ...nodes[sessionID], time: { created: nodes[sessionID].created },
        location: { directory: nodes[sessionID].directory } }),
      context: async ({ sessionID }: any) => [{ id: "mensaje", type: "assistant", agent: nodes[sessionID].agent }],
      hook: async () => {},
    },
    permission: { assert: async (input: any) => { permissions.push(input) }, hook: async () => {} },
    tool: { transform: async (fn: any) => fn({ add: (tool: any) => { tools[tool.name] = tool } }), hook: async () => {} },
  }
  await plugin.setup(ctx as never)
  return { tools, permissions }
}

test("S08 registro: capture_agent_source es la decimotercera herramienta, de Code Mode, con permiso y guardado del rol", async () => {
  const nodes: Record<string, Identity> = { x: { ...base, id: "x", agent: "investigador", directory: "proyecto" } }
  const { tools, permissions } = await adapter(nodes)
  assert.deepEqual(Object.keys(tools).sort(), ["agent_settings", "architecture_settings", "capture_agent_source",
    "investigator_defaults", "planning_settings", "publish_agent_deliverable", "refinement_settings",
    "session_artifacts", "session_work", "write_planning_originals", "write_planning_deliverables",
    "write_report_pair", "write_review_documents"].sort())
  for (const [name, definition] of Object.entries(tools))
    assert.equal(definition.options.codemode, name === "capture_agent_source", `${name}: codemode`)
  const context = { sessionID: "x", messageID: "mensaje", id: "call", agent: "investigador" }
  await assert.rejects(tools.capture_agent_source.execute({}, context), /required|invalid|expected/i,
    "El esquema estricto rechaza entradas vacías")
  // The capture shares the existing Code Mode "execute" authorization; it does
  // not add a new role permission (options.permission in the registration).
  assert.deepEqual(permissions[0], { sessionID: "x", agent: "investigador",
    source: { type: "tool", messageID: "mensaje", id: "call" },
    action: "execute", resources: ["*"], save: ["*"] })
})

//// Deterministic fixtures shared by 8.2 and 8.3. ////

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "source-capture-"))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const nodes: Record<string, Identity> = {}
  for (const [id, agent, parentID] of [["p", "planificador"], ["r", "refinador", "p"], ["sibling", "refinador", "p"],
    ["i", "investigador", "r"], ["replacement", "investigador", "r"], ["code", "lector-codigo", "i"],
    ["docs", "lector-documentacion", "i"], ["review", "revisor", "i"], ["otherReview", "revisor", "i"], ["foreign", "investigador"]])
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
  const create = async (id: string, extra: object = {}) => (await work(id, { action: "create", pregunta: "¿Qué originales hay?",
    criterios: ["CA-1"], corpus: "corpus-autorizado", referencia: "ref-v1", ...extra })).encargo
  const capture = (id: string, input: any) => captureSource(input, actor(id), options) as Promise<any>
  const artifacts = (id: string, encargo_id: string, extra: object = {}) => sessionArtifacts({ action: "read", encargo_id,
    corpus: "corpus-autorizado", referencia: "ref-v1", ...extra } as never, actor(id), options) as Promise<any>
  const statePath = (id = "p") => join(options.root, ".control", createHash("sha256").update(dir + "\0" + id).digest("hex"), "state.json")
  const blob = async (sha256: string) => readFile(join(dirname(statePath()), "snapshots", sha256))
  return { dir, nodes, options, actor, work, create, capture, artifacts, statePath, blob }
}

//// S08 8.1 — runtime authority: no declared author, corpus or destination paths. ////

test("S08 captura: identidad del rol, encargo/corpus exactos y guardado del rol; sin rutas de destino", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const input = (extra: object = {}) => ({ encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-1", resultado: "Texto leído", ...extra })
  const first = await f.capture("i", input())
  assert.equal(first.guardado, true)
  assert.match(first.instantanea_id, /^snap-/)
  assert.equal(first.representacion, "texto_literal")
  assert.equal(first.formato, "texto")
  assert.equal((await f.blob(first.contenido.sha256)).toString("utf8"), "Texto leído")
  await assert.rejects(f.capture("i", input({ corpus: "otro" })), /Corpus/)
  await assert.rejects(f.capture("i", input({ referencia: "otra" })), /referencia/)
  await assert.rejects(f.capture("i", input({ encargo_id: "work-inexistente" })), /no asignado/)
  await assert.rejects(f.capture("sibling", input()), /no asignado/)
  await assert.rejects(captureSource(input(), { ...f.actor("i"), agent: "refinador" }, f.options), /Autor de captura/)
  await assert.rejects(f.capture("review", input({ fuente: "APP-review" })), /Revisor consulta/)
  await f.work("r", { action: "assign", encargo_id: w.id, responsable_session_id: "replacement" })
  await assert.rejects(f.capture("i", input({ operacion_id: "tras-sustitucion" })), /Solo el responsable actual/)
  // The schema is strict: destination paths or producers by argument do not exist.
  assert.throws(() => captureRequest.parse({ ...input(), ruta: "c:/destino.txt" } as never), /Unrecognized/)
  assert.throws(() => captureRequest.parse({ ...input(), destino: "c:/destino.txt" } as never), /Unrecognized/)
  assert.throws(() => captureRequest.parse({ ...input(), autor: "investigador" } as never), /Unrecognized/)
  assert.throws(() => captureRequest.parse({ ...input(), operacion_id: undefined } as never), /required|invalid/i)
})

test("S08 captura desactivada devuelve exactamente {guardado:false} sin persistencia oculta", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const before = JSON.stringify(await readdir(f.options.root, { recursive: true }))
  const settings = JSON.parse(await readFile(f.options.settingsPath, "utf8"))
  settings.agentes.investigador.guardarEntregablesEnSesion = false
  await writeFile(f.options.settingsPath, JSON.stringify(settings))
  assert.deepEqual(await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-off", resultado: "Texto" }), { guardado: false })
  assert.equal(JSON.stringify(await readdir(f.options.root, { recursive: true })), before,
    "Ningún archivo, carpeta o blob nuevo bajo la raíz de sesiones")
})

//// S08 8.2 — originals and manifests: representation, version, coverage. ////

test("S08 captura preserva literal o serializa deterministamente e identifica cuál se obtuvo", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const base = { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1", fuente: "APP-1" }
  const literal = "Acta con CRLF\r\ny 😀 unicode"
  const first = await f.capture("i", { ...base, operacion_id: "lit-1", resultado: literal })
  assert.equal(first.representacion, "texto_literal")
  assert.equal((await f.blob(first.contenido.sha256)).toString("utf8"), literal, "Texto literal sin cambios")
  const obj = await f.capture("i", { ...base, operacion_id: "obj-1", resultado: { b: 1, a: [2, { d: 4, c: 3 }] } })
  assert.equal(obj.representacion, "objeto_serializado")
  assert.equal((await f.blob(obj.contenido.sha256)).toString("utf8"), '{"a":[2,{"c":3,"d":4}],"b":1}',
    "Serialización determinista por estructura, independiente del orden recibido")
  const asDeclared = await f.capture("i", { ...base, operacion_id: "obj-2",
    resultado: '{"x":1}', representacion: "objeto_serializado" })
  assert.equal(asDeclared.representacion, "objeto_serializado")
  assert.equal((await f.blob(asDeclared.contenido.sha256)).toString("utf8"), '{"x":1}')
  const stringKeptLiteral = await f.capture("i", { ...base, operacion_id: "lit-2", resultado: '{"x":1}' })
  assert.equal(stringKeptLiteral.representacion, "texto_literal", "Un JSON recibido como texto se conserva tal cual")
  assert.equal((await f.blob(stringKeptLiteral.contenido.sha256)).toString("utf8"), '{"x":1}')
  await assert.rejects(f.capture("i", { ...base, operacion_id: "mal-1", resultado: { a: 1 }, representacion: "texto_literal" }), /texto literal/)
  await assert.rejects(f.capture("i", { ...base, operacion_id: "mal-2", resultado: "no json", representacion: "objeto_serializado" }), /objeto serializado/)
  // An absent response is never read as absence of the source nor as empty content.
  await assert.rejects(f.capture("i", { ...base, operacion_id: "mal-3", resultado: undefined as never }), /Resultado requerido/)
  await assert.rejects(f.capture("i", { ...base, operacion_id: "mal-4", resultado: "" as never }), /Resultado requerido/)
})

test("S08 captura idempotente por operación; la versión que cambia añade y conserva la anterior", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const base = { encargo_id: w.id, corpus: "corpus-autorizado", referencia: "ref-v1", fuente: "APP-1" }
  const first = await f.capture("i", { ...base, operacion_id: "cap-v1", resultado: "Página 1", version: { tipo: "hash" as const, valor: "aaa" } })
  const repeat = await f.capture("i", { ...base, operacion_id: "cap-v1", resultado: "Página 1", version: { tipo: "hash" as const, valor: "aaa" } })
  assert.equal(repeat.instantanea_id, first.instantanea_id, "Misma identidad y contenido devuelven la captura anterior")
  const state = JSON.parse(await readFile(f.statePath(), "utf8"))
  assert.equal(Object.keys(state.snapshots).length, 1)
  await assert.rejects(f.capture("i", { ...base, operacion_id: "cap-v1", resultado: "Otro contenido" }),
    /Identidad de captura reutilizada/)
  const second = await f.capture("i", { ...base, operacion_id: "cap-v2", resultado: "Página 1 v2", version: { tipo: "hash" as const, valor: "bbb" } })
  assert.notEqual(second.instantanea_id, first.instantanea_id)
  assert.deepEqual(second.aviso_version, [{ instantanea_anterior_id: first.instantanea_id, version_anterior: { tipo: "hash", valor: "aaa" } }],
    "El cambio de versión durante la recuperación se avisa, no se sobrescribe")
  assert.equal((await f.blob(first.contenido.sha256)).toString("utf8"), "Página 1", "La instantánea anterior permanece intacta")
  const after = JSON.parse(await readFile(f.statePath(), "utf8"))
  assert.equal(Object.keys(after.snapshots).length, 2)
})

test("S08 manifiesto de cobertura: páginas, campos personalizados y componentes pendientes declarados", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const result = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-com", resultado: "Comentarios página 1",
    paginas: { recuperadas: [1], pendientes: [2, 3], total: 3 },
    campos: { recuperados: ["summary", "description"], pendientes: ["customField_1001"] },
    pendientes: ["comentarios:2-3", "customField_1001"] })
  assert.deepEqual(result.cobertura_paginas, { recuperadas: [1], pendientes: [2, 3], total: 3 })
  assert.deepEqual(result.cobertura_campos, { recuperados: ["summary", "description"], pendientes: ["customField_1001"] })
  assert.deepEqual(result.pendientes, ["comentarios:2-3", "customField_1001"])
  const state = JSON.parse(await readFile(f.statePath(), "utf8"))
  const snapshot: Snapshot = Object.values(state.snapshots)[0]
  assert.equal(snapshot.fuente, "APP-1")
  assert.equal(snapshot.corpus, "corpus-autorizado")
  assert.equal(snapshot.referencia, "ref-v1")
  assert.equal(snapshot.producerSessionID, "i")
  assert.equal(snapshot.agent, "investigador")
  assert.equal(snapshot.producerMessageID, "msg-i")
  assert.deepEqual(snapshot.cobertura_paginas, { recuperadas: [1], pendientes: [2, 3], total: 3 })
})

test("S08 envoltorio desconocido: la respuesta se conserva íntegra y se diagnostica, nunca ausencia", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const result = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-raro", resultado: { envoltorioRaro: { detalle: [1, 2] } } })
  assert.equal(result.formato, "desconocido")
  assert.equal(result.diagnostico.tipo, "envoltorio_desconocido")
  assert.equal((await f.blob(result.contenido.sha256)).toString("utf8"), '{"envoltorioRaro":{"detalle":[1,2]}}')
  const known = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-2", operacion_id: "cap-known", resultado: { key: "APP-2", fields: { summary: "s" } } })
  assert.equal(known.formato, "jira_issue")
  assert.equal(known.diagnostico, undefined)
})

//// S08 8.3 — cursor/locator reading and derived views of known formats only. ////

test("S08 lectura de instantánea: cursor UTF-16 íntegro y original intacto; HTML >2000 en una línea recuperable", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const html = `# Encabezado\n${longHtml}\n## Pie`
  const captured = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-html", resultado: html })
  assert.ok(captured.contenido.bytes > 2000)
  assert.equal((await f.blob(captured.contenido.sha256)).toString("utf8"), html)
  const read = (extra: object = {}) => f.artifacts("i", w.id, { artefacto_id: captured.instantanea_id,
    archivo: captured.archivo, ...extra })
  // Raw paged reading recovers the exact original, surrogates included.
  let content = "", cursor: string | null = null
  do {
    const chunk = await read(cursor ? { cursor } : { limite: 300 })
    assert.equal(chunk.inicio, content.length)
    content += chunk.contenido
    cursor = chunk.cursor
  } while (cursor)
  assert.equal(content, html)
  assert.ok(!(await f.artifacts("i", w.id, { artefacto_id: captured.instantanea_id, archivo: captured.archivo })).diagnostico)
  // View "linea": numbered lines, a single long line never split.
  const firstPage = await read({ vista: "linea", limite: 100 })
  assert.equal(firstPage.total_lineas, 3)
  assert.deepEqual(firstPage.lineas, [{ numero: 1, contenido: "# Encabezado" }])
  const secondPage = await read({ vista: "linea", limite: 100, cursor: firstPage.cursor })
  assert.equal(secondPage.lineas.length, 1)
  assert.equal(secondPage.lineas[0].numero, 2)
  assert.equal(secondPage.lineas[0].contenido, longHtml)
  assert.equal(secondPage.excede_limite, true, "Una sola línea mayor que el límite se emite entera")
  assert.ok(secondPage.lineas[0].contenido.includes("<table") && /APP-3 y APP-4/.test(secondPage.lineas[0].contenido))
  const thirdPage = await read({ vista: "linea", limite: 100, cursor: secondPage.cursor })
  assert.deepEqual(thirdPage.lineas, [{ numero: 3, contenido: "## Pie" }])
  assert.equal(thirdPage.cursor, null)
  // The original stays intact after derived reads.
  assert.equal((await f.blob(captured.contenido.sha256)).toString("utf8"), html)
})

test("S08 localizadores estables y cursores ligados; el envoltorio desconocido produce diagnóstico, no undefined", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const text = "línea 1 😀\r\nlínea 2 con mención APP-3\r\nlínea 3 numeración 1.2.3\r\nlínea 4"
  const captured = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-loc", resultado: text })
  const read = (id: string, extra: object = {}) => f.artifacts(id, w.id, { artefacto_id: captured.instantanea_id,
    archivo: captured.archivo, ...extra })
  const line2 = text.indexOf("línea 2")
  const located = await read("i", { localizador: "L2" })
  assert.equal(located.inicio, line2, "L2 posiciona al inicio exacto de la segunda línea")
  await assert.rejects(read("i", { localizador: "L99" }), /fuera del original/)
  await assert.rejects(read("i", { localizador: "no-linea" }), /Localizador inválido/)
  await assert.rejects(read("i", { localizador: "L1", cursor: "lo-que-sea" }), /no ambos/)
  const firstView = await read("i", { vista: "linea", limite: 2 })
  await assert.rejects(read("r", { vista: "linea", cursor: firstView.cursor }), /Cursor de otro solicitante/)
  await assert.rejects(read("i", { vista: "linea", cursor: "invalido" }), /Cursor/)
  const direct = await read("i", { vista: "linea", localizador: "L3" })
  assert.deepEqual(direct.lineas.map((line: any) => line.numero), [3, 4])
  // Full traversal by view cursor reconstructs every numbered line.
  const lines: string[] = []
  let cursor: string | null = null
  do {
    const page = await read("i", cursor ? { vista: "linea", cursor } : { vista: "linea" })
    lines.push(...page.lineas.map((line: any) => line.contenido))
    cursor = page.cursor
  } while (cursor)
  assert.deepEqual(lines, text.split("\r\n"))
  // Unknown wrapper in view: explicit diagnosis, never undefined as absence.
  const unknown = await f.capture("i", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-9", operacion_id: "cap-unknown", resultado: { envoltivo: true } })
  const diagnosed = await read("i", { artefacto_id: unknown.instantanea_id, archivo: unknown.archivo, vista: "linea" })
  assert.equal(diagnosed.diagnostico.tipo, "envoltorio_no_reconocido")
  assert.equal(diagnosed.original.disponible, true)
  assert.ok(typeof diagnosed.original.total_unidades === "number")
  const raw = await read("i", { artefacto_id: unknown.instantanea_id, archivo: unknown.archivo, limite: 4 })
  assert.equal(raw.contenido, '{"en', "La lectura cruda del original conservado sigue disponible")
})

test("S08 artefactos publicados: localizador L<n> y vista linea también sin tocar el contrato anterior", async t => {
  const f = await fixture(t)
  const w = await f.create("r", { responsable_session_id: "i" })
  const text = "parrafo uno\nparrafo dos\nparrafo tres"
  const published = await publishSession({ sessionID: "i", messageID: "msg-i", agent: "investigador", topic: "entrega",
    files: { "resultado.md": text }, operationID: "publica-l", publicationType: "publish_agent_deliverable", workID: w.id }, f.options)
  assert.ok(published.guardado)
  const archivo = published.archivos!.find(file => file.path.endsWith("resultado.md"))!.path
  const located = await f.artifacts("i", w.id, { artefacto_id: published.artefacto_id, archivo, localizador: "L2" })
  assert.equal(located.inicio, "parrafo uno\n".length)
  assert.equal(located.contenido.slice(0, 11), "parrafo dos")
  const view = await f.artifacts("i", w.id, { artefacto_id: published.artefacto_id, archivo, vista: "linea" })
  assert.deepEqual(view.lineas.map((line: any) => [line.numero, line.contenido]),
    [[1, "parrafo uno"], [2, "parrafo dos"], [3, "parrafo tres"]])
  assert.equal(view.cursor, null)
})

test("S08 matriz D05 de instantáneas: audiencia por árbol/corpus, lector crudo no pasa al Investigador, Revisor asignado", async t => {
  const f = await fixture(t)
  const question = await f.create("r", { responsable_session_id: "i" })
  const captured = await f.capture("i", { encargo_id: question.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-1", operacion_id: "cap-i", resultado: { key: "APP-1", fields: { summary: "s" } } })
  assert.equal(captured.formato, "jira_issue")
  const delivered = await publishSession({ sessionID: "i", messageID: "msg-i", agent: "investigador", topic: "resultado",
    files: { "resultado.md": "Conclusión de APP-1" }, operationID: "pub-i", publicationType: "publish_agent_deliverable",
    workID: question.id }, f.options)
  await f.work("i", { action: "review", encargo_id: question.id, artefacto_id: delivered.artefacto_id, revisor_session_id: "review" })
  const read = (id: string) => f.artifacts(id, question.id, { artefacto_id: captured.instantanea_id, archivo: captured.archivo })
  assert.ok((await read("i")).instantanea, "El responsable lee su instantánea")
  assert.ok((await read("r")).instantanea, "El coordinador del árbol lee la instantánea del encargo")
  assert.ok((await read("review")).instantanea, "El Revisor con revisión asignada coteja la misma instantánea")
  await assert.rejects(read("otherReview"), /no asignado/)
  await assert.rejects(read("sibling"), /no asignado/)
  await assert.rejects(read("docs"), /no asignado/)
  await assert.rejects(read("foreign"), /no asignado|ENOENT/)
  // Raw reader sources stay with their narrow audience.
  const readerWork = await f.create("i", { padre_id: question.id, responsable_session_id: "code" })
  const raw = await f.capture("code", { encargo_id: readerWork.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "codigo/datos.ts", operacion_id: "cap-code", resultado: "export const raw = 1" })
  assert.ok((await f.artifacts("code", readerWork.id, { artefacto_id: raw.instantanea_id, archivo: raw.archivo })).instantanea)
  await assert.rejects(f.artifacts("i", readerWork.id, { artefacto_id: raw.instantanea_id, archivo: raw.archivo }),
    /no asignado o no registrado/, "El Investigador no adquiere fuentes crudas del lector por registrarlas")
  await assert.rejects(f.artifacts("i", question.id, { artefacto_id: raw.instantanea_id, archivo: raw.archivo }),
    /no asignado o no registrado/)
  await assert.rejects(f.artifacts("i", question.id, { ...{ artefacto_id: captured.instantanea_id, archivo: raw.archivo } }),
    /no asignado o no registrado/)
})

test("S08 H-1: el coordinador propietario (owner ≠ responsable) captura y después lee su propia instantánea; coordinador ajeno no", async t => {
  const f = await fixture(t)
  // r owns the encargo, i is the responsible: owner ≠ responsable.
  const w = await f.create("r", { responsable_session_id: "i" })
  assert.notEqual(w.ownerSessionID, w.responsibleSessionID)
  // The owner is authorized to capture (captureSource), and the snapshot must
  // be readable afterwards: the exact gap was "guardado:true" then nobody reads.
  const captured = await f.capture("r", { encargo_id: w.id, corpus: "corpus-autorizado",
    referencia: "ref-v1", fuente: "APP-7", operacion_id: "cap-owner",
    resultado: "Original capturado por el propietario" })
  assert.equal(captured.guardado, true)
  assert.match(captured.instantanea_id, /^snap-/)
  const read = (id: string, extra: object = {}) => f.artifacts(id, w.id, { artefacto_id: captured.instantanea_id,
    archivo: captured.archivo, ...extra })
  const own = await read("r")
  assert.ok(own.instantanea, "El propietario lee la instantánea que él mismo capturó")
  assert.equal(own.contenido, "Original capturado por el propietario")
  assert.equal(own.fuente, "APP-7")
  assert.equal(own.corpus, "corpus-autorizado")
  assert.equal(own.referencia, "ref-v1")
  // The responsible of the same encargo also reads it (authority chain), raw and derived.
  const raw = await read("i")
  assert.equal(raw.contenido, "Original capturado por el propietario")
  const view = await read("i", { vista: "linea" })
  assert.deepEqual(view.lineas, [{ numero: 1, contenido: "Original capturado por el propietario" }])
  // Negatives kept: another coordinator outside the encargo, an unassigned reader
  // and a corpus mismatch stay rejected; the Revisor path is unchanged (H-5 scope).
  await assert.rejects(read("sibling"), /no asignado/)
  await assert.rejects(read("docs"), /no asignado/)
  await assert.rejects(read("otherReview"), /no asignado/)
  await assert.rejects(read("r", { corpus: "otro" }), /Corpus/)
})

//// Real private server: native Code Mode transfer, no real model. ////

test("S08 motor privado: Code Mode transfiere la lectura directamente a capture sin retranscripción; blob, código y lectura verificados", { timeout: 300_000 }, async t => {
  const root = await mkdtemp(join(temp, "capture-native-"))
  let count = 0
  const provider = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    const textOf = (message: any) => typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("")
      : JSON.stringify(message.content ?? "")
    const results = (body.messages ?? []).filter((message: any) => message.role === "tool").map(textOf)
    const last = results.at(-1) ?? ""
    // Bounded evidence of what the programmed provider received: roles and sizes only.
    await appendFile(join(root, "provider-requests.jsonl"), JSON.stringify({ index: count, url: req.url,
      roles: (body.messages ?? []).map((message: any) => message.role), lastToolChars: last.length,
      lastToolStart: last.slice(0, 120) }) + "\n").catch(() => {})
    const created = /"id"\s*:\s*"(work-[a-f0-9-]+)"/.exec(last)
    const final = /instantanea_id/.test(last)
    const index = count++
    let delta
    if (final) delta = { content: "CAPTURA_COMPLETADA" }
    else if (created) {
      const code = `const issue = await tools.jira.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey:"APP-1",view:"full"});
        const cap = await tools.sesion.capture_agent_source({encargo_id:${JSON.stringify(created[1])},corpus:"fixture",referencia:"acta-2026-11-03",fuente:"APP-1",operacion_id:"cap-app1",resultado:issue});
        return typeof cap === "string" ? cap : JSON.stringify(cap)`
      delta = { tool_calls: [{ index: 0, id: `programmed-${index}`, type: "function",
        function: { name: "execute", arguments: JSON.stringify({ code }) } }] }
    } else delta = { tool_calls: [{ index: 0, id: `programmed-${index}`, type: "function", function: { name: "session_work",
      arguments: JSON.stringify({ action: "create", pregunta: "Recuperar el original completo de APP-1", criterios: [],
        corpus: "fixture", referencia: "acta-2026-11-03" }) } }] }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: final ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  const expectedIssue = { key: "APP-1", fields: { summary: "Consulta de captura", description: longHtml,
    comment: { total: 2 }, customFields: {} } }
  const { host, env, config, settings } = await prepareConsumer(root, { providerID: "fixture", id: "test" })
  settings.plugins = [new URL("./test-support/capture", import.meta.url).href, probePlugin]
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" },
    { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { name: "Programmed; not a model", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${(provider.address() as any).port}/v1` },
    models: { test: { capabilities: { tools: true } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  const summary: any = { scope: "S08 deterministic code-mode transfer; programmed provider, not a model",
    model: { providerID: "fixture", id: "test" }, realModelCalls: 0 }
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host)
    let history: any[] = []
    try {
    const session = (await request("POST", "/api/session", { agent: "investigador",
      model: { providerID: "fixture", id: "test" }, title: "S08 captura" })).data
    summary.sessionID = session.id
    await request("POST", `/api/session/${session.id}/prompt`,
      { text: "Recupera y conserva el original completo de APP-1 del sitio confirmado con sus evidencias. Datos ficticios." })
    await nativeWait(request, session.id, Date.now() + 120_000, () => {}, "capture")
    // The final assistant message lands asynchronously after idle; bounded wait.
    // History arrives newest-first: the first assistant entry is the latest turn.
    for (let attempt = 0; attempt < 50; attempt++) {
      history = (await request("GET", `/api/session/${session.id}/message`)).data
      if (history.find((message: any) => message.type === "assistant")?.finish === "stop") break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    const calls = history.flatMap((message: any) => message.content ?? []).filter((part: any) => part.type === "tool")
    const creation = calls.find((part: any) => part.name === "session_work")
    assert.ok(creation?.state?.status === "completed", "session_work create completado en la sesión real")
    const execution = calls.find((part: any) => part.name === "execute")
    assert.ok(execution?.state?.status === "completed", "execute (Code Mode) completado")
    const finalMessage = history.find((message: any) => message.type === "assistant")
    assert.equal(finalMessage?.finish, "stop")
    assert.ok(finalMessage?.content?.some((part: any) => part.type === "text" &&
      part.text.includes("CAPTURA_COMPLETADA")), "Respuesta final del flujo programado")
    const catalog = probe(host, connected, { agent: "investigador" })
    assert.ok(catalog.tools.includes("sesion_capture_agent_source"), "Herramienta registrada con namespace de sesión")
    assert.ok(catalog.codeModeTools.includes("sesion_capture_agent_source"),
      "capture_agent_source es herramienta de Code Mode en el registro efectivo")
    assert.ok(!catalog.codeModeTools.includes("session_artifacts") && !catalog.codeModeTools.includes("session_work"),
      "Las herramientas directas no cambian de interfaz")
    const fixtureCalls = (await readFile(join(host, "capture-fixture-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    assert.equal(fixtureCalls.length, 1)
    assert.equal(fixtureCalls[0].name, "getJiraIssue")
    const states = await loadStates(host)
    const snapshots = states.flatMap((state: any) => Object.values(state.snapshots ?? {}))
    const snap = snapshots.find((snapshot: any) => snapshot.fuente === "APP-1")
    assert.ok(snap, "Instantánea APP-1 registrada en el control del encargo")
    assert.equal(snap.corpus, "fixture")
    assert.equal(snap.referencia, "acta-2026-11-03")
    assert.ok(["texto_literal", "objeto_serializado"].includes(snap.representacion))
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
    assert.deepEqual(JSON.parse(blob.toString("utf8")), expectedIssue,
      "El original transferido dentro del mismo código llegó íntegro, sin retranscripción")
    const call = (args: object) => JSON.parse(probe(host, connected, { sessionID: session.id,
      messageID: finalMessage.id, agent: "investigador", tool: "session_artifacts", args }).result.content)
    const view = await call({ action: "read", encargo_id: snap.workID, corpus: "fixture",
      referencia: "acta-2026-11-03", artefacto_id: snap.id, archivo: snap.archivo, vista: "linea", limite: 400 })
    assert.equal(view.diagnostico, undefined)
    assert.equal(view.total_lineas, 1, "El JSON conservado es una sola línea")
    assert.equal(view.lineas.length, 1)
    assert.ok(view.lineas[0].contenido.length > 2000 && view.lineas[0].contenido.includes("<table"), "HTML largo íntegro")
    assert.equal(view.lineas[0].contenido, blob!.toString("utf8"))
    assert.equal(view.excede_limite, true)
    const raw = await call({ action: "read", encargo_id: snap.workID, corpus: "fixture",
      referencia: "acta-2026-11-03", artefacto_id: snap.id, archivo: snap.archivo, limite: 50 })
    assert.equal(raw.total, blob!.toString("utf8").length)
    assert.equal(raw.contenido, blob!.toString("utf8").slice(0, 50))
    assert.ok(raw.cursor)
    assert.equal(count, 3, "Tres vueltas del proveedor programado: create, execute y cierre")
    } catch (error) {
      await evidenceWriter(root).save("callback-failure.json", { error: String(error), providerRequests: count })
      await evidenceWriter(root).save("history-failure.json", history.map((message: any) =>
        ({ id: message.id, type: message.type, finish: message.finish,
          parts: (message.content ?? []).map((part: any) => ({ type: part.type, name: part.name, status: part.state?.status })) })))
      throw error
    }
  }, ["capture-test", "planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  await evidenceWriter(root).save("deterministic-verification.json", { ...summary, providerRequests: count,
    realModelCalls: 0, serverExited: true })
  t.diagnostic(`Private server exited; retained PROGRAMMED-only evidence: ${root}`)
})
