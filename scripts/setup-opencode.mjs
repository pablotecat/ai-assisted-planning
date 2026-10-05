import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

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
await mkdir(configDir, { recursive: true })
for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(configDir, dir), { recursive: true })
await cp(join(source, "agent-settings.example.json"), join(configDir, "agent-settings.example.json"))
await cp(join(source, "agent-settings.example.json"), join(configDir, "agent-settings.json"), { force: false })

const packagePath = join(configDir, "package.json")
const packageConfig = await json(packagePath)
const dependency = (await json(join(source, "package.json"))).dependencies
packageConfig.type ??= "module"
packageConfig.dependencies = { ...dependency, ...packageConfig.dependencies }
await writeFile(packagePath, JSON.stringify(packageConfig, null, 2) + "\n")

const rootConfig = join(host, "opencode.json")
const localConfig = join(configDir, "opencode.json")
const configPath = await stat(rootConfig).then(() => rootConfig, (e) => { if (e.code === "ENOENT") return localConfig; throw e })
const config = await json(configPath)
config.subagent_depth = Math.max(4, Number.isInteger(config.subagent_depth) ? config.subagent_depth : 0)
config.$schema ??= "https://opencode.ai/config.json"
await writeFile(configPath, JSON.stringify(config, null, 2) + "\n")

if (process.platform === "win32") run("cmd.exe", ["/d", "/s", "/c", "npm install"], configDir)
else run("npm", ["install"], configDir)

console.log(`\nInstalación terminada. Abre OpenCode en ${host}. Ajustes opcionales: ${join(configDir, "agent-settings.json")}.`)
