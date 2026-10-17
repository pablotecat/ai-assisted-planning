import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { publishReview, publishSession, type Identity } from "./tools/session_store.ts"

test("arquitecto publica planes versionados y respeta su interruptor de guardado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-architecture-session-"))
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath,
    get: async (id: string): Promise<Identity> => ({ id, agent: "agente-arquitecto",
      title: "Implementación de pagos", created: Date.UTC(2026, 9, 9), directory: dir }) }
  const input = { sessionID: "architecture", agent: "agente-arquitecto", topic: "implementación",
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
    await assert.rejects(publishSession({ ...input, agent: "agente-planificador" }, opts), /Autor/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("Documentación solo publica delegaciones del Coordinador o de Documentación", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-jira-delegation-"))
  const base = { title: "Fuentes Jira", created: Date.UTC(2026, 9, 17), directory: dir }
  const managers = ["coordinador", "planificador", "arquitecto"]
  const nodes: Record<string, Identity> = {}
  for (const name of managers) {
    nodes[name] = { ...base, id: name, agent: `agente-${name}` }
    nodes[`${name}-docs`] = { ...base, id: `${name}-docs`, parentID: name, agent: "agente-documentacion" }
  }
  nodes.codigo = { ...base, id: "codigo", agent: "agente-codigo" }
  nodes.wrongDocs = { ...base, id: "wrongDocs", parentID: "codigo", agent: "agente-documentacion" }
  nodes.childDocs = { ...base, id: "childDocs", parentID: "coordinador-docs", agent: "agente-documentacion" }
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath, get: async (id: string) => nodes[id] }
  const input = { agent: "agente-documentacion", topic: "APP-1", files: { "fuentes-jira.md": "APP-1: texto íntegro" },
    sources: ["https://example.atlassian.net/browse/APP-1"] }
  try {
    for (const name of managers) {
      if (name !== "coordinador") {
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
    settings.agentes.coordinador.especialistasPermitidos = ["codigo"]
    await writeFile(settingsPath, JSON.stringify(settings))
    for (const name of managers)
      await assert.rejects(publishSession({ ...input, sessionID: `${name}-docs` }, opts),
        name === "coordinador" ? /Especialista deshabilitado/ : /Delegación no autorizada/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("Arquitecto → Test → Revisor conserva versiones y revisa el archivo exacto del productor", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-test-flow-"))
  const base = { title: "Historia UI", created: Date.UTC(2026, 9, 12), directory: dir }
  const nodes: Record<string, Identity> = {
    architect: { ...base, id: "architect", agent: "agente-arquitecto" },
    test: { ...base, id: "test", parentID: "architect", agent: "agente-arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "agente-revisor" },
    globalReview: { ...base, id: "globalReview", parentID: "architect", agent: "agente-revisor" },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string) => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  const input = { sessionID: "test", agent: "agente-arquitecto-test", topic: "HISTORIA-1",
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

    const integrated = await publishSession({ sessionID: "architect", agent: "agente-arquitecto", topic: "Plan UI",
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
    architect: { ...base, id: "architect", agent: "agente-arquitecto" },
    coordinator: { ...base, id: "coordinator", agent: "agente-coordinador" },
    direct: { ...base, id: "direct", agent: "agente-arquitecto-test" },
    wrongParent: { ...base, id: "wrongParent", parentID: "coordinator", agent: "agente-arquitecto-test" },
    test: { ...base, id: "test", parentID: "architect", agent: "agente-arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "agente-revisor" },
  }
  const settingsPath = join(dir, "settings.json")
  const opts = { root: join(dir, "sesiones"), settingsPath, get: async (id: string) => nodes[id] }
  const input = { sessionID: "test", agent: "agente-arquitecto-test", topic: "UI", files: { "borrador-tests.md": "Caso UI" } }
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
    plan: { id: "plan", agent: "agente-planificador", title: "Planificación de pagos", created: Date.UTC(2026, 8, 30), directory: dir },
    review: { id: "review", parentID: "plan", agent: "agente-revisor", title: "Revisión", created: 1, directory: dir },
    other: { id: "other", agent: "agente-codigo", title: "Consulta", created: 1, directory: dir },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string) => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  try {
    const originals = await publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Requisito recibido" } }, opts)
    assert.equal(originals.guardado, true)
    if (!originals.guardado) return
    await assert.rejects(publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Modificado" } }, opts), /ya están publicados/)
    await assert.rejects(publishSession({ sessionID: "other", agent: "agente-codigo", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Ajeno" } }, opts), /Solo el planificador/)
    const first = await publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
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
