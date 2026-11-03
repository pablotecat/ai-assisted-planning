import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Avoid cmd.exe on Windows: it loses JSON quotes and leaves the server child running.
export const executable = process.platform === "win32" ? (process.env.PATH ?? "").split(";")
  .flatMap(dir => [join(dir, "opencode.exe"), join(dir, "node_modules", "@opencode", "cli", "bin", "opencode.exe")])
  .find(path => existsSync(path)) ?? "opencode" : "opencode"

export function opencode(args, cwd, env = process.env) {
  return spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
}

// Fallos transitorios de transporte del CLI contra servidores privados recién arrancados
// (misma familia que el ETIMEDOUT histórico de S05; causa subyacente INDETERMINADA, no
// atribuida). Familia OBSERVADA, no clasificación exhaustiva: «Could not reach server …
// Transport: The operation timed out» (suites raíz S12/S02, ver R1-F2/9322e78),
// «spawnSync cmd.exe ETIMEDOUT» y «aborted due to timeout» del timeout del spawnSync
// (S08, implementador, reproducido 2 veces y superado por repetición aislada, commit
// 55d127e), y «TimeoutError: The operation timed out» (S08, revisor, en la ruta de
// verifyOpenCode durante el setup). Predicado compartido con test-support/opencode.mjs
// para que ambos reintentos coincidan exactamente. Solo cubre fallos de arranque o
// transporte del proceso CLI: los errores de dominio del servidor (HTTP 4xx/5xx,
// plugins fallidos, respuestas inválidas) no contienen estas firmas y se siguen
// propagando en firme en ambos consumidores.
const transientCliTransportFailure =
  /Could not reach server|spawnSync \S+ ETIMEDOUT|aborted due to timeout|TimeoutError: The operation timed out/

export function isTransientTransportFailure(error) {
  return transientCliTransportFailure.test(String(error?.message ?? ""))
}

export async function verifyOpenCode(host = process.cwd()) {
  const env = { ...process.env, OPENCODE_DB: ":memory:", OPENCODE_PASSWORD: randomUUID() }
  const server = spawn(executable, ["serve", "--hostname", "127.0.0.1", "--port", "0", "--stdio"],
    { cwd: host, env, stdio: ["pipe", "pipe", "pipe"] })
  const exited = new Promise(resolve => server.once("exit", resolve))
  let stderr = ""
  server.stderr.on("data", data => { stderr = (stderr + data).slice(-8000) })
  try {
    const url = await new Promise((resolve, reject) => {
      let output = ""
      const timer = setTimeout(() => reject(new Error("OpenCode no arrancó en 30 segundos")), 30_000)
      server.once("error", error => { clearTimeout(timer); reject(error) })
      server.once("exit", () => { clearTimeout(timer); reject(new Error(`OpenCode terminó durante el arranque: ${stderr}`)) })
      server.stdout.on("data", data => {
        output += data
        if (!output.includes("\n")) return
        clearTimeout(timer)
        try { resolve(JSON.parse(output.split("\n")[0]).url) } catch (error) { reject(error) }
      })
    })
    function api(path) {
      const result = opencode(["api", "--server", url, "get", path,
        "--header", `x-opencode-directory:${host}`], host, env)
      if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout)
      return JSON.parse(result.stdout)
    }
    const expected = ["ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8",
      "opencode.config.agent", "opencode.config.compatibility"]
    const deadline = Date.now() + 30_000
    // Plugin loading is asynchronous. A successful /api/config or an empty list is NOT a health check.
    // El propio bucle ya reintenta su condición de sondeo, pero una EXCEPCIÓN de la api() interna
    // lo mataba sin reintento alguno (demostración del revisor S08: «TimeoutError: The operation
    // timed out» alcanzando a este bucle durante el setup, commit 55d127e). Tolerancia a la misma
    // familia de fallos transitorios de transporte que withServer (predicado compartido
    // isTransientTransportFailure): reintento acotado al deadline de 30 s YA EXISTENTE del bucle,
    // espera corta de 250 ms; sin cambiar arranque/URL, plugins esperados ni la función api().
    // No enmascara fallos reales: los plugins fallidos se detectan en cuanto una llamada tiene
    // éxito (el throw de failed.length se evalúa solo sobre respuestas realmente obtenidas), si
    // el proceso servidor muere (exitCode/signalCode) se propaga el error real del CLI y, si el
    // fallo persiste o no es de la familia, el error observado se lanza sin sustituirlo por el
    // mensaje «No están activos los plugins esperados».
    while (true) {
      let plugins
      try {
        plugins = api("/api/plugin").data
      } catch (error) {
        if (!isTransientTransportFailure(error) || server.exitCode !== null || server.signalCode !== null
          || Date.now() >= deadline) throw error
        await new Promise(resolve => setTimeout(resolve, 250))
        continue
      }
      const failed = plugins.filter(plugin => plugin.state.status === "failed")
      if (failed.length) throw new Error("Plugins que no cargan:\n" + failed.map(plugin =>
        `${plugin.source.path ?? plugin.id ?? "desconocido"}: ${plugin.state.error} (${plugin.state.ref ?? "sin referencia"})`).join("\n"))
      if (expected.every(id => plugins.some(plugin => plugin.id === id && plugin.state.status === "active")))
        return api("/api/config")
      if (Date.now() >= deadline) throw new Error(`No están activos los plugins esperados: ${expected.join(", ")}`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  } finally {
    server.kill()
    if (server.pid) await exited
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyOpenCode()
  console.log("Plugins verificados en un servidor privado; servicio compartido y sesiones existentes intactos.")
}
