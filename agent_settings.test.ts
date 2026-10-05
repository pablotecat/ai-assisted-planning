import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
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
