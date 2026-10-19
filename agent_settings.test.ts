import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { tool } from "@opencode-ai/plugin"
import { manageAgentSettings, readAgentSettings, saveMissingProject } from "./tools/agent_settings.ts"
import architectureSettings from "./tools/architecture_settings.ts"
import investigatorDefaults from "./tools/investigator_defaults.ts"
import planningTool, { planningSettings } from "./tools/planning_settings.ts"

test("configuración inicial y límites de proyecto", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-settings-"))
  const path = join(dir, "settings.json")
  try {
    const initial = await readAgentSettings(path)
    assert.deepEqual(initial.proyecto, { claveProyectoJira: "", repositorio: "", referencia: "", carpetasDocumentales: [] })
    assert.deepEqual(initial.agentes.investigador.especialistasPermitidos, ["lector-codigo", "lector-documentacion"])
    await Promise.all([saveMissingProject({ referencia: "main" }, path), saveMissingProject({ carpetasDocumentales: [dir] }, path),
      planningSettings("APP", path)])
    await saveMissingProject({ referencia: "otra" }, path)
    const saved = await readAgentSettings(path)
    assert.equal(saved.proyecto.claveProyectoJira, "APP")
    assert.equal(saved.proyecto.referencia, "main")
    assert.deepEqual(saved.proyecto.carpetasDocumentales, [dir])
    await writeFile(path, JSON.stringify({ ...saved, proyecto: { ...saved.proyecto, sitioExterno: "valor" } }))
    await assert.rejects(readAgentSettings(path))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("planificador guarda el proyecto Jira ausente y conserva configuraciones anteriores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-jira-settings-"))
  const path = join(dir, "settings.json")
  try {
    const initial = await readAgentSettings(path)
    const { claveProyectoJira, ...legacyProject } = initial.proyecto
    initial.agentes.planificador.guardarEntregablesEnSesion = false
    const legacy = JSON.stringify({ ...initial, proyecto: legacyProject })
    await writeFile(path, legacy)
    assert.deepEqual(await planningSettings(undefined, path), {
      PROYECTO_JIRA: "", MAX_REFINADORES_PARALELOS: 10, guardarEntregablesEnSesion: false,
    })
    assert.equal(await readFile(path, "utf8"), legacy)
    assert.equal((await planningSettings(" APP ", path)).PROYECTO_JIRA, "APP")
    const saved = await readFile(path, "utf8")
    assert.deepEqual(JSON.parse(saved), { ...initial, proyecto: { ...legacyProject, claveProyectoJira: "APP" } })
    assert.equal((await planningSettings("OTRO", path)).PROYECTO_JIRA, "APP")
    assert.equal(await readFile(path, "utf8"), saved)
    await writeFile(path, JSON.stringify({ ...initial, proyecto: { ...legacyProject, claveProyectoJira: 123 } }))
    await assert.rejects(readAgentSettings(path))
  } finally { await rm(dir, { recursive: true, force: true }) }

  const input = tool.schema.object(planningTool.args)
  assert.deepEqual(input.parse({}), {})
  assert.deepEqual(input.parse({ proyectoJira: " APP " }), { proyectoJira: "APP" })
  for (const proyectoJira of ["", "   ", 123]) assert.throws(() => input.parse({ proyectoJira }))
  await assert.rejects(planningTool.execute({ proyectoJira: "APP" }, { agent: "refinador" } as never), /Solo planificador/)
})

test("Investigador, Planificador y Arquitecto comparten lectura y guardado de datos de proyecto vacíos", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-project-managers-"))
  const values = { claveProyectoJira: "APP", repositorio: dir, referencia: "main", carpetasDocumentales: [dir] }
  try {
    for (const agent of ["investigador", "planificador", "arquitecto"]) {
      const path = join(dir, `${agent}.json`)
      const initial = await manageAgentSettings(agent, "read", undefined, path)
      assert.equal(initial.proyecto.claveProyectoJira, "")
      const saved = await manageAgentSettings(agent, "saveMissing", values, path)
      assert.deepEqual(saved.proyecto, values)
      assert.deepEqual(saved.agentes, initial.agentes)
      assert.deepEqual(saved.sesiones, initial.sesiones)
      const content = await readFile(path, "utf8")
      await manageAgentSettings(agent, "saveMissing", { claveProyectoJira: "OTRO", repositorio: join(dir, "otro"),
        referencia: "otra", carpetasDocumentales: [join(dir, "otros-docs")] }, path)
      assert.equal(await readFile(path, "utf8"), content)
      await assert.rejects(manageAgentSettings(agent, "saveMissing", undefined, path), /se requieren valores/)
      await assert.rejects(manageAgentSettings(agent, "saveMissing", { agentes: {} } as never, path))
      assert.equal(await readFile(path, "utf8"), content)
      await assert.rejects(investigatorDefaults.execute({ action: "saveMissing" }, { agent } as never),
        agent === "investigador" ? /Faltan valores confirmados/ : /Solo investigador/)
      if (agent !== "planificador")
        await assert.rejects(planningTool.execute({}, { agent } as never), /Solo planificador/)
      if (agent !== "arquitecto")
        await assert.rejects(architectureSettings.execute({}, { agent } as never), /Solo arquitecto/)
    }
    const path = join(dir, "investigador.json")
    const content = await readFile(path, "utf8")
    for (const agent of ["refinador", "lector-codigo", "lector-documentacion"]) {
      assert.deepEqual((await manageAgentSettings(agent, "read", undefined, path)).proyecto, values)
      await assert.rejects(manageAgentSettings(agent, "saveMissing", { referencia: "otra" }, path), /Solo Investigador/)
      await assert.rejects(investigatorDefaults.execute({ action: "read" }, { agent } as never), /Solo investigador/)
    }
    for (const agent of ["arquitecto-test", "revisor", "build"]) {
      await assert.rejects(manageAgentSettings(agent, "read", undefined, path), /no autorizado/)
      await assert.rejects(manageAgentSettings(agent, "saveMissing", values, path), /no autorizado/)
    }
    assert.equal(await readFile(path, "utf8"), content)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("arquitecto y Test: valores por defecto compatibles y límites de revisión válidos", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-architecture-settings-"))
  const path = join(dir, "settings.json")
  try {
    const initial = await readAgentSettings(path)
    assert.deepEqual(initial.agentes.arquitecto, { maxIntentosRevision: 3, guardarEntregablesEnSesion: true })
    assert.deepEqual(initial.agentes["arquitecto-test"], { guardarEntregablesEnSesion: true })
    const { arquitecto, "arquitecto-test": testSettings, ...legacyAgents } = initial.agentes
    const legacy = JSON.stringify({ ...initial, agentes: legacyAgents })
    await writeFile(path, legacy)
    assert.deepEqual((await readAgentSettings(path)).agentes.arquitecto, arquitecto)
    assert.deepEqual((await readAgentSettings(path)).agentes["arquitecto-test"], testSettings)
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
    await writeFile(path, JSON.stringify({ ...initial, agentes: { ...initial.agentes,
      "arquitecto-test": { guardarEntregablesEnSesion: false } } }))
    assert.equal((await readAgentSettings(path)).agentes["arquitecto-test"].guardarEntregablesEnSesion, false)
    await writeFile(path, JSON.stringify({ ...initial, agentes: { ...initial.agentes,
      "arquitecto-test": { guardarEntregablesEnSesion: "true" } } }))
    await assert.rejects(readAgentSettings(path))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
