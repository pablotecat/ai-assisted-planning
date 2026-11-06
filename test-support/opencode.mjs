import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
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
    // Retry only known startup transport failures within each deadline.
    // The shared predicate keeps domain errors and failed plugins fatal.
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

// Only the private server's generated password is used, never shared credentials.
export function privateRequest(connected, host) {
  const headers = { "content-type": "application/json", "x-opencode-directory": host,
    authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }
  return async (method, path, input, timeout = 30_000) => {
    assert.ok(timeout > 0, `Private request budget exhausted: ${path}`)
    const response = await fetch(connected.OPENCODE_TEST_SERVER + path, { method, headers,
      ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(Math.ceil(timeout)) })
    assert.ok(response.ok, `Private request ${path}: ${response.status}`)
    const text = await response.text()
    return text ? JSON.parse(text) : {}
  }
}

export async function prepareConsumer(root) {
  const source = fileURLToPath(new URL("..", import.meta.url))
  const host = join(root, "consumer"), config = join(host, ".opencode")
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config/opencode"), OPENCODE_CONFIG: "", OPENCODE_CONFIG_CONTENT: "{}", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    TEMP: root, TMP: root, TMPDIR: root, npm_config_cache: join(process.env.LOCALAPPDATA, "npm-cache") }
  delete env.OPENCODE_SESSION_ID
  await mkdir(join(config, "agents"), { recursive: true })
  for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(config, dir === "plugin" ? "plugins" : dir), { recursive: true })
  await cp(join(source, ".apm/skills"), join(host, ".agents/skills"), { recursive: true })
  for (const agent of ["refinador", "investigador", "lector-codigo", "lector-documentacion", "revisor"])
    await cp(join(source, ".apm/agents", `${agent}.agent.md`), join(config, "agents", `${agent}.md`))
  for (const name of ["package.json", "agent-settings.example.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  execFileSync(process.execPath, [join(source, "scripts/setup-opencode.mjs")], { cwd: host, env, timeout: 240_000, stdio: "pipe" })
  const settings = JSON.parse(await readFile(join(config, "opencode.json"), "utf8"))
  settings.model = "fixture/test"
  return { host, config, env, settings }
}

export async function loadStates(host) {
  const control = join(host, "informes-agente/sesiones/.control")
  const dirs = await readdir(control).catch(error => { if (error.code === "ENOENT") return []; throw error })
  return Promise.all(dirs.map(async dir => JSON.parse(await readFile(join(control, dir, "state.json"), "utf8"))))
}

export function saveEvidence(root, name, value) {
  const sanitize = value => {
    if (typeof value === "string") return value
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
      .replace(/https?:\/\/[^\s"<>]+[?][^\s"<>]+/gi, "[URL_WITH_QUERY_REDACTED]")
    if (Array.isArray(value)) return value.map(sanitize)
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/^(authorization|headers|password|access|refresh|apiKey|native|reasoning|encryptedContent)$/i.test(key))
      .map(([key, v]) => [key, sanitize(v)]))
    return value
  }
  return writeFile(join(root, name), JSON.stringify(sanitize(value), null, 2) + "\n")
}
