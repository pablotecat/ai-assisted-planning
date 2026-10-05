import { tool } from "@opencode-ai/plugin"
import { readAgentSettings } from "./agent_settings.ts"

export default tool({
  description: "Lee de agent-settings.json el máximo de refinadores simultáneos y el guardado del planificador.",
  args: {},
  async execute(_args, context) {
    if (context.agent !== "agente-planificador") throw new Error("Solo agente-planificador puede consultar su límite")
    const { agentes } = await readAgentSettings()
    return JSON.stringify({ MAX_REFINADORES_PARALELOS: agentes.planificador.maxRefinadoresParalelos,
      guardarEntregablesEnSesion: agentes.planificador.guardarEntregablesEnSesion })
  },
})
