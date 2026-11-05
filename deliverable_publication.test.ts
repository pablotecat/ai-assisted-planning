import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { join, relative } from "node:path"
import test, { type TestContext } from "node:test"
import { captureSource, publishSession, sessionWork, type Identity } from "./tools/session_store.ts"
import { DeliverableValidationError } from "./tools/deliverable_validation.ts"
import { completeValidation, completeFiles, original, validation } from "./test-support/deliverable-fixture.ts"

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/deliverable-"))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }))
  const actor = { sessionID: "p", agent: "planificador" }
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string): Promise<Identity> => ({ id, agent: id === "r" ? "revisor" : "planificador", ...(id === "r" ? { parentID: "p" } : {}),
      title: "Historia", created: 1, directory: dir }) }
  const work: any = await sessionWork({ action: "create", pregunta: "Saldo", criterios: ["OR-1", "OR-2"], corpus: "fixture", referencia: "v1" }, actor, options)
  const snap: any = await captureSource({ encargo_id: work.encargo.id, corpus: "fixture", referencia: "v1", fuente: "taller ficticio",
    operacion_id: "captura", resultado: original }, actor, options)
  const profile = { ...completeValidation, fuentes: [{ ...completeValidation.fuentes![0], instantanea_id: snap.instantanea_id }] }
  const input = { ...actor, topic: "H1", group: "entrega", publicationType: "write_planning_deliverables",
    workID: work.encargo.id, operationID: "v1", files: completeFiles, validation: profile }
  const state = async () => JSON.parse(await readFile(join(options.root, ".control", createHash("sha256").update(dir + "\0p").digest("hex"), "state.json"), "utf8"))
  return { dir, options, actor, input, state }
}

test("S10 10.4 literal/promoción validan el conjunto antes del commit; errores, alertas y pendientes separados", async t => {
  const f = await fixture(t)
  const before = await f.state()
  const rejected = { ...f.input, files: { ...completeFiles, "H1.md": completeFiles["H1.md"].replace("CA-1", "CA-2") } }
  await assert.rejects(publishSession(rejected, f.options), (error: any) => {
    assert.ok(error instanceof DeliverableValidationError)
    assert.ok(error.report.errores.some((e: string) => e.includes("destino inexistente")))
    assert.ok(Array.isArray(error.report.alertas))
    assert.ok(error.report.pendientes.length)
    return true
  })
  assert.deepEqual(await f.state(), before, "Sin reserva ni artefactos parciales")
  const first = await publishSession(f.input, f.options)
  assert.ok(first.guardado)
  assert.deepEqual(first.validacion?.errores, [])
  assert.deepEqual(await publishSession(f.input, f.options), first)
  const promoted = Object.fromEntries(Object.entries(first.rutas).map(([name, path]) => {
    const archivo = relative(first.sesion, path).replaceAll("\\", "/")
    return [name, { artefacto_id: first.artefacto_id, archivo, sha256: first.archivos!.find(file => file.path === archivo)!.sha256 }]
  }))
  const badProfile = structuredClone(f.input.validation)
  badProfile.trazabilidad![0].destinos[0].criterio = "H1/CA-99"
  const saved = await f.state()
  const inventory = await readdir(first.sesion, { recursive: true })
  await assert.rejects(publishSession({ ...f.input, operationID: "prom-bad", files: promoted, validation: badProfile }, f.options), DeliverableValidationError)
  assert.deepEqual(await f.state(), saved)
  assert.deepEqual(await readdir(first.sesion, { recursive: true }), inventory)
  for (const [name, changed] of [["literal-cita", completeFiles["H1-incidencias.md"].replace("eliminaran", "eliminararan")],
    ["literal-errata", completeFiles["H1-incidencias.md"].replace("presevar", "preservar")]]) {
    await assert.rejects(publishSession({ ...f.input, operationID: name,
      files: { ...completeFiles, "H1-incidencias.md": changed } }, f.options), DeliverableValidationError)
    assert.deepEqual(await f.state(), saved)
  }
  const second = await publishSession({ ...f.input, operationID: "prom-ok", files: promoted }, f.options)
  assert.ok(second.guardado)
  for (const name of Object.keys(first.rutas)) assert.deepEqual(await readFile(first.rutas[name]), await readFile(second.rutas[name]))
  const generic = await publishSession({ ...f.actor, topic: "nota", files: { "nota.md": "Anterior" } }, f.options)
  assert.ok(generic.guardado && generic.validacion?.pendientes.some(e => e.includes("Sin perfil")))
  const noLinks = await publishSession({ ...f.input, operationID: "sin-vinculos", validation }, f.options)
  assert.ok(noLinks.guardado && noLinks.validacion?.pendientes.some(e => e.includes("faltan fuentes")))
  await assert.rejects(publishSession({ ...f.input, operationID: "fuente-ajena", validation: { ...f.input.validation,
    fuentes: [{ ...f.input.validation.fuentes![0], instantanea_id: "otra" }] } }, f.options), /no asignada/)
})
