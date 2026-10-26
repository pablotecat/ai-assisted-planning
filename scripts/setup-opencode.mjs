import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import { jiraAliasStatus } from "./jira-aliases.mjs"
import { migrateAgentSettings } from "./migrate-agent-settings.mjs"
import { prepareInstalledTools } from "./migrate-installed-tools.mjs"
import { verifyOpenCode } from "./verify-opencode.mjs"

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const host = process.cwd()
if (host === source) throw new Error("El proyecto anfitrión debe ser distinto de este repositorio")

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}`)
}

async function json(path) {
  try { return JSON.parse(await readFile(path, "utf8")) }
  catch (error) { if (error.code === "ENOENT") return {}; throw error }
}

const configDir = join(host, ".opencode")
// Older migrations created a second registrar. Never overwrite its tools underneath it.
for (const [directory, name] of [["plugin", "agent-session.ts"], ["plugin", "markitdown-utf8.ts"], ["plugins", "project-tools.ts"]]) {
  const path = join(configDir, directory, name)
  let text
  try { text = await readFile(path, "utf8") }
  catch (error) { if (error.code === "ENOENT") continue; throw error }
  if (/session_store|write_planning_|oca\.project-tools|PYTHONIOENCODING/.test(text))
    throw new Error(`Plugin de una instalación anterior: ${path}. Muévelo a una copia de seguridad FUERA de .opencode/plugin y .opencode/plugins y repite la instalación. No se ha sobrescrito ningún componente.`)
}
await mkdir(configDir, { recursive: true })
const recordTools = await prepareInstalledTools(source, configDir)
const architectureContract = await readFile(join(source, "flujo-arquitectura.md"), "utf8")
await writeFile(join(configDir, "flujo-arquitectura.md"),
  architectureContract.replaceAll("](.apm/skills/", "](../.agents/skills/"))
await cp(join(source, "agent-settings.example.json"), join(configDir, "agent-settings.example.json"))
await cp(join(source, "agent-settings.example.json"), join(configDir, "agent-settings.json"), { force: false })

const packagePath = join(configDir, "package.json")
const packageConfig = await json(packagePath)
const dependency = (await json(join(source, "package.json"))).dependencies
packageConfig.type ??= "module"
packageConfig.dependencies = { ...packageConfig.dependencies, ...dependency }
await writeFile(packagePath, JSON.stringify(packageConfig, null, 2) + "\n")
if (process.platform === "win32") run("cmd.exe", ["/d", "/s", "/c", "npm install"], configDir)
else run("npm", ["install"], configDir)
const { applyEdits, modify, parse } = createRequire(packagePath)("jsonc-parser")
await cp(join(source, "tools"), join(configDir, "tools"), { recursive: true })
await recordTools()

const candidates = [join(configDir, "opencode.jsonc"), join(configDir, "opencode.json"),
  join(host, "opencode.jsonc"), join(host, "opencode.json")]
let configPath = join(configDir, "opencode.json"), text = "{}\n"
for (const path of candidates) {
  try { text = await readFile(path, "utf8"); configPath = path; break }
  catch (error) { if (error.code !== "ENOENT") throw error }
}
const errors = []
const config = parse(text, errors, { allowTrailingComma: true })
if (errors.length || !config || typeof config !== "object" || Array.isArray(config))
  throw new Error(`Configuración JSON/JSONC inválida: ${configPath}`)
function set(path, value) {
  text = applyEdits(text, modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
}
set(["experimental", "subagent_depth"], Math.max(4,
  Number.isInteger(config.experimental?.subagent_depth) ? config.experimental.subagent_depth :
    Number.isInteger(config.subagent_depth) ? config.subagent_depth : 0))
set(["subagent_depth"], undefined)
if (!config.$schema) set(["$schema"], "https://opencode.ai/config.json")
// APM deploys skills (including sibling references) to .agents/skills, even for
// the OpenCode target. Explicit registration also works with external scans off.
const skills = Array.isArray(config.skills) ? config.skills : [...(config.skills?.paths ?? []), ...(config.skills?.urls ?? [])]
set(["skills"], [...new Set([...skills, join(host, ".agents", "skills")])])
await writeFile(configPath, text)

// Validate and migrate before OpenCode loads the plugin and consumes the new schema.
const { settingsSchema } = await import(pathToFileURL(join(configDir, "tools", "agent_settings.ts")).href)
if (await migrateAgentSettings(join(configDir, "agent-settings.json"), value => settingsSchema.parse(value)))
  console.log("Ajustes migrados a los nombres actuales; se han conservado los valores del proyecto y de los agentes.")

// Deploy entrypoints only after their dependencies and settings are ready.
await cp(join(source, "plugin"), join(configDir, "plugins"), { recursive: true })
console.log(jiraAliasStatus(await verifyOpenCode(host)))
console.log(`\nComponentes instalados y plugins verificados en un servidor privado. Cierra y reinicia OpenCode en ${host}; reinicia también el servicio con «opencode service restart» antes de usar los agentes. Abre sesiones nuevas; continúa con los documentos y el handoff anteriores, conservando decisiones e intentos consumidos. Ajustes opcionales: ${join(configDir, "agent-settings.json")}.`)
