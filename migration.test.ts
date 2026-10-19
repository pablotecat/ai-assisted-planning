import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { migrateAgentSettings, migrateSettings } from "./scripts/migrate-agent-settings.mjs"
import { prepareInstalledTools } from "./scripts/migrate-installed-tools.mjs"
import { settingsSchema } from "./tools/agent_settings.ts"

const example = JSON.parse(await readFile(new URL("./agent-settings.example.json", import.meta.url), "utf8"))
const validate = (value: unknown) => settingsSchema.parse(value)
const renames = { coordinador: "investigador", codigo: "lector-codigo", documentacion: "lector-documentacion", refinamiento: "refinador" }

function legacySettings() {
  const value = structuredClone(example)
  for (const [old, current] of Object.entries(renames)) {
    value.agentes[old] = value.agentes[current]
    delete value.agentes[current]
  }
  value.agentes.coordinador.especialistasPermitidos = ["codigo", "documentacion"]
  return value
}

test("migración conserva proyecto, límites, guardado, raíz y compatibilidades anteriores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "settings-migration-"))
  const path = join(dir, "agent-settings.json")
  try {
    const legacy = legacySettings()
    legacy.proyecto = { claveProyectoJira: "APP", repositorio: dir, referencia: "release", carpetasDocumentales: [dir] }
    legacy.agentes.planificador.maxRefinadoresParalelos = 7
    legacy.agentes.refinamiento.maxConsultasParalelas = 4
    legacy.agentes.coordinador.maxRepreguntasEspecialistas = 0
    legacy.agentes.coordinador.especialistasPermitidos = ["documentacion"]
    for (const agent of Object.values(legacy.agentes) as any[]) agent.guardarEntregablesEnSesion = false
    legacy.sesiones.carpetaRaiz = "entregas/privadas"
    await writeFile(path, JSON.stringify(legacy))
    assert.equal(await migrateAgentSettings(path, validate), true)
    const migrated = JSON.parse(await readFile(path, "utf8"))
    assert.deepEqual(migrated.proyecto, legacy.proyecto)
    assert.deepEqual(migrated.sesiones, legacy.sesiones)
    for (const [old, current] of Object.entries(renames)) {
      assert.ok(!Object.hasOwn(migrated.agentes, old))
      assert.deepEqual(migrated.agentes[current], old === "coordinador"
        ? { ...legacy.agentes[old], especialistasPermitidos: ["lector-documentacion"] } : legacy.agentes[old])
    }
    const text = await readFile(path, "utf8"), before = await stat(path)
    assert.equal(await migrateAgentSettings(path, validate), false)
    assert.equal(await readFile(path, "utf8"), text)
    assert.equal((await stat(path)).mtimeMs, before.mtimeMs)
    delete legacy.proyecto.claveProyectoJira
    delete legacy.agentes.arquitecto
    delete legacy.agentes["arquitecto-test"]
    const compatible = validate(migrateSettings(legacy, validate))
    assert.equal(compatible.proyecto.claveProyectoJira, "")
    assert.equal(compatible.agentes.arquitecto.maxIntentosRevision, 3)
    assert.equal(compatible.agentes["arquitecto-test"].guardarEntregablesEnSesion, true)
    assert.deepEqual(await readdir(dir), ["agent-settings.json"])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("canónica y mezclas equivalentes; los conflictos y esquemas inválidos dejan el archivo intacto", async () => {
  const dir = await mkdtemp(join(tmpdir(), "settings-conflict-"))
  const path = join(dir, "agent-settings.json")
  try {
    await writeFile(path, JSON.stringify(example))
    const before = await stat(path)
    assert.equal(await migrateAgentSettings(path, validate), false)
    assert.equal((await stat(path)).mtimeMs, before.mtimeMs)
    const mixed = { ...example, agentes: { ...legacySettings().agentes, ...example.agentes } }
    assert.deepEqual(migrateSettings(mixed, validate), example)
    mixed.agentes.investigador = { ...mixed.agentes.investigador, maxRepreguntasEspecialistas: 99 }
    const conflict = JSON.stringify(mixed)
    await writeFile(path, conflict)
    await assert.rejects(migrateAgentSettings(path, validate), /agentes.coordinador y agentes.investigador.*99/)
    assert.equal(await readFile(path, "utf8"), conflict)
    for (const change of [(v: any) => { v.sesiones.carpetaRaiz = "../escape" },
      (v: any) => { v.agentes.refinamiento.maxConsultasParalelas = 0 },
      (v: any) => { v.agentes.coordinador.especialistasPermitidos = ["codigo", "codigo"] },
      (v: any) => { v.proyecto.extra = true }]) {
      const invalid = legacySettings()
      change(invalid)
      const text = JSON.stringify(invalid)
      await writeFile(path, text)
      await assert.rejects(migrateAgentSettings(path, validate))
      assert.equal(await readFile(path, "utf8"), text)
    }
    assert.deepEqual(await readdir(dir), ["agent-settings.json"])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("las herramientas personalizadas se conservan y las colisiones se comunican antes de copiarlas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tools-collision-"))
  try {
    await mkdir(join(dir, "tools"))
    const legacy = join(dir, "tools", "coordinator_defaults.ts")
    const current = join(dir, "tools", "investigator_defaults.ts")
    await writeFile(legacy, "herramienta personalizada")
    const record = await prepareInstalledTools(process.cwd(), dir)
    await record()
    assert.equal(await readFile(legacy, "utf8"), "herramienta personalizada")
    await writeFile(current, "colisión personalizada")
    await assert.rejects(prepareInstalledTools(process.cwd(), dir), /Colisión.*investigator_defaults.ts/)
    assert.equal(await readFile(current, "utf8"), "colisión personalizada")
  } finally { await rm(dir, { recursive: true, force: true }) }
})
