import { tool } from "@opencode-ai/plugin"
import { readAgentSettings } from "./agent_settings.ts"

export default tool({
  description: "Lee de agent-settings.json el límite total de revisiones por entrega y el guardado del arquitecto.",
  args: {},
  async execute(_args, context) {
    if (context.agent !== "arquitecto") throw new Error("Solo arquitecto puede consultar su límite")
    const { agentes } = await readAgentSettings()
    return JSON.stringify({ MAX_INTENTOS_REVISION: agentes.arquitecto.maxIntentosRevision,
      guardarEntregablesEnSesion: agentes.arquitecto.guardarEntregablesEnSesion })
  },
})
