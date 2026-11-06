import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { prepareConsumer, privateRequest, withServer } from "../test-support/opencode.mjs"
import { png } from "../test-support/attachments/data.mjs"

const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex")

test("S09 nativo: read y adjunto URI presentan los bytes al proveedor programado, no acredita lectura visual", { timeout: 240_000 }, async t => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s09-native-"))
  const bytes = png(), requests: any[] = [], downloads: string[] = []
  let file = ""
  let url = ""
  let snapshotRead: any
  const provider = createServer(async (req, res) => {
    if (req.method === "GET") {
      downloads.push(req.url!)
      if (req.url !== "/attachment.png") { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "content-type": "image/png" }); res.end(bytes); return
    }
    let raw = ""; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); requests.push(body)
    const first = requests.length === 1
    const probeFetch = JSON.stringify(body.messages?.findLast((m: any) => m.role === "user")).includes("probe-fetch") && !body.messages?.some((m: any) => m.role === "tool")
    let delta: any = first || probeFetch ? { tool_calls: [{ index: 0, id: first ? "native-read" : "native-fetch", type: "function",
      function: { name: first ? "read" : "execute", arguments: JSON.stringify(first ? { path: file }
        : { code: `const r = await fetch(${JSON.stringify(url + "/attachment.png")}); const b = await r.bytes(); return {keys:Object.keys(r),arrayBuffer:typeof r.arrayBuffer,status:r.status,base64:b.toBase64()};` }) } }] } : { content: "PROGRAMMED: not a visual answer" }
    const start = body.messages.findLastIndex((m: any) => m.role === "user" && /probe-(snapshot|reuse)/.test(JSON.stringify(m.content)))
    const snapshotMode = start >= 0 && JSON.stringify(body.messages[start]).includes("probe-snapshot")
    const reuseMode = start >= 0 && JSON.stringify(body.messages[start]).includes("probe-reuse")
    const results = body.messages.slice(start + 1).filter((m: any) => m.role === "tool").map((m: any) => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
    const call = (name: string, args: object) => ({ tool_calls: [{ index: 0, id: "snapshot-" + requests.length, type: "function", function: { name, arguments: JSON.stringify(args) } }] })
    if (reuseMode && !results.length) delta = call("session_artifacts", snapshotRead)
    if (snapshotMode) {
      const base = { corpus: "fixture", referencia: "v1" }
      if (!results.length) delta = call("session_work", { action: "create", ...base, pregunta: "Adjunto", criterios: [] })
      else if (results.length === 1) {
        const workID = /"id"\s*:\s*"(work-[a-f0-9-]+)"/.exec(results[0])![1]
        snapshotRead = { action: "read", ...base, encargo_id: workID }
        delta = call("execute", { code: `const r = await fetch(${JSON.stringify(url + "/attachment.png")});
          if (!r.ok) throw new Error("Download failed");
          const original = (await r.bytes()).toBase64();
          return await tools.sesion.capture_agent_source(${JSON.stringify({ ...base, encargo_id: workID,
            fuente: "APP-9:attachment:1", operacion_id: "png-native", representacion: "png_base64" }).slice(0, -1)},resultado:original});` })
      } else if (results.length === 2) {
        const cap = JSON.parse(results[1]); Object.assign(snapshotRead, { artefacto_id: cap.instantanea_id, archivo: cap.archivo })
        delta = call("session_artifacts", snapshotRead)
      }
    }
    const callsTool = !!delta.tool_calls
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: callsTool ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  url = `http://127.0.0.1:${(provider.address() as any).port}`
  const { host, config, settings, env } = await prepareConsumer(root)
  file = join(host, "attachment.png"); await writeFile(file, bytes)
  settings.plugins = []
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { name: "Programmed only", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: url + "/v1" },
    models: { test: { capabilities: { tools: true, input: ["text", "image"], output: ["text"] } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host)
    const run = async (files?: any[], text = "Comprueba el adjunto sintético.") => {
      const session = (await request("POST", "/api/session", { agent: "lector-documentacion", title: "S09 native", model: { providerID: "fixture", id: "test" } })).data
      await request("POST", `/api/session/${session.id}/prompt`, { text: text + (files ? "" : ` Archivo: ${file}`), ...(files ? { files } : {}) })
      await request("POST", `/api/experimental/session/${session.id}/wait`, {}, 30_000)
      return session.id
    }
    const readID = await run()
    const messages = (await request("GET", `/api/session/${readID}/message`)).data
    await writeFile(join(root, "messages.json"), JSON.stringify(messages, null, 2))
    assert.equal(requests.length, 2, "Native read and continuation both dispatched")
    const media = requests.flatMap(r => r.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : [])
      .filter(p => p.type === "image_url")
    assert.ok(media.some(p => p.image_url.url === "data:image/png;base64," + bytes.toString("base64")), "Exact PNG bytes must reach the programmed provider, not merely a filename")
    const remoteSession = (await request("POST", "/api/session", { agent: "lector-documentacion", title: "S09 remote" })).data
    const remote = await fetch(connected.OPENCODE_TEST_SERVER + `/api/session/${remoteSession.id}/prompt`, {
      method: "POST", headers: { "content-type": "application/json", "x-opencode-directory": host,
        authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") },
      body: JSON.stringify({ text: "Adjunto sintético.", files: [{ uri: url + "/attachment.png" }] }) })
    const remoteDiagnostic = { status: remote.status, body: await remote.text() }
    await writeFile(join(root, "remote-diagnostic.json"), JSON.stringify(remoteDiagnostic, null, 2))
    console.log("S09 remote URI: " + JSON.stringify(remoteDiagnostic))
    assert.equal(remote.status, 400)
    await run([{ uri: "data:image/png;base64," + bytes.toString("base64"), name: "attachment.png" }])
    assert.deepEqual(downloads, [])
    assert.ok(requests.at(-1).messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url" && p.image_url.url === "data:image/png;base64," + bytes.toString("base64"))))
    assert.equal(hash(await readFile(file)), hash(bytes))
    const fetchID = await run(undefined, "probe-fetch")
    const fetchMessages = (await request("GET", `/api/session/${fetchID}/message`)).data
    await writeFile(join(root, "fetch-messages.json"), JSON.stringify(fetchMessages, null, 2))
    const fetched = fetchMessages.flatMap((m: any) => m.content ?? []).find((p: any) => p.type === "tool")
    const result = JSON.parse(fetched.state.content.find((c: any) => c.type === "text").text)
    assert.equal(result.arrayBuffer, "undefined")
    assert.deepEqual(Buffer.from(result.base64, "base64"), bytes)
    console.log("S09 fetch bytes: " + Buffer.from(result.base64, "base64").length + ", arrayBuffer: " + result.arrayBuffer)
    const snapID = await run(undefined, "probe-snapshot")
    assert.equal(downloads.length, 2, "Una descarga para probar bytes y una para capturar, no para leer la instantánea")
    const snapMessages = (await request("GET", `/api/session/${snapID}/message`)).data
    await writeFile(join(root, "snapshot-messages.json"), JSON.stringify(snapMessages, null, 2))
    const presented = snapMessages.flatMap((m: any) => m.content ?? []).find((p: any) => p.type === "tool" && p.name === "session_artifacts")
    assert.equal(presented.state.status, "completed")
    assert.ok(presented.state.content.some((c: any) => c.type === "file" && c.uri === "data:image/png;base64," + bytes.toString("base64")))
    assert.ok(requests.at(-1).messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === "image_url" && p.image_url.url === "data:image/png;base64," + bytes.toString("base64"))))
    const controls = await readFile(join(config, "agent-settings.json"), "utf8")
    const disabled = JSON.parse(controls); disabled.agentes["lector-documentacion"].guardarEntregablesEnSesion = false
    await writeFile(join(config, "agent-settings.json"), JSON.stringify(disabled))
    await request("POST", "/api/location/reload", {})
    await request("POST", `/api/session/${snapID}/prompt`, { text: "probe-reuse" })
    await request("POST", `/api/experimental/session/${snapID}/wait`, {}, 30_000)
    assert.equal(downloads.length, 2, "Reutilización tras reload no descarga, aun con guardado desactivado")
    const reused = (await request("GET", `/api/session/${snapID}/message`)).data
      .flatMap((m: any) => m.content ?? []).filter((p: any) => p.type === "tool" && p.name === "session_artifacts" && p.state.status === "completed")
    assert.equal(reused.length, 2, "Hay dos lecturas nativas completas, no solo ausencia de descargas")
    await writeFile(join(root, "result.json"), JSON.stringify({ readID, requests: requests.length, downloads, pngSha256: hash(bytes), realModelCalls: 0, visualRead: false }, null, 2))
  }, ["ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  console.log(`S09 native evidence: ${root}`)
})
