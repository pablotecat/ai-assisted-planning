import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { hostname, tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { manifest, publishReview, publishSession, type FileOrigin, type Identity, type Verdict } from "./tools/session_store.ts"
import { fileInput } from "./tools/define_tool.ts"
import planningPublisher from "./tools/write_planning_deliverables.ts"

test("arquitecto publica planes versionados y respeta su interruptor de guardado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-architecture-session-"))
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath,
    get: async (id: string): Promise<Identity> => ({ id, agent: "arquitecto",
      title: "Implementación de pagos", created: Date.UTC(2026, 9, 9), directory: dir }) }
  const input = { sessionID: "architecture", agent: "arquitecto", topic: "implementación",
    files: { "plan-implementacion.md": "encargos pendientes" }, sources: ["HISTORIA-1.md", "HISTORIA-2.md"],
    decisions: ["Gestor opcional"] }
  try {
    const first = await publishSession(input, opts)
    assert.equal(first.guardado, true)
    if (!first.guardado) return
    assert.match(first.sesion, /__arquitectura__implementacion-de-pagos/)
    assert.equal(dirname(first.rutas["plan-implementacion.md"]), join(first.sesion, "01-arquitecto"))
    const second = await publishSession({ ...input, files: { "plan-implementacion.md": "plan actualizado" } }, opts)
    assert.equal(second.guardado, true)
    if (!second.guardado) return
    assert.notEqual(first.rutas["plan-implementacion.md"], second.rutas["plan-implementacion.md"])
    assert.equal(await readFile(first.rutas["plan-implementacion.md"], "utf8"), "encargos pendientes")
    assert.equal(await readFile(second.rutas["plan-implementacion.md"], "utf8"), "plan actualizado")
    const index = await readFile(join(first.sesion, "indice.md"), "utf8")
    assert.match(index, /HISTORIA-2\.md/)
    assert.match(index, /Gestor opcional/)
    const settings = await readAgentSettings(settingsPath)
    settings.agentes.arquitecto.guardarEntregablesEnSesion = false
    await writeFile(settingsPath, JSON.stringify(settings))
    assert.deepEqual(await publishSession(input, opts), { guardado: false })
    await assert.rejects(publishSession({ ...input, agent: "planificador" }, opts), /Autor/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("Lector Documentación solo publica delegaciones del Investigador o de Lector Documentación", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-jira-delegation-"))
  const base = { title: "Fuentes Jira", created: Date.UTC(2026, 9, 17), directory: dir }
  const managers = ["investigador", "planificador", "arquitecto"]
  const nodes: Record<string, Identity> = {}
  for (const name of managers) {
    nodes[name] = { ...base, id: name, agent: name }
    nodes[`${name}-docs`] = { ...base, id: `${name}-docs`, parentID: name, agent: "lector-documentacion" }
  }
  nodes.codigo = { ...base, id: "codigo", agent: "lector-codigo" }
  nodes.wrongDocs = { ...base, id: "wrongDocs", parentID: "codigo", agent: "lector-documentacion" }
  nodes.childDocs = { ...base, id: "childDocs", parentID: "investigador-docs", agent: "lector-documentacion" }
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath, get: async (id: string) => nodes[id] }
  const input = { agent: "lector-documentacion", topic: "APP-1", files: { "fuentes-jira.md": "APP-1: texto íntegro" },
    sources: ["https://example.atlassian.net/browse/APP-1"] }
  try {
    for (const name of managers) {
      if (name !== "investigador") {
        await assert.rejects(publishSession({ ...input, sessionID: `${name}-docs` }, opts), /Delegación no autorizada/)
        continue
      }
      const result = await publishSession({ ...input, sessionID: `${name}-docs` }, opts)
      assert.equal(result.guardado, true)
      if (!result.guardado) continue
      assert.equal(await readFile(result.rutas["fuentes-jira.md"], "utf8"), input.files["fuentes-jira.md"])
      assert.equal(dirname(dirname(result.rutas["fuentes-jira.md"])), join(result.sesion, `01-${name}`))
    }
    const child = await publishSession({ ...input, sessionID: "childDocs" }, opts)
    assert.equal(child.guardado, true)
    if (child.guardado) assert.equal(await readFile(child.rutas["fuentes-jira.md"], "utf8"), input.files["fuentes-jira.md"])
    await assert.rejects(publishSession({ ...input, sessionID: "wrongDocs" }, opts), /Delegación no autorizada/)
    const settings = await readAgentSettings(settingsPath)
    settings.agentes.investigador.especialistasPermitidos = ["lector-codigo"]
    await writeFile(settingsPath, JSON.stringify(settings))
    for (const name of managers)
      await assert.rejects(publishSession({ ...input, sessionID: `${name}-docs` }, opts),
        name === "investigador" ? /Especialista deshabilitado/ : /Delegación no autorizada/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("Arquitecto → Test → Revisor conserva versiones y revisa el archivo exacto del productor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-test-flow-"))
  const base = { title: "Historia UI", created: Date.UTC(2026, 9, 12), directory: dir }
  const nodes: Record<string, Identity> = {
    architect: { ...base, id: "architect", agent: "arquitecto" },
    test: { ...base, id: "test", parentID: "architect", agent: "arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "revisor" },
    globalReview: { ...base, id: "globalReview", parentID: "architect", agent: "revisor" },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string) => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  const input = { sessionID: "test", agent: "arquitecto-test", topic: "HISTORIA-1",
    files: { "borrador-tests.md": "TC-1: actualizar el resultado esperado. Revisión solicitada: 1." },
    sources: ["HISTORIA-1.md", "tests/flujo-ui.ts"] }
  try {
    const first = await publishSession(input, opts)
    assert.equal(first.guardado, true)
    if (!first.guardado) return
    assert.equal(dirname(first.rutas["borrador-tests.md"]), join(first.sesion, "01-arquitecto", "01-arquitecto-test__historia-ui"))
    const review = await publishReview({ sessionID: "review", delivery: first.rutas["borrador-tests.md"],
      sanity: "Intento 1: TC-1 pendiente; falta justificar el resultado." }, opts)
    assert.equal(review.guardado, true)
    if (!review.guardado) return
    assert.equal(review.sesion, first.sesion)
    const firstReview = Object.values(review.rutas)[0]
    assert.equal(dirname(firstReview), dirname(first.rutas["borrador-tests.md"]))
    assert.match(firstReview, /01-borrador-tests-sanity-check\.md$/)

    const corrected = "TC-1: resultado fundamentado en CA-1. Intentos consumidos: 1. Revisión solicitada: 2."
    const second = await publishSession({ ...input, files: { "borrador-tests.md": corrected } }, opts)
    assert.equal(second.guardado, true)
    if (!second.guardado) return
    assert.notEqual(second.rutas["borrador-tests.md"], first.rutas["borrador-tests.md"])
    const secondReview = await publishReview({ sessionID: "review", delivery: second.rutas["borrador-tests.md"],
      sanity: "Intento 2: TC-1 aprobado; comprobado CA-1." }, opts)
    assert.equal(secondReview.guardado, true)
    if (!secondReview.guardado) return
    assert.notEqual(Object.values(secondReview.rutas)[0], firstReview)
    assert.equal(await readFile(first.rutas["borrador-tests.md"], "utf8"), input.files["borrador-tests.md"])
    assert.equal(await readFile(firstReview, "utf8"), "Intento 1: TC-1 pendiente; falta justificar el resultado.")
    assert.equal(await readFile(second.rutas["borrador-tests.md"], "utf8"), corrected)
    await assert.rejects(publishReview({ sessionID: "review", delivery: first.rutas["borrador-tests.md"], sanity: "Reemplazo" }, opts), { code: "EEXIST" })
    await assert.rejects(publishReview({ sessionID: "globalReview", delivery: second.rutas["borrador-tests.md"], sanity: "Ajeno" }, opts), /no pertenece/)

    const integrated = await publishSession({ sessionID: "architect", agent: "arquitecto", topic: "Plan UI",
      files: { "plan-implementacion.md": "TC-1 aprobado con su revisión exacta; Backend y Frontend pendientes." } }, opts)
    assert.equal(integrated.guardado, true)
    if (!integrated.guardado) return
    assert.equal(integrated.sesion, first.sesion)
    const globalReview = await publishReview({ sessionID: "globalReview", delivery: integrated.rutas["plan-implementacion.md"],
      sanity: "Plan parcial coherente." }, opts)
    assert.equal(globalReview.guardado, true)
    const index = await readFile(join(first.sesion, "indice.md"), "utf8")
    assert.match(index, /tests\/flujo-ui\.ts/)
    assert.match(index, /02-borrador-tests\.md/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("Test exige padre arquitecto y respeta los interruptores de publicación y revisión", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-test-ownership-"))
  const base = { title: "UI", created: Date.now(), directory: dir }
  const nodes: Record<string, Identity> = {
    architect: { ...base, id: "architect", agent: "arquitecto" },
    investigator: { ...base, id: "investigator", agent: "investigador" },
    direct: { ...base, id: "direct", agent: "arquitecto-test" },
    wrongParent: { ...base, id: "wrongParent", parentID: "investigator", agent: "arquitecto-test" },
    test: { ...base, id: "test", parentID: "architect", agent: "arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "revisor" },
  }
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath, get: async (id: string) => nodes[id] }
  const input = { sessionID: "test", agent: "arquitecto-test", topic: "UI", files: { "borrador-tests.md": "Caso UI" } }
  try {
    await assert.rejects(publishSession({ ...input, sessionID: "direct" }, opts), /requiere delegación/)
    await assert.rejects(publishSession({ ...input, sessionID: "wrongParent" }, opts), /no autorizada/)
    const settings = await readAgentSettings(settingsPath)
    settings.agentes["arquitecto-test"].guardarEntregablesEnSesion = false
    await writeFile(settingsPath, JSON.stringify(settings))
    assert.deepEqual(await publishSession(input, opts), { guardado: false })
    await assert.rejects(stat(opts.root), { code: "ENOENT" })

    settings.agentes["arquitecto-test"].guardarEntregablesEnSesion = true
    settings.agentes.revisor.guardarEntregablesEnSesion = false
    await writeFile(settingsPath, JSON.stringify(settings))
    const publication = await publishSession(input, opts)
    assert.equal(publication.guardado, true)
    if (!publication.guardado) return
    assert.deepEqual(await publishReview({ sessionID: "review", delivery: publication.rutas["borrador-tests.md"], sanity: "Dictamen" }, opts), { guardado: false })
    await assert.rejects(readFile(join(dirname(publication.rutas["borrador-tests.md"]), "01-borrador-tests-sanity-check.md"), "utf8"), { code: "ENOENT" })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("originales y revisión pertenecen a la misma sesión y no se sobrescriben", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-session-"))
  const nodes: Record<string, Identity> = {
    plan: { id: "plan", agent: "planificador", title: "Planificación de pagos", created: Date.UTC(2026, 8, 30), directory: dir },
    review: { id: "review", parentID: "plan", agent: "revisor", title: "Revisión", created: 1, directory: dir },
    other: { id: "other", agent: "lector-codigo", title: "Consulta", created: 1, directory: dir },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string) => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  try {
    const originals = await publishSession({ sessionID: "plan", agent: "planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Requisito recibido" } }, opts)
    assert.equal(originals.guardado, true)
    if (!originals.guardado) return
    await assert.rejects(publishSession({ sessionID: "plan", agent: "planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Modificado" } }, opts), /ya están publicados/)
    await assert.rejects(publishSession({ sessionID: "other", agent: "lector-codigo", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Ajeno" } }, opts), /Solo el planificador/)
    const first = await publishSession({ sessionID: "plan", agent: "planificador", topic: "Pagos",
      group: "entrega", files: { "PAGO-1.md": "Historia refinada" } }, opts)
    assert.equal(first.guardado, true)
    if (!first.guardado) return
    const delivery = dirname(first.rutas["PAGO-1.md"])
    const sanity = await publishReview({ sessionID: "review", delivery, sanity: "Cobertura revisada" }, opts)
    assert.equal(sanity.guardado, true)
    if (!sanity.guardado) return
    assert.equal(await readFile(sanity.rutas["sanity-check.md"], "utf8"), "Cobertura revisada")
    await assert.rejects(publishReview({ sessionID: "review", delivery, sanity: "Reemplazo" }, opts), { code: "EEXIST" })
    await assert.rejects(publishReview({ sessionID: "other", delivery, sanity: "Ajeno" }, opts), /Revisor delegado/)
    assert.equal(await readFile(originals.rutas["PAGO-1.md"], "utf8"), "Requisito recibido")
  } finally { await rm(dir, { recursive: true, force: true }) }
})

async function transactionFixture() {
  const dir = await mkdtemp(join(tmpdir(), "publication-transaction-"))
  const base = { title: "Publicación", created: Date.UTC(2026, 9, 31), directory: dir }
  const nodes: Record<string, Identity> = {
    plan: { ...base, id: "plan", agent: "planificador" },
    review: { ...base, id: "review", parentID: "plan", agent: "revisor" },
    other: { ...base, id: "other", parentID: "plan", agent: "refinador" },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"), get: async (id: string) => nodes[id] }
  const id = createHash("sha256").update(dir + "\0plan").digest("hex")
  const stateDir = join(opts.root, ".control", id)
  const stateFile = join(stateDir, "state.json")
  const input = { sessionID: "plan", agent: "planificador", topic: "APP-1", operationID: "entrega-1",
    group: "entrega", files: { "APP-1.md": "Historia íntegra\r\nñ", "incidencias.md": "Pendientes" } }
  return { dir, nodes, opts, input, stateDir, stateFile, state: async () => JSON.parse(await readFile(stateFile, "utf8")) }
}

test("control legacy: copia exacta, extensión aditiva y versión futura rechazada sin reescritura", async () => {
  const f = await transactionFixture()
  try {
    await mkdir(f.stateDir, { recursive: true })
    const owner = join(f.opts.root, "historica", "01-planificador")
    await mkdir(join(owner, "entrega"), { recursive: true })
    await writeFile(join(owner, "entrega", "APP-1.md"), "Historia anterior")
    await writeFile(join(owner, "entrega", "sanity-check.md"), "Aprobada narrativamente")
    const old = JSON.stringify({ root: "historica", entries: { plan: { agent: "planificador", folder: "01-planificador" } },
      deliveries: ["01-planificador/entrega"], sources: ["Fuente histórica"], decisions: ["Decisión anterior"], keys: ["APP-1"],
      custom: { preserved: true } }, null, "\t") + "\r\n"
    await writeFile(f.stateFile, old)
    const result = await publishSession(f.input, f.opts)
    assert.equal(result.guardado, true)
    if (!result.guardado) return
    assert.match(result.rutas["APP-1.md"], /entrega-02/)
    assert.equal(await readFile(join(f.stateDir, "state.v0.json"), "utf8"), old)
    const current = await f.state()
    assert.equal(current.schemaVersion, 1)
    assert.deepEqual(current.custom, { preserved: true })
    assert.deepEqual(current.deliveries, ["01-planificador/entrega", "01-planificador/entrega-02"])
    assert.deepEqual(current.sources, ["Fuente histórica"])
    assert.deepEqual(current.decisions, ["Decisión anterior"])
    assert.equal(Object.keys(current.artifacts).length, 1, "no se importa autoría o aprobación histórica por inferencia")
    assert.equal(current.artifacts[result.artefacto_id].previous, undefined)
    assert.equal(current.artifacts[result.artefacto_id].workID, undefined)
    assert.equal(current.artifacts[result.artefacto_id].approval, undefined)
    assert.equal(await readFile(join(owner, "entrega", "APP-1.md"), "utf8"), "Historia anterior")
    assert.equal(await readFile(join(owner, "entrega", "sanity-check.md"), "utf8"), "Aprobada narrativamente")
    // Old reports remain reviewable without being promoted to structured verdicts.
    const dispute = await publishReview({ sessionID: "review", delivery: join(owner, "entrega"), dispute: "Reserva" }, f.opts)
    assert.equal(dispute.guardado, true)
    const future = JSON.stringify({ ...await f.state(), schemaVersion: 999, future: { keep: true } })
    await writeFile(f.stateFile, future)
    await assert.rejects(publishSession({ ...f.input, operationID: "otra" }, f.opts), /Versión de control no soportada/)
    await assert.rejects(publishReview({ sessionID: "review", delivery: join(owner, "entrega"), sanity: "Otro" }, f.opts), /Versión de control no soportada/)
    assert.equal(await readFile(f.stateFile, "utf8"), future)
    assert.equal(await readFile(join(f.stateDir, "state.v0.json"), "utf8"), old)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("manifiesto determinista de bytes, revisión separada y detección de cambios o archivos no registrados", async () => {
  assert.deepEqual(manifest({ "b.md": "b", "a.md": "ñ\r\n" }), manifest({ "a.md": "ñ\r\n", "b.md": "b" }))
  assert.notEqual(manifest({ "a.md": "ñ\r\n" }).hash, manifest({ "a.md": "ñ\n" }).hash)
  assert.equal(manifest({ "a.md": "ñ" }).files[0].bytes, 2)
  const f = await transactionFixture()
  try {
    const result = await publishSession(f.input, f.opts)
    assert.ok(result.guardado)
    const before = (await f.state()).artifacts[result.artefacto_id]
    const review = await publishReview({ sessionID: "review", operationID: "revision-1", delivery: dirname(result.rutas["APP-1.md"]), sanity: "Revisada" }, f.opts)
    assert.ok(review.guardado)
    assert.deepEqual(await publishSession(f.input, f.opts), result)
    assert.deepEqual((await f.state()).artifacts[result.artefacto_id], before)
    assert.ok(before.files.every((file: any) => !/sanity-check|disputa/.test(file.path)))
    await writeFile(join(dirname(result.rutas["APP-1.md"]), "extra.md"), "No registrado")
    await assert.rejects(publishSession(f.input, f.opts), /Archivos no registrados/)
    await rm(join(dirname(result.rutas["APP-1.md"]), "extra.md"))
    await writeFile(result.rutas["APP-1.md"], "Cambio externo")
    await assert.rejects(publishSession(f.input, f.opts), /modificado externamente/)
    await assert.rejects(publishReview({ sessionID: "review", delivery: dirname(result.rutas["APP-1.md"]), dispute: "Disputa" }, f.opts), /modificado externamente/)
    assert.deepEqual((await f.state()).artifacts[result.artefacto_id], before)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("identidad lógica: mismo resultado, conflicto, corrección completa y alcance por productor/tipo/raíz", async () => {
  const f = await transactionFixture()
  try {
    const first = await publishSession(f.input, f.opts)
    assert.ok(first.guardado)
    const reversed = { ...f.input, messageID: "otro-turno", files: Object.fromEntries(Object.entries(f.input.files).reverse()) }
    assert.deepEqual(await publishSession(reversed, f.opts), first)
    await assert.rejects(publishSession({ ...f.input, files: { ...f.input.files, "APP-1.md": "Distinta" } }, f.opts), /contenido distinto/)
    await assert.rejects(publishSession({ ...f.input, sources: ["Otra fuente"] }, f.opts), /contenido distinto/)
    const correction = await publishSession({ ...f.input, operationID: "correccion-1", files: { ...f.input.files, "APP-1.md": "Corregida" } }, f.opts)
    assert.ok(correction.guardado)
    assert.notEqual(correction.artefacto_id, first.artefacto_id)
    assert.match(correction.rutas["APP-1.md"], /entrega-02/)
    assert.equal(await readFile(first.rutas["APP-1.md"], "utf8"), f.input.files["APP-1.md"])
    assert.equal(await readFile(correction.rutas["incidencias.md"], "utf8"), "Pendientes")
    assert.equal((await f.state()).artifacts[correction.artefacto_id].previous, first.artefacto_id)
    const distinctType = await publishSession({ ...f.input, publicationType: "otro-publicador" }, f.opts)
    const distinctProducer = await publishSession({ ...f.input, sessionID: "other", agent: "refinador" }, f.opts)
    f.nodes.root2 = { ...f.nodes.plan, id: "root2" }
    const distinctRoot = await publishSession({ ...f.input, sessionID: "root2" }, f.opts)
    for (const result of [distinctType, distinctProducer, distinctRoot]) {
      assert.ok(result.guardado)
      assert.notEqual(result.artefacto_id, first.artefacto_id)
    }
    await assert.rejects(publishSession({ ...f.input, agent: "refinador" }, f.opts), /Autor/)
    await assert.rejects(publishSession({ ...f.input, operationID: "../operacion" }, f.opts), /Identidad lógica/)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("originales: la operación estable se reintenta, otra identidad no los reemplaza", async () => {
  const f = await transactionFixture()
  try {
    const input = { ...f.input, group: "Originales" }
    const first = await publishSession(input, f.opts)
    assert.deepEqual(await publishSession(input, f.opts), first)
    await assert.rejects(publishSession({ ...input, operationID: "correccion" }, f.opts), /ya están publicados/)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("llamada literal sin identidad conserva nuevas versiones; su ID devuelto permite reparar si se recibió", async () => {
  const f = await transactionFixture()
  try {
    const input = { ...f.input, operationID: undefined }
    const first = await publishSession(input, f.opts)
    const second = await publishSession(input, f.opts)
    assert.ok(first.guardado && second.guardado)
    assert.notEqual(first.artefacto_id, second.artefacto_id)
    assert.notEqual(first.operacion_id, second.operacion_id)
    assert.deepEqual(await publishSession({ ...input, operationID: first.operacion_id }, f.opts), first)
    assert.equal(Object.keys((await f.state()).artifacts).length, 2)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("commit: interrupciones entre fases y archivos se reconcilian una sola vez", async () => {
  for (const group of [undefined, "entrega"]) for (const phase of ["prepared", "file:APP-1.md", "file:incidencias.md", "materialized", "confirmed"]) {
    const f = await transactionFixture()
    const input = { ...f.input, group }
    try {
      await assert.rejects(publishSession(input, { ...f.opts, checkpoint: async point => {
        if (point === phase) throw new Error("Interrupción inyectada")
      } }), /Interrupción inyectada/)
      const interrupted = await f.state()
      const operation: any = Object.values(interrupted.operations)[0]
      assert.equal(Object.keys(interrupted.artifacts).length, phase === "confirmed" ? 1 : 0)
      assert.equal(interrupted.deliveries.length, phase === "confirmed" ? (group ? 1 : 2) : 0)
      if (phase !== "confirmed") await assert.rejects(publishSession({ ...input, operationID: "otra" }, f.opts), /Publicación interrumpida pendiente/)
      const result = await publishSession(input, f.opts)
      assert.ok(result.guardado)
      assert.deepEqual(result.rutas, operation.paths)
      assert.equal(result.artefacto_id, operation.artifact.id)
      assert.equal(result.hash_manifiesto, operation.artifact.manifestHash)
      assert.deepEqual(await publishSession(input, f.opts), result)
      const confirmed = await f.state()
      assert.equal(Object.keys(confirmed.operations).length, 1)
      assert.equal(Object.keys(confirmed.artifacts).length, 1)
      for (const [name, content] of Object.entries(input.files)) assert.equal(await readFile(result.rutas[name], "utf8"), content)
      assert.match(await readFile(join(result.sesion, "indice.md"), "utf8"), /APP-1|entrega/)
    } finally { await rm(f.dir, { recursive: true, force: true }) }
  }
})

test("commit: destinos ajenos con bytes iguales y carpeta sin identidad no se adoptan ni borran", async () => {
  for (const group of [undefined, "entrega"]) {
    const f = await transactionFixture()
    try {
      const input = { ...f.input, group }
      let foreign = ""
      await assert.rejects(publishSession(input, { ...f.opts, checkpoint: async phase => {
        if (phase !== "prepared") return
        const operation: any = Object.values((await f.state()).operations)[0]
        foreign = group ? dirname(operation.paths["APP-1.md"]) : operation.paths["APP-1.md"]
        if (group) await mkdir(foreign)
        else await writeFile(foreign, input.files["APP-1.md"], { flag: "wx" })
        throw new Error("Corte")
      } }), /Corte/)
      await assert.rejects(publishSession(input, f.opts), /Destino reservado ajeno/)
      assert.ok(await stat(foreign))
      if (!group) assert.equal(await readFile(foreign, "utf8"), input.files["APP-1.md"])
      assert.equal(Object.keys((await f.state()).artifacts).length, 0)
    } finally { await rm(f.dir, { recursive: true, force: true }) }
  }
  const f = await transactionFixture()
  try {
    await assert.rejects(publishSession(f.input, { ...f.opts, checkpoint: phase => {
      if (phase === "directory-created") throw new Error("Corte antes de registrar propiedad")
    } }), /Corte/)
    await assert.rejects(publishSession(f.input, f.opts), /Destino reservado ajeno/)
    assert.equal(Object.keys((await f.state()).artifacts).length, 0)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("commit: preparación alterada y archivo propio modificado no se confirman", async () => {
  for (const phase of ["prepared", "file:APP-1.md"]) {
    const f = await transactionFixture()
    try {
      await assert.rejects(publishSession(f.input, { ...f.opts, checkpoint: async point => {
        if (point !== phase) return
        const operation: any = Object.values((await f.state()).operations)[0]
        await writeFile(phase === "prepared" ? join(f.stateDir, operation.stage, "APP-1.md") : operation.paths["APP-1.md"], "Alteración")
        throw new Error("Corte")
      } }), /Corte/)
      await assert.rejects(publishSession(f.input, f.opts), /Preparación alterada/)
      assert.equal(Object.keys((await f.state()).artifacts).length, 0)
    } finally { await rm(f.dir, { recursive: true, force: true }) }
  }
})

test("fallo real del índice conserva la confirmación y el reintento repara solo la proyección", async () => {
  const f = await transactionFixture()
  try {
    const result = await publishSession(f.input, { ...f.opts, checkpoint: async phase => {
      if (phase === "confirmed") await mkdir(join(f.opts.root, (await f.state()).root, "indice.md"))
    } })
    assert.ok(result.guardado)
    assert.equal(result.indice?.actualizado, false)
    assert.equal(await readFile(result.rutas["APP-1.md"], "utf8"), f.input.files["APP-1.md"])
    assert.equal(Object.keys((await f.state()).artifacts).length, 1)
    assert.equal(Object.values<any>((await f.state()).operations)[0].phase, "confirmed")
    await rm(join(result.sesion, "indice.md"), { recursive: true })
    const repaired = await publishSession(f.input, f.opts)
    assert.ok(repaired.guardado)
    assert.equal(repaired.indice, undefined)
    assert.deepEqual(repaired.rutas, result.rutas)
    assert.equal(repaired.artefacto_id, result.artefacto_id)
    assert.equal(repaired.hash_manifiesto, result.hash_manifiesto)
    assert.match(await readFile(join(repaired.sesion, "indice.md"), "utf8"), /01-planificador\/entrega/)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("revisión: interrupción entre informes, reintento y conflicto sin dictamen inferido", async () => {
  const f = await transactionFixture()
  try {
    const producer = await publishSession(f.input, f.opts)
    assert.ok(producer.guardado)
    const input = { sessionID: "review", operationID: "revision", delivery: dirname(producer.rutas["APP-1.md"]), sanity: "Informe", dispute: "Disputa" }
    await assert.rejects(publishReview(input, { ...f.opts, checkpoint: phase => {
      if (phase === "file:sanity-check.md") throw new Error("Interrupción")
    } }), /Interrupción/)
    const review = await publishReview(input, f.opts)
    assert.ok(review.guardado)
    assert.deepEqual(await publishReview(input, f.opts), review)
    await assert.rejects(publishReview({ ...input, sanity: "Otro" }, f.opts), /contenido distinto/)
    assert.deepEqual(await publishSession(f.input, f.opts), producer)
    const artifact = (await f.state()).artifacts[review.artefacto_id]
    assert.equal(artifact.producerSessionID, "review")
    assert.equal(artifact.origin.delivery, relative(producer.sesion, input.delivery).replace(/\\/g, "/"))
    assert.equal(artifact.verdict, undefined)
    assert.equal(artifact.approval, undefined)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

function publicationProcess(f: Awaited<ReturnType<typeof transactionFixture>>, stopAt?: string, announce = false) {
  const code = `
    import { publishSession } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "tools/session_store.ts")).href)};
    const { input, nodes, root, settingsPath, stopAt, announce } = JSON.parse(process.env.PUBLICATION_FIXTURE);
    if (announce) process.send({ starting: true });
    const result = await publishSession(input, { root, settingsPath, get: async id => nodes[id], checkpoint: async phase => {
      if (phase !== stopAt) return;
      process.send({ stopped: phase });
      await new Promise(resolve => process.once("message", resolve));
    } });
    process.send({ result });
  `
  const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env,
    PUBLICATION_FIXTURE: JSON.stringify({ input: f.input, nodes: f.nodes, root: f.opts.root, settingsPath: f.opts.settingsPath, stopAt, announce }) },
    stdio: ["ignore", "pipe", "pipe", "ipc"] })
  let stderr = ""
  child.stderr!.on("data", data => { stderr += data })
  const exit = once(child, "exit")
  const message = Promise.race([
    once(child, "message").then(([message]) => message as any),
    exit.then(([code]) => { throw new Error(`Publicador hijo terminó antes de responder (${code}): ${stderr}`) }),
  ])
  return { child, message, exit }
}

test("bloqueo: proceso interrumpido y dos reintentos en procesos concurrentes producen una sola entrega", { timeout: 20_000 }, async () => {
  const f = await transactionFixture()
  const workers: ReturnType<typeof publicationProcess>[] = []
  try {
    const interrupted = publicationProcess(f, "file:APP-1.md")
    workers.push(interrupted)
    assert.equal((await interrupted.message).stopped, "file:APP-1.md")
    const lock = JSON.parse(await readFile(join(f.stateDir, ".lock", "owner.json"), "utf8"))
    assert.equal(lock.pid, interrupted.child.pid)
    interrupted.child.kill("SIGKILL")
    await interrupted.exit
    const left = publicationProcess(f, "prepared")
    workers.push(left)
    assert.equal((await left.message).stopped, "prepared")
    const right = publicationProcess(f, undefined, true)
    workers.push(right)
    assert.equal((await right.message).starting, true, "el segundo reintento comienza con el primero aún bajo bloqueo")
    const leftResult = once(left.child, "message")
    const rightResult = once(right.child, "message")
    left.child.send({ continue: true })
    const [[a], [b]] = await Promise.all([leftResult, rightResult])
    await Promise.all([left.exit, right.exit])
    assert.deepEqual(a.result, b.result)
    assert.ok(a.result.guardado)
    const state = await f.state()
    assert.equal(state.deliveries.length, 1)
    assert.equal(Object.keys(state.artifacts).length, 1)
    assert.equal(Object.keys(state.operations).length, 1)
    assert.equal(await readFile(a.result.rutas["APP-1.md"], "utf8"), f.input.files["APP-1.md"])
    assert.deepEqual(await publishSession(f.input, f.opts), a.result)
    const abandoned = (await readdir(f.stateDir)).find(name => name.startsWith(".lock.abandoned-"))
    assert.ok(abandoned, "se conserva el descriptor del bloqueo recuperado")
    assert.equal(JSON.parse(await readFile(join(f.stateDir, abandoned, "owner.json"), "utf8")).token, lock.token)
  } finally {
    for (const worker of workers) if (worker.child.exitCode === null && worker.child.signalCode === null) worker.child.kill("SIGKILL")
    await Promise.allSettled(workers.map(worker => worker.exit))
    await rm(f.dir, { recursive: true, force: true })
  }
})

test("bloqueo: propietario activo, otro host y bloqueo sin descriptor se conservan por seguridad", { timeout: 15_000 }, async () => {
  await Promise.all(["active", "other-host", "legacy"].map(async kind => {
    const f = await transactionFixture()
    try {
      await mkdir(join(f.stateDir, ".lock"), { recursive: true })
      const owner = { pid: process.pid, host: kind === "other-host" ? "unverified-host" : hostname(), token: randomUUID() }
      const content = JSON.stringify(owner)
      if (kind !== "legacy") await writeFile(join(f.stateDir, ".lock", "owner.json"), content)
      await assert.rejects(publishSession(f.input, f.opts), /no se pudo demostrar/)
      assert.ok((await stat(join(f.stateDir, ".lock"))).isDirectory())
      if (kind !== "legacy") assert.equal(await readFile(join(f.stateDir, ".lock", "owner.json"), "utf8"), content)
      await assert.rejects(readFile(f.stateFile), { code: "ENOENT" })
    } finally { await rm(f.dir, { recursive: true, force: true }) }
  }))
})

test("guardado desactivado no crea control y no recupera ni modifica operaciones existentes", async () => {
  const f = await transactionFixture()
  try {
    const settings = await readAgentSettings(f.opts.settingsPath)
    settings.agentes.planificador.guardarEntregablesEnSesion = false
    settings.agentes.revisor.guardarEntregablesEnSesion = false
    await writeFile(f.opts.settingsPath, JSON.stringify(settings))
    assert.deepEqual(await publishSession(f.input, f.opts), { guardado: false })
    assert.deepEqual(await publishReview({ sessionID: "review", delivery: join(f.dir, "no-existe"), sanity: "Informe", operationID: "review" }, f.opts), { guardado: false })
    await assert.rejects(stat(f.opts.root), { code: "ENOENT" })
    settings.agentes.planificador.guardarEntregablesEnSesion = true
    await writeFile(f.opts.settingsPath, JSON.stringify(settings))
    const saved = await publishSession(f.input, f.opts)
    assert.ok(saved.guardado)
    const before = await readFile(f.stateFile)
    settings.agentes.planificador.guardarEntregablesEnSesion = false
    await writeFile(f.opts.settingsPath, JSON.stringify(settings))
    assert.deepEqual(await publishSession(f.input, f.opts), { guardado: false })
    assert.deepEqual(await readFile(f.stateFile), before)
    assert.equal(await readFile(saved.rutas["APP-1.md"], "utf8"), f.input.files["APP-1.md"])
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

function originFor(state: any, artifactID: string, name: string): FileOrigin {
  const artifact = state.artifacts[artifactID]
  const file = artifact.files.find((file: any) => file.path.endsWith(`/${name}`))
  assert.ok(file, name)
  return { artefacto_id: artifact.id, archivo: file.path, sha256: file.sha256 }
}

test("promoción completa: cinco archivos idénticos, procedencia, reintento y exclusión literal por archivo", async () => {
  const f = await transactionFixture()
  try {
    const input = { ...f.input, publicationType: "write_planning_deliverables", files: {
      "APP-1.md": "\uFEFFHistoria 1\r\nñ\n", "APP-1-incidencias.md": "INC-1\r\n",
      "APP-2.md": "Historia 2\n漢字", "APP-2-incidencias.md": "INC-2\n", "incidencias-globales.md": "Globales\r\n",
    } }
    const first = await publishSession(input, f.opts)
    assert.ok(first.guardado)
    const before = await f.state()
    const files = Object.fromEntries(Object.keys(input.files).map(name => [name, originFor(before, first.artefacto_id, name)]))
    for (const [name, origin] of Object.entries(files)) {
      assert.equal(fileInput(undefined, origin), origin)
      assert.throws(() => fileInput(input.files[name], origin), /exclusivamente/)
    }
    assert.throws(() => fileInput(), /exclusivamente/)
    const promotedInput = { ...input, operationID: "promocion-1", files }
    assert.ok(!JSON.stringify(promotedInput).includes("Historia 1"), "la petición no reemite el contenido")
    const promoted = await publishSession(promotedInput, f.opts)
    assert.ok(promoted.guardado)
    assert.equal(Object.keys(promoted.rutas).length, 5)
    const artifact = (await f.state()).artifacts[promoted.artefacto_id]
    assert.equal(artifact.previous, first.artefacto_id)
    assert.deepEqual(artifact.origin, { type: "promotion", files })
    assert.equal(artifact.producerSessionID, "plan")
    for (const name of Object.keys(input.files)) {
      assert.deepEqual(await readFile(promoted.rutas[name]), await readFile(first.rutas[name]))
      assert.notEqual((await stat(promoted.rutas[name], { bigint: true })).ino, (await stat(first.rutas[name], { bigint: true })).ino,
        "destino independiente del origen")
    }
    assert.deepEqual(await publishSession(promotedInput, f.opts), promoted)
    assert.deepEqual((await f.state()).artifacts[first.artefacto_id], before.artifacts[first.artefacto_id])
    const incomplete = { "APP-1.md": files["APP-1.md"], "APP-1-incidencias.md": files["APP-1-incidencias.md"],
      "incidencias-globales.md": files["incidencias-globales.md"] }
    await assert.rejects(publishSession({ ...promotedInput, operationID: "incompleta", files: incomplete }, f.opts), /todos los archivos/)
    // The real planner also refuses a missing incidents/global file before publication.
    const context = { sessionID: "plan", messageID: "mensaje", agent: "planificador", resolver: f.opts.get }
    await assert.rejects(planningPublisher.execute({ historias: [{ clave: "APP-1", origen_contenido: files["APP-1.md"] }],
      origen_incidencias_globales: files["incidencias-globales.md"] }, context), /exclusivamente/)
    await assert.rejects(planningPublisher.execute({ historias: [{ clave: "APP-1", contenido: "literal",
      origen_contenido: files["APP-1.md"], incidencias: "Ninguna" }], incidencias_globales: "Ninguna" }, context), /exclusivamente/)
    await assert.rejects(planningPublisher.execute({ historias: [{ clave: "APP-1", contenido: "literal", incidencias: "Ninguna" },
      { clave: "APP-1-incidencias", contenido: "literal", incidencias: "Ninguna" }], incidencias_globales: "Ninguna" }, context), /nombres.*únicos/)
    assert.equal(Object.keys((await f.state()).artifacts).length, 2)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("promoción: hash, origen ajeno, traversal, symlink y productor distinto se rechazan antes de preparar", async () => {
  const f = await transactionFixture()
  try {
    const first = await publishSession(f.input, f.opts)
    assert.ok(first.guardado)
    const reference = originFor(await f.state(), first.artefacto_id, "APP-1.md")
    const promotion = { ...f.input, operationID: "promocion", files: { "APP-1.md": reference } }
    const before = await readFile(f.stateFile)
    for (const [origin, error] of [
      [{ ...reference, sha256: "0".repeat(64) }, /Hash de origen incorrecto/],
      [{ ...reference, artefacto_id: "ajeno" }, /origen ajeno/],
      [{ ...reference, archivo: "../../fuera.md" }, /no registrado/],
      [{ ...reference, archivo: first.rutas["APP-1.md"] }, /no registrado/],
    ] as const) await assert.rejects(publishSession({ ...promotion, files: { "APP-1.md": origin } }, f.opts), error)
    await assert.rejects(publishSession({ ...promotion, sessionID: "other", agent: "refinador" }, f.opts), /Productor de origen no autorizado/)
    f.nodes.plan.agent = "arquitecto"
    await assert.rejects(publishSession({ ...promotion, agent: "arquitecto" }, f.opts), /Propietario de carpeta diferente/)
    f.nodes.plan.agent = "planificador"
    f.nodes.root2 = { ...f.nodes.plan, id: "root2" }
    const foreign = await publishSession({ ...f.input, sessionID: "root2", operationID: "otra-raiz" }, f.opts)
    assert.ok(foreign.guardado)
    await assert.rejects(publishSession({ ...promotion, files: { "APP-1.md": { ...reference, artefacto_id: foreign.artefacto_id } } }, f.opts), /origen ajeno/)
    const folder = dirname(first.rutas["APP-1.md"])
    await rename(folder, `${folder}-real`)
    await symlink(`${folder}-real`, folder, process.platform === "win32" ? "junction" : "dir")
    await assert.rejects(publishSession(promotion, f.opts), /enlazada/)
    await rm(folder)
    await rename(`${folder}-real`, folder)
    assert.deepEqual(await readFile(f.stateFile), before)
    assert.equal(await readFile(first.rutas["APP-1.md"], "utf8"), f.input.files["APP-1.md"])
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("Planificador promueve archivos finales del Refinador directo, no un borrador ni un hermano ajeno", async () => {
  const f = await transactionFixture()
  try {
    const draft = await publishSession({ ...f.input, sessionID: "other", agent: "refinador", operationID: "finales",
      files: { "APP-1.md": "Historia final", "APP-1-incidencias.md": "Trazabilidad", "borrador.md": "Contenedor" } }, f.opts)
    assert.ok(draft.guardado)
    const state = await f.state()
    const artifact = state.artifacts[draft.artefacto_id]
    const reference = (name: string) => ({ artefacto_id: artifact.id,
      archivo: relative(draft.sesion, draft.rutas[name]).replace(/\\/g, "/"),
      sha256: artifact.files.find((file: any) => file.path === relative(draft.sesion, draft.rutas[name]).replace(/\\/g, "/")).sha256 })
    const input = { ...f.input, publicationType: "write_planning_deliverables", operationID: "promocion",
      files: { "APP-1.md": reference("APP-1.md"), "APP-1-incidencias.md": reference("APP-1-incidencias.md"), "incidencias-globales.md": "Global" } }
    const result = await publishSession(input, f.opts)
    assert.ok(result.guardado)
    assert.deepEqual(await readFile(result.rutas["APP-1.md"]), await readFile(draft.rutas["APP-1.md"]))
    assert.equal((await f.state()).artifacts[result.artefacto_id].producerSessionID, "plan")
    assert.deepEqual((await f.state()).artifacts[draft.artefacto_id], artifact)
    await assert.rejects(publishSession({ ...input, operationID: "borrador", files: { ...input.files, "APP-1.md": reference("borrador.md") } }, f.opts), /archivos finales separados/)
    f.nodes.sibling = { ...f.nodes.other, id: "sibling" }
    await assert.rejects(publishSession({ ...input, sessionID: "sibling", agent: "refinador" }, f.opts), /origen no autorizado/)
    f.nodes.other.agent = "revisor"
    await assert.rejects(publishSession({ ...input, operationID: "productor-cambiado" }, f.opts), /Productor del origen distinto/)
    f.nodes.other.agent = "refinador"
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

function verdictFor(publication: { artefacto_id: string; hash_manifiesto: string }, partial = false): Verdict {
  return { artefacto_id: publication.artefacto_id, hash_manifiesto: publication.hash_manifiesto,
    resultado: partial ? "parcial" : "favorable", alcance: ["CA-1", "CA-2"],
    aprobados: partial ? ["CA-1"] : ["CA-1", "CA-2"], pendientes: partial ? ["CA-2"] : [], bloqueados: [] }
}

test("dictamen estructurado solo del Revisor del productor y de la entrega/hash exactos", async () => {
  const f = await transactionFixture()
  try {
    const first = await publishSession(f.input, f.opts)
    assert.ok(first.guardado)
    const verdict = verdictFor(first)
    const input = { sessionID: "review", operationID: "revision", delivery: dirname(first.rutas["APP-1.md"]), sanity: "Informe favorable", verdict }
    const before = await readFile(f.stateFile)
    f.nodes.stranger = { ...f.nodes.review, id: "stranger", parentID: "other" }
    for (const id of ["plan", "other", "stranger"]) await assert.rejects(publishReview({ ...input, sessionID: id }, f.opts), /Revisor delegado|Productor sin carpeta/)
    for (const invalid of [{ ...verdict, artefacto_id: "ajeno" }, { ...verdict, hash_manifiesto: "0".repeat(64) }])
      await assert.rejects(publishReview({ ...input, verdict: invalid }, f.opts), /entrega\/hash/)
    await assert.rejects(publishReview({ ...input, verdict: { ...verdict, pendientes: ["CA-2"] } }, f.opts), /resultado único/)
    await assert.rejects(publishReview({ ...input, verdict: { ...verdictFor(first, true), resultado: "favorable" } }, f.opts), /aprobación completa/)
    assert.deepEqual(await readFile(f.stateFile), before)
    const result = await publishReview(input, { ...f.opts, checkpoint: async phase => {
      if (phase === "prepared" || phase.startsWith("file:") || phase === "materialized") {
        assert.deepEqual((await f.state()).reviews, {}, "no hay dictamen antes de confirmar el informe")
        assert.equal(Object.values<any>((await f.state()).versions)[0].approved, undefined)
      }
    } })
    assert.ok(result.guardado)
    const state = await f.state()
    assert.equal(await readFile(result.rutas["sanity-check.md"], "utf8"), input.sanity)
    assert.deepEqual(state.reviews[result.artefacto_id], { artifactID: first.artefacto_id, manifestHash: first.hash_manifiesto,
      reviewerSessionID: "review", reportArtifactID: result.artefacto_id,
      reports: [relative(first.sesion, result.rutas["sanity-check.md"]).replace(/\\/g, "/")], verdict })
    assert.deepEqual(await publishReview(input, f.opts), result)
    await assert.rejects(publishReview({ ...input, verdict: verdictFor(first, true) }, f.opts), /contenido distinto/)
    assert.equal(Object.values<any>(state.versions)[0].approved, first.artefacto_id)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("versiones: revisión tardía parcial de v1 no revisa v2; promoción no hereda aprobación", async () => {
  const f = await transactionFixture()
  try {
    const v1 = await publishSession(f.input, f.opts)
    const v2 = await publishSession({ ...f.input, operationID: "v2", files: { ...f.input.files, "APP-1.md": "Versión 2" } }, f.opts)
    assert.ok(v1.guardado && v2.guardado)
    const before = (await f.state()).artifacts[v1.artefacto_id]
    const partial = await publishReview({ sessionID: "review", operationID: "tardia", delivery: dirname(v1.rutas["APP-1.md"]),
      sanity: "CA-1 aprobado; CA-2 pendiente", verdict: verdictFor(v1, true) }, f.opts)
    assert.ok(partial.guardado)
    let version = Object.values<any>((await f.state()).versions)[0]
    assert.equal(version.published, v2.artefacto_id)
    assert.equal(version.reviewed, v1.artefacto_id)
    assert.equal(version.approved, undefined)
    assert.deepEqual((await f.state()).artifacts[v1.artefacto_id], before)
    const full = await publishReview({ sessionID: "review", operationID: "v2-revisada", delivery: dirname(v2.rutas["APP-1.md"]),
      sanity: "Aprobación completa de v2", verdict: verdictFor(v2) }, f.opts)
    assert.ok(full.guardado)
    const state = await f.state()
    const promoted = await publishSession({ ...f.input, operationID: "v3", files: Object.fromEntries(Object.keys(f.input.files)
      .map(name => [name, originFor(state, v2.artefacto_id, name)])) }, f.opts)
    assert.ok(promoted.guardado)
    version = Object.values<any>((await f.state()).versions)[0]
    assert.equal(version.published, promoted.artefacto_id)
    assert.equal(version.reviewed, v2.artefacto_id)
    assert.equal(version.approved, v2.artefacto_id)
    assert.ok(!Object.values<any>((await f.state()).reviews).some(review => review.artifactID === promoted.artefacto_id))
    const index = await readFile(join(v1.sesion, "indice.md"), "utf8")
    assert.match(index, /aprobación parcial; sin aprobación completa/)
    assert.match(index, /aprobada completa \(publicación\)/)
    assert.match(index, /pendiente de revisión/)
    assert.match(index, /no acredita integración global/)
    for (const match of index.matchAll(/\]\(\.\/([^)]*)\)/g)) assert.ok(await stat(join(v1.sesion, decodeURI(match[1]))), match[1])
    for (const result of [v1, v2, promoted]) {
      const artifact = (await f.state()).artifacts[result.artefacto_id]
      assert.equal(manifest(Object.fromEntries(await Promise.all(artifact.files.map(async (file: any) =>
        [file.path, await readFile(join(result.sesion, file.path))])))).hash, result.hash_manifiesto)
    }
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("Revisor: fallo o guardado desactivado no registra dictamen; revisión narrativa nunca infiere aprobación", async () => {
  for (const phase of ["prepared", "file:sanity-check.md", "materialized"]) {
    const f = await transactionFixture()
    try {
      const first = await publishSession(f.input, f.opts)
      assert.ok(first.guardado)
      const input = { sessionID: "review", operationID: "revision", delivery: dirname(first.rutas["APP-1.md"]), sanity: "APROBADO", verdict: verdictFor(first) }
      await assert.rejects(publishReview(input, { ...f.opts, checkpoint: point => { if (point === phase) throw new Error("Fallo guardado") } }), /Fallo guardado/)
      assert.deepEqual((await f.state()).reviews, {})
      assert.equal(Object.values<any>((await f.state()).versions)[0].reviewed, undefined)
      const settings = await readAgentSettings(f.opts.settingsPath)
      settings.agentes.revisor.guardarEntregablesEnSesion = false
      await writeFile(f.opts.settingsPath, JSON.stringify(settings))
      const before = await readFile(f.stateFile)
      assert.deepEqual(await publishReview(input, f.opts), { guardado: false })
      assert.deepEqual(await readFile(f.stateFile), before)
      settings.agentes.revisor.guardarEntregablesEnSesion = true
      await writeFile(f.opts.settingsPath, JSON.stringify(settings))
      const recovered = await publishReview(input, f.opts)
      assert.ok(recovered.guardado)
      assert.equal((await f.state()).reviews[recovered.artefacto_id].artifactID, first.artefacto_id)
    } finally { await rm(f.dir, { recursive: true, force: true }) }
  }
  const f = await transactionFixture()
  try {
    const first = await publishSession(f.input, f.opts)
    assert.ok(first.guardado)
    const blocked = join(dirname(first.rutas["APP-1.md"]), "sanity-check.md")
    await mkdir(blocked)
    await assert.rejects(publishReview({ sessionID: "review", delivery: dirname(first.rutas["APP-1.md"]),
      sanity: "Informe", verdict: verdictFor(first) }, f.opts), /Archivos no registrados/)
    assert.deepEqual((await f.state()).reviews, {})
    assert.equal(Object.values<any>((await f.state()).versions)[0].approved, undefined)
    await rm(blocked, { recursive: true })
    const reviewed = await publishReview({ sessionID: "review", delivery: dirname(first.rutas["APP-1.md"]), sanity: "APROBADO completamente, favorable" }, f.opts)
    assert.ok(reviewed.guardado)
    assert.deepEqual((await f.state()).reviews, {})
    assert.equal(Object.values<any>((await f.state()).versions)[0].reviewed, first.artefacto_id)
    assert.equal(Object.values<any>((await f.state()).versions)[0].approved, undefined)
    assert.match(await readFile(join(first.sesion, "indice.md"), "utf8"), /revisión narrativa; sin aprobación estructurada/)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})

test("control S04: el digest literal y resultado confirmado anterior se recuperan sin reinterpretarlos", async () => {
  const f = await transactionFixture()
  try {
    const first = await publishSession(f.input, f.opts)
    assert.ok(first.guardado)
    const state = await f.state()
    delete state.reviews
    delete state.versions
    const operation = Object.values<any>(state.operations)[0]
    delete operation.result.archivos
    const oldDigest = createHash("sha256").update(JSON.stringify({ type: operation.type, topic: f.input.topic,
      group: f.input.group, delivery: null, files: Object.keys(f.input.files).sort().map(name => [name, f.input.files[name]]),
      sources: [], decisions: [], keys: [] })).digest("hex")
    assert.equal(operation.digest, oldDigest, "misma normalización literal de S04")
    await writeFile(f.stateFile, JSON.stringify(state))
    const before = await readFile(f.stateFile)
    assert.deepEqual(await publishSession(f.input, f.opts), operation.result)
    assert.deepEqual(await readFile(f.stateFile), before)
    assert.equal((await publishSession(f.input, f.opts) as any).archivos, undefined)
  } finally { await rm(f.dir, { recursive: true, force: true }) }
})
