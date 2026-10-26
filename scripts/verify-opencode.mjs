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
    while (true) {
      const plugins = api("/api/plugin").data
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
