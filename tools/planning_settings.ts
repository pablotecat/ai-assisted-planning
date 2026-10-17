import { tool } from "@opencode-ai/plugin"
import { readAgentSettings, saveMissingProject } from "./agent_settings.ts"

export async function planningSettings(proyectoJira?: string, path?: string) {
  const { proyecto, agentes } = proyectoJira === undefined
    ? await readAgentSettings(path)
    : await saveMissingProject({ claveProyectoJira: proyectoJira }, path)
  return { PROYECTO_JIRA: proyecto.claveProyectoJira,
    MAX_REFINADORES_PARALELOS: agentes.planificador.maxRefinadoresParalelos,
    guardarEntregablesEnSesion: agentes.planificador.guardarEntregablesEnSesion }
}

export default tool({
  description: "Lee el proyecto Jira preferente, el límite de refinadores y el guardado; con proyectoJira guarda la clave indicada por el usuario solo si está vacía en agent-settings.json.",
  args: { proyectoJira: tool.schema.string().trim().min(1).optional() },
  async execute(args, context) {
    if (context.agent !== "agente-planificador") throw new Error("Solo agente-planificador puede gestionar estos valores")
    return JSON.stringify(await planningSettings(args.proyectoJira))
  },
})
