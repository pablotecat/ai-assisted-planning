import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { captureSource, sessionArtifacts, sessionWork, type Identity } from "./tools/session_store.ts"
import { sourcePng } from "./tools/source_media.ts"
import { batchBarrier, downloadDecision, simulatedRuntime, tinyPng } from "./test-support/attachments/batch.mjs"

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")

test("S09 9.2 lote: barrera representativa corrige el método una sola vez y el fallo no se repite en los demás", async () => {
  const assets: Record<string, Buffer> = { "adjunto-1.png": tinyPng(1), "adjunto-2.png": tinyPng(2), "adjunto-3.png": tinyPng(3) }
  const runtime = simulatedRuntime(assets)
  const batch = await batchBarrier(runtime, Object.keys(assets))
  assert.equal(batch.methodFailures.length, 1, "Solo la sonda representativa falla con el método ausente")
  assert.equal(batch.methodFailures[0].url, "adjunto-1.png")
  assert.equal(batch.methodFailures[0].method, "arrayBuffer", "Método primario documentado que el runtime no ofrece")
  assert.equal(batch.corrections, 1, "La corrección de método ocurre una sola vez")
  assert.deepEqual(batch.results.map(result => result.method), ["bytes", "bytes", "bytes"],
    "La alternativa se valida en el mismo adjunto y se extiende al lote")
  assert.equal(runtime.trace.methodCalls.filter(call => call.method === "arrayBuffer").length, 1,
    "El método ausente no se reintenta en los otros archivos")
  assert.deepEqual(runtime.trace.downloads, Object.keys(assets),
    "Cada archivo se descarga una sola vez; la sonda no se repite para validar la alternativa")
  for (const result of batch.results) {
    const bytes = Buffer.from(result.base64, "base64")
    assert.deepEqual(bytes, assets[result.url])
    assert.deepEqual(sourcePng(result.base64), bytes, "Los bytes completos superan la validación de transporte")
  }
})

test("S09 9.2 control: runtime con arrayBuffer no corrige; una fuente no disponible queda pendiente por sí sola", async () => {
  const assets: Record<string, Buffer> = { "adjunto-1.png": tinyPng(4), "adjunto-2.png": tinyPng(5) }
  const runtime = simulatedRuntime(assets)
  for (const url of Object.keys(assets)) runtime.offerArrayBuffer(url)
  const batch = await batchBarrier(runtime, [...Object.keys(assets), "desconocido.png"])
  assert.equal(batch.corrections, 0)
  assert.equal(batch.methodFailures.length, 0, "Con el método disponible no hay fallo que corregir")
  assert.deepEqual(batch.results.map(result => result.url), Object.keys(assets))
  assert.deepEqual(batch.pendientes, [{ url: "desconocido.png", etapa: "descargar", estado: 404 }],
    "La fuente no disponible deja pendiente propio; las partes independientes continúan")
})

test("S09 9.3 decisión: copia válida reutilizada aunque caduque la URL; causas de nueva descarga; sin autorización no hay descarga", () => {
  const cases: [Record<string, string | boolean>, Record<string, string>][] = [
    [{ copia: "valida", url: "caducada" }, { accion: "reutilizar_copia" }],
    [{ copia: "valida", url: "valida" }, { accion: "reutilizar_copia" }],
    [{ copia: "ausente", url: "caducada" }, { accion: "recuperar_localizador", causa: "url_caducada_sin_copia" }],
    [{ copia: "ausente", url: "valida" }, { accion: "nueva_descarga", causa: "sin_copia_registrada" }],
    [{ copia: "alterada", url: "valida" }, { accion: "nueva_descarga", causa: "copia_alterada" }],
    [{ copia: "valida", url: "valida", version: "distinta" }, { accion: "nueva_descarga", causa: "version_distinta" }],
    [{ copia: "valida", url: "valida", alcance: "ampliado" }, { accion: "nueva_descarga", causa: "cambio_de_alcance" }],
  ]
  for (const [state, expected] of cases)
    assert.deepEqual(downloadDecision(state as never), expected, JSON.stringify(state))
  // Un ID, ruta o hash por sí solo no concede acceso: sin autorización no se descarga ni se reutiliza.
  assert.deepEqual(downloadDecision({ copia: "valida", url: "valida", autorizado: false }),
    { accion: "rechazar", causa: "sin_acceso_autorizado" })
})

test("S09 9.3 integración: copia accesible con URL caducada reutiliza; sin copia exige localizador; guardado desactivado sin archivos ocultos", async () => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s09-batch-"))
  const settingsPath = join(root, "settings.json"), directory = join(root, "project")
  const nodes: Record<string, Identity> = Object.fromEntries([
    ["i", "investigador", undefined], ["docs", "lector-documentacion", "i"],
  ].map(([id, agent, parentID]) => [id!, { id: id!, agent: agent!, ...(parentID ? { parentID } : {}), directory, title: "Lote", created: 1 }]))
  const options = { root: join(root, "sessions"), settingsPath, get: async (id: string) => nodes[id] }
  const actor = (id: string) => ({ sessionID: id, agent: nodes[id].agent })
  const settings = await readAgentSettings(settingsPath)
  const work: any = await sessionWork({ action: "create", pregunta: "Leer adjuntos", criterios: [], corpus: "fixture",
    referencia: "v1", responsable_session_id: "docs" }, actor("i"), options)
  const base = { encargo_id: work.encargo.id, corpus: "fixture", referencia: "v1" }
  const runtime = simulatedRuntime({ "APP-9:attachment:1": tinyPng(7), "APP-9:attachment:2": tinyPng(8) })
  runtime.expire("APP-9:attachment:2")

  // Descarga y captura en el mismo paso, con el método validado por la barrera:
  const response = await runtime.fetch("APP-9:attachment:1")
  assert.equal(response.status, 200)
  const original = (await response.bytes()).toBase64()
  const captured: any = await captureSource({ ...base, fuente: "APP-9:attachment:1", operacion_id: "batch-1",
    representacion: "png_base64", resultado: original, pendientes: ["lectura visual"] }, actor("docs"), options)
  assert.equal(captured.contenido.sha256, hash(tinyPng(7)))

  // URL caducada con copia válida: se reutiliza la copia sin nueva descarga.
  runtime.expire("APP-9:attachment:1")
  assert.deepEqual(downloadDecision({ copia: "valida", url: "caducada" }), { accion: "reutilizar_copia" })
  const request = { ...base, action: "read" as const, artefacto_id: captured.instantanea_id, archivo: captured.archivo }
  const reused: any = await sessionArtifacts(request, actor("docs"), options)
  assert.equal(reused.media.uri, "data:image/png;base64," + original)
  assert.equal(runtime.trace.downloads.length, 1, "La lectura de la copia válida no repite la descarga con la URL caducada")
  await assert.rejects(sessionArtifacts(request, actor("i"), options), /no asignado/,
    "El Investigador no reutiliza fuentes crudas del lector aunque la copia exista")

  // URL caducada sin copia: exige recuperar un localizador autorizado, con su causa registrada.
  const failed = await runtime.fetch("APP-9:attachment:2")
  assert.equal(failed.ok, false)
  assert.deepEqual(downloadDecision({ copia: "ausente", url: "caducada" }),
    { accion: "recuperar_localizador", causa: "url_caducada_sin_copia" })
  const withoutCopy = await readdir(options.root, { recursive: true })
  assert.equal(withoutCopy.filter(path => path.endsWith(hash(tinyPng(8)))).length, 0, "Sin copia no hay blob del adjunto no capturado")

  // Localizador renovado autorizado: una única nueva descarga y captura confirmada.
  runtime.renew("APP-9:attachment:2")
  const renewed = await runtime.fetch("APP-9:attachment:2")
  assert.deepEqual(downloadDecision({ copia: "ausente", url: "valida" }), { accion: "nueva_descarga", causa: "sin_copia_registrada" })
  const second: any = await captureSource({ ...base, fuente: "APP-9:attachment:2", operacion_id: "batch-2",
    representacion: "png_base64", resultado: (await renewed.bytes()).toBase64(), pendientes: ["lectura visual"] }, actor("docs"), options)
  assert.equal(second.contenido.sha256, hash(tinyPng(8)))
  assert.equal(runtime.trace.downloads.filter(url => url === "APP-9:attachment:2").length, 2,
    "Solo el intento fallido de la URL caducada y la descarga del localizador renovado")

  // Guardado desactivado: la captura devuelve exactamente {guardado:false} sin archivos ocultos.
  const tree = await readdir(options.root, { recursive: true })
  settings.agentes["lector-documentacion"].guardarEntregablesEnSesion = false
  await writeFile(settingsPath, JSON.stringify(settings))
  assert.deepEqual(await captureSource({ ...base, fuente: "APP-9:attachment:3", operacion_id: "batch-off",
    representacion: "png_base64", resultado: tinyPng(9).toString("base64"), pendientes: ["lectura visual"] }, actor("docs"), options),
    { guardado: false })
  assert.deepEqual(await readdir(options.root, { recursive: true }), tree,
    "Sin binarios ocultos, control nuevo ni copias encubiertas con guardado desactivado")
})
