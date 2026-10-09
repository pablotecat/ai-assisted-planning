import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { readAgentSettings, saveMissingProject } from "./tools/agent_settings.ts"

test("configuración inicial y límites de proyecto", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-settings-"))
  const path = join(dir, "settings.json")
  try {
    const initial = await readAgentSettings(path)
    assert.deepEqual(initial.proyecto, { repositorio: "", referencia: "", carpetasDocumentales: [] })
    assert.deepEqual(initial.agentes.coordinador.especialistasPermitidos, ["codigo", "documentacion"])
    await Promise.all([saveMissingProject({ referencia: "main" }, path), saveMissingProject({ carpetasDocumentales: [dir] }, path)])
    await saveMissingProject({ referencia: "otra" }, path)
    const saved = await readAgentSettings(path)
    assert.equal(saved.proyecto.referencia, "main")
    assert.deepEqual(saved.proyecto.carpetasDocumentales, [dir])
    await writeFile(path, JSON.stringify({ ...saved, proyecto: { ...saved.proyecto, sitioExterno: "valor" } }))
    await assert.rejects(readAgentSettings(path))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("arquitecto: valores por defecto compatibles y límites de revisión válidos", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-architecture-settings-"))
  const path = join(dir, "settings.json")
  try {
    const initial = await readAgentSettings(path)
    assert.deepEqual(initial.agentes.arquitecto, { maxIntentosRevision: 3, guardarEntregablesEnSesion: true })
    const { arquitecto, ...legacyAgents } = initial.agentes
    const legacy = JSON.stringify({ ...initial, agentes: legacyAgents })
    await writeFile(path, legacy)
    assert.deepEqual((await readAgentSettings(path)).agentes.arquitecto, arquitecto)
    assert.equal(await readFile(path, "utf8"), legacy)
    await writeFile(path, JSON.stringify({ ...initial, agentes: { ...initial.agentes,
      arquitecto: { maxIntentosRevision: 1, guardarEntregablesEnSesion: false } } }))
    assert.deepEqual((await readAgentSettings(path)).agentes.arquitecto,
      { maxIntentosRevision: 1, guardarEntregablesEnSesion: false })
    for (const maxIntentosRevision of [0, -1, 1.5, "3"]) {
      await writeFile(path, JSON.stringify({ ...initial, agentes: { ...initial.agentes,
        arquitecto: { ...arquitecto, maxIntentosRevision } } }))
      await assert.rejects(readAgentSettings(path))
    }
    await writeFile(path, JSON.stringify({ ...initial, agentes: { ...initial.agentes,
      arquitecto: { ...arquitecto, guardarEntregablesEnSesion: "true" } } }))
    await assert.rejects(readAgentSettings(path))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
