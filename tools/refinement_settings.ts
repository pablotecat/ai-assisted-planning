import { tool } from "@opencode-ai/plugin"
import { readAgentSettings } from "./agent_settings.ts"

export default tool({
  description: "Lee de agent-settings.json el máximo de consultas simultáneas y el guardado del refinador.",
  args: {},
  async execute(_args, context) {
    if (context.agent !== "agente-refinamiento") throw new Error("Solo agente-refinamiento puede consultar su límite")
    const { agentes } = await readAgentSettings()
    return JSON.stringify({ MAX_CONSULTAS_PARALELAS: agentes.refinamiento.maxConsultasParalelas,
      guardarEntregablesEnSesion: agentes.refinamiento.guardarEntregablesEnSesion })
  },
})
