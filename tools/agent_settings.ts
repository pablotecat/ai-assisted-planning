import { randomUUID } from "node:crypto"
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@opencode-ai/plugin"

export const settingsPath = join(dirname(fileURLToPath(import.meta.url)), "..", "agent-settings.json")
const examplePath = join(dirname(settingsPath), "agent-settings.example.json")
const hostRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const nonEmpty = tool.schema.string().trim().min(1)
const project = tool.schema.object({
  claveProyectoJira: tool.schema.string().trim().default(""),
  repositorio: tool.schema.string().refine((s) => !s || isAbsolute(s)),
  referencia: tool.schema.string(),
  carpetasDocumentales: tool.schema.array(nonEmpty.refine(isAbsolute)),
}).strict()
const permitted = tool.schema.array(tool.schema.enum(["lector-codigo", "lector-documentacion"]))
  .min(1).max(2).refine((v) => v.length === 1 || (v[0] === "lector-codigo" && v[1] === "lector-documentacion"), "Especialistas repetidos o fuera de orden")
const saved = tool.schema.object({ guardarEntregablesEnSesion: tool.schema.boolean() })
export const settingsSchema = tool.schema.object({
  proyecto: project,
  agentes: tool.schema.object({
    arquitecto: saved.extend({ maxIntentosRevision: tool.schema.number().int().positive() })
      .default({ maxIntentosRevision: 3, guardarEntregablesEnSesion: true }),
    "arquitecto-test": saved.default({ guardarEntregablesEnSesion: true }),
    planificador: saved.extend({ maxRefinadoresParalelos: tool.schema.number().int().positive() }),
    refinador: saved.extend({ maxConsultasParalelas: tool.schema.number().int().positive() }),
    investigador: saved.extend({ maxRepreguntasEspecialistas: tool.schema.number().int().min(0), especialistasPermitidos: permitted }),
    "lector-codigo": saved,
    "lector-documentacion": saved,
    revisor: saved,
  }).strict(),
  sesiones: tool.schema.object({ carpetaRaiz: nonEmpty.refine((s) => !isAbsolute(s) && !s.includes(":") && s.split(/[\\/]/).every((part) => part && part !== ".." && part !== "."), "Ruta relativa dentro del proyecto") }).strict(),
}).strict()

export type AgentSettings = ReturnType<typeof settingsSchema.parse>
export type AgentName = keyof AgentSettings["agentes"]
export const projectManagers = ["investigador", "planificador", "arquitecto"]

export async function readAgentSettings(path = settingsPath): Promise<AgentSettings> {
  try {
    return settingsSchema.parse(JSON.parse(await readFile(path, "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const initial = settingsSchema.parse(JSON.parse(await readFile(examplePath, "utf8")))
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, JSON.stringify(initial, null, 2) + "\n", { flag: "wx" })
    try { await link(temp, path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
  } finally { await rm(temp, { force: true }) }
  return settingsSchema.parse(JSON.parse(await readFile(path, "utf8")))
}

export async function saveMissingProject(values: Partial<AgentSettings["proyecto"]>, path = settingsPath) {
  const proposed = project.partial().strict().parse(values)
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await mkdir(`${path}.lock`); break }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 99) throw error
      await new Promise((done) => setTimeout(done, 50))
    }
  }
  try {
    const current = await readAgentSettings(path)
    const missing = Object.fromEntries(Object.entries(proposed).filter(([key]) => {
      const value = current.proyecto[key as keyof typeof current.proyecto]
      return !value || (Array.isArray(value) && !value.length)
    }))
    if (!Object.keys(missing).length) return current
    const next = settingsSchema.parse({ ...current, proyecto: { ...current.proyecto, ...missing } })
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" })
      if (JSON.stringify(current) !== JSON.stringify(await readAgentSettings(path))) throw new Error("La configuración cambió durante el guardado")
      await rename(temp, path)
    } finally { await rm(temp, { force: true }) }
    return next
  } finally { await rm(`${path}.lock`, { recursive: true, force: true }) }
}

export function sessionRoot(settings: AgentSettings, root = hostRoot) {
  return resolve(root, settings.sesiones.carpetaRaiz)
}

export async function manageAgentSettings(agent: string, action: "read" | "saveMissing",
  values?: Partial<AgentSettings["proyecto"]>, path?: string) {
  if (![...projectManagers, "refinador", "lector-codigo", "lector-documentacion"].includes(agent)) throw new Error("Agente no autorizado")
  if (action === "saveMissing" && (!projectManagers.includes(agent) || !values))
    throw new Error("Solo Investigador, Planificador y Arquitecto guardan datos confirmados; se requieren valores")
  return action === "read" ? readAgentSettings(path) : saveMissingProject(values!, path)
}

export default tool({
  description: "Lee la configuración común del proyecto y sus agentes; tras confirmación guarda los datos de proyecto aún vacíos.",
  args: { action: tool.schema.enum(["read", "saveMissing"]), values: project.partial().strict().optional() },
  async execute(args, context) {
    return JSON.stringify(await manageAgentSettings(context.agent, args.action, args.values))
  },
})
