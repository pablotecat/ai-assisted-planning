import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { executable, isTransientTransportFailure, opencode } from "../scripts/verify-opencode.mjs"

export { opencode }

export function api(method, path, cwd, env, data) {
  const server = env?.OPENCODE_TEST_SERVER
  const result = opencode(["api", ...(server ? ["--server", server] : ["--standalone"]), method, path,
    ...(data === undefined ? [] : ["--data", JSON.stringify(data)])], cwd, env)
  assert.equal(result.status, 0, result.error?.message || result.stderr + result.stdout)
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined
}

export async function withServer(cwd, env, run, expected = ["planning-test"]) {
  expected = [...expected, "opencode.config.agent", "opencode.config.compatibility"]
  const inline = JSON.parse(env.OPENCODE_CONFIG_CONTENT || "{}")
  inline.mcp = { servers: Object.fromEntries(["codegraph", "jira", "atlassian", "ado"].map(name =>
    [name, { type: "remote", url: "http://127.0.0.1:1/mcp", disabled: true }])) }
  env = { ...env, OPENCODE_PASSWORD: randomUUID(), OPENCODE_CONFIG_CONTENT: JSON.stringify(inline) }
  const server = spawn(executable, ["serve", "--hostname", "127.0.0.1", "--port", "0", "--stdio"],
    { cwd, env: { ...env, OPENCODE_DB: ":memory:" }, stdio: ["pipe", "pipe", "pipe"] })
  const exited = new Promise(resolve => server.once("exit", resolve))
  let stderr = ""
  server.stderr.on("data", data => { stderr += data })
  try {
    const url = await new Promise((resolve, reject) => {
      let output = ""
      const timeout = setTimeout(() => reject(new Error(`Server startup timeout: ${stderr}`)), 30_000)
      server.once("error", reject)
      server.once("exit", () => { clearTimeout(timeout); reject(new Error(stderr)) })
      server.stdout.on("data", data => {
        output += data
        if (!output.includes("\n")) return
        clearTimeout(timeout)
        try { resolve(JSON.parse(output.split("\n")[0]).url) } catch (error) { reject(error) }
      })
    })
    const connected = { ...env, OPENCODE_TEST_SERVER: url }
    // Tanto la comprobación de salud inicial como la primera llamada /api/plugin del bucle de
    // plugins pueden toparse con un fallo transitorio de transporte del CLI contra un servidor
    // privado recién arrancado. Firma original demostrada en suites raíz completas («Could not
    // reach server … Transport: The operation timed out», trama real en el primer sondeo de
    // plugins; ver R1-F2/9322e78). Tres firmas más de la misma familia quedaron demostradas sin
    // cobertura durante el desarrollo y revisión del núcleo S08 (commit 55d127e): «spawnSync
    // cmd.exe ETIMEDOUT» y «aborted due to timeout» del timeout del spawnSync en
    // withServer/prepareConsumer (implementador, reproducido 2 veces, superado por repetición
    // aislada) y «TimeoutError: The operation timed out» en la ruta de verifyOpenCode (revisor).
    // La CAUSA subyacente de todos ellos permanece INDETERMINADA (misma familia que el
    // ETIMEDOUT histórico de S05); este reintento no la atribuye ni la resuelve.
    // Predicado compartido isTransientTransportFailure (definido junto a opencode() en
    // scripts/verify-opencode.mjs) para que ambos consumidores coincidan exactamente: solo
    // cubre la familia OBSERVADA de fallos de transporte/arranque del proceso CLI; los errores
    // de dominio reales del servidor (HTTP 4xx/5xx, plugins fallidos) no contienen estas firmas
    // y siguen fallando en firme.
    // Reintento acotado compartido por ambas llamadas, dentro del presupuesto (deadline) ya
    // existente de cada llamada y con espera corta de 250 ms; si el proceso del servidor muere,
    // se agota el presupuesto o el fallo no es de la familia, se propaga el error real del CLI
    // sin enmascarar (los plugins fallidos se siguen detectando en cuanto una llamada tiene
    // éxito: assert.deepEqual(failed, []) solo mira respuestas reales).
    const retryTransport = async (deadline, fetch) => {
      while (true) {
        try {
          return fetch()
        } catch (error) {
          if (!isTransientTransportFailure(error) || server.exitCode !== null
            || server.signalCode !== null || Date.now() >= deadline) throw error
          await new Promise(resolve => setTimeout(resolve, 250))
        }
      }
    }
    await retryTransport(Date.now() + 30_000, () => api("get", "/api/location", cwd, connected))
    const deadline = Date.now() + 30_000
    while (true) {
      const plugins = (await retryTransport(deadline, () => api("get", "/api/plugin", cwd, connected))).data
      const failed = plugins.filter(plugin => plugin.state.status === "failed")
      assert.deepEqual(failed, [], JSON.stringify(failed))
      if (expected.every(id => plugins.some(plugin => plugin.id === id && plugin.state.status === "active"))) break
      if (Date.now() >= deadline) throw new Error(`Plugins not ready: ${expected.join(", ")}; ${stderr}`)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return await run(connected)
  } catch (error) {
    const log = await readFile(join(env.XDG_DATA_HOME, "opencode", "log", "opencode.log"), "utf8").catch(() => "")
    throw new Error(error.message + "\n" + stderr + "\n" + log.split("\n").filter(line => /role=server/.test(line)).slice(-30).join("\n"), { cause: error })
  } finally { server.kill(); await exited }
}

export const probePlugin = new URL("./probe", import.meta.url).href
export function probe(cwd, env, input) {
  return api("post", "/api/rpc/planning-test/run", cwd, env, { input }).output
}
