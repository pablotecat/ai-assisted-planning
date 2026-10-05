import { execFileSync } from "node:child_process"
import { isAbsolute } from "node:path"
import { tool } from "@opencode-ai/plugin"
import { readAgentSettings, saveMissingProject } from "./agent_settings.ts"

const values = tool.schema.object({
  LOCAL_DOCUMENT_ROOTS: tool.schema.array(tool.schema.string().refine(isAbsolute)).min(1),
  WORKSPACE: tool.schema.string().refine(isAbsolute),
  REFERENCIA_SOLICITADA: tool.schema.string().trim().min(1),
}).partial().strict()

function branch(path: string) {
  if (!isAbsolute(path)) return null
  try { return execFileSync("git", ["branch", "--show-current"], {
    cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000,
  }).trim() || null } catch { return null }
}

export default tool({
  description: "Consulta los valores del proyecto y la rama actual; guarda únicamente valores aún vacíos confirmados por el usuario.",
  args: { action: tool.schema.enum(["read", "saveMissing"]), values: values.optional(), workspace: tool.schema.string().optional() },
  async execute(args, context) {
    if (context.agent !== "agente-coordinador") throw new Error("Solo agente-coordinador puede gestionar estos valores")
    if (args.action === "saveMissing" && !args.values) throw new Error("Faltan valores confirmados")
    const mapped = args.values && {
      ...(args.values.WORKSPACE && { repositorio: args.values.WORKSPACE }),
      ...(args.values.REFERENCIA_SOLICITADA && { referencia: args.values.REFERENCIA_SOLICITADA }),
      ...(args.values.LOCAL_DOCUMENT_ROOTS && { carpetasDocumentales: args.values.LOCAL_DOCUMENT_ROOTS }),
    }
    const settings = args.action === "read" ? await readAgentSettings() : await saveMissingProject(mapped!)
    const project = settings.proyecto
    return JSON.stringify({
      defaults: {
        WORKSPACE: project.repositorio, REFERENCIA_SOLICITADA: project.referencia,
        LOCAL_DOCUMENT_ROOTS: project.carpetasDocumentales,
        MAX_REPREGUNTAS_ESPECIALISTAS: settings.agentes.coordinador.maxRepreguntasEspecialistas,
        especialistasPermitidos: settings.agentes.coordinador.especialistasPermitidos,
        guardarEntregablesEnSesion: settings.agentes.coordinador.guardarEntregablesEnSesion,
      },
      missing: Object.entries(project).filter(([, value]) => !value || (Array.isArray(value) && !value.length)).map(([key]) => key),
      branchDefaultSuggested: branch(project.repositorio), branchActual: branch(args.workspace ?? project.repositorio),
    })
  },
})
