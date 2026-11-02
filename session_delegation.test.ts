import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { api, withServer } from "./test-support/opencode.mjs"

test("S07 contrato nativo: delegación, continuación, espera y notificación no acreditan investigación por sí solas", { timeout: 180_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "delegation-contract-"))
  // Deterministic HTTP stand-in, not evidence of a model choosing the workflow.
  const http = createServer(async (req, res) => {
    let body = ""; for await (const part of req) body += part
    const request = JSON.parse(body)
    const messages = request.messages ?? []
    const lastUser = messages.findLastIndex((m: any) => m.role === "user")
    const text = JSON.stringify(messages[lastUser]?.content)
    const afterTool = messages.slice(lastUser + 1).some((m: any) => m.role === "tool")
    const gate = text.includes("fixture:confirm") && !afterTool
    const delegate = text.includes("fixture:delegate") && !afterTool
    const resume = text.includes("fixture:resume:") && !afterTool
    res.writeHead(200, { "content-type": "text/event-stream" })
    const delta = gate || delegate || resume ? { tool_calls: [{ index: 0, id: gate ? "gate-call" : "delegate-call", type: "function",
      function: gate ? { name: "contract_gate", arguments: "{}" }
        : { name: "subagent", arguments: JSON.stringify({ agent: "investigador", description: "Native contract fixture",
          prompt: resume ? "fixture:confirm" : "fixture:prepare", ...(resume ? { sessionID: text.match(/ses_[a-zA-Z0-9]+/)![0], background: true } : {}) }) } }] }
      : { content: text.includes("fixture:prepare") ? "PENDIENTE_CONFIRMACION pregunta/corpus/ref" : "RESULTADO verificado del fixture" }
    res.write(`data: ${JSON.stringify({ id: "fixture-response", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "fixture-response", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: {}, finish_reason: gate || delegate || resume ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>(resolve => http.close(() => resolve())))
  const port = (http.address() as any).port
  const config = join(root, ".opencode")
  await mkdir(config)
  await writeFile(join(config, "opencode.json"), JSON.stringify({ model: "fixture/test", snapshots: false,
    experimental: { subagent_depth: 4 },
    providers: { fixture: { name: "Synthetic", package: "@opencode/ai/providers/openai-compatible",
      settings: { apiKey: "fixture-not-a-secret", baseURL: `http://127.0.0.1:${port}/v1` }, models: { test: { capabilities: { tools: true } } } } },
    agents: { refinador: { mode: "all", permissions: [{ action: "*", resource: "*", effect: "allow" }] },
      investigador: { mode: "all", permissions: [{ action: "*", resource: "*", effect: "allow" }] } },
  }))
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [new URL("./test-support/delegation", import.meta.url).href] }) }
  await withServer(root, env, async connected => {
    const call = async (input: object) => {
      const response = await fetch(`${connected.OPENCODE_TEST_SERVER}/api/rpc/delegation-test/run`, { method: "POST",
        headers: { "content-type": "application/json", "x-opencode-directory": root,
          authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }, body: JSON.stringify({ input }) })
      assert.equal(response.status, 200, await response.clone().text())
      return (await response.json()).output
    }
    const contract = api("get", "/openapi.json", root, connected)
    await writeFile(join(root, "native-openapi.json"), JSON.stringify(contract))
    const parent = api("post", "/api/session", root, connected, { agent: "refinador", model: { providerID: "fixture", id: "test" }, title: "Native contract" }).data
    const catalog = await call({ action: "catalog" })
    await writeFile(join(root, "subagent-contract.json"), JSON.stringify(catalog, null, 2))
    api("post", `/api/session/${parent.id}/prompt`, root, connected, { text: "fixture:delegate" })
    await call({ action: "wait", sessionID: parent.id })
    const prepared = api("get", `/api/session/${parent.id}/context`, root, connected).data
    await writeFile(join(root, "prepare-result.json"), JSON.stringify(prepared, null, 2))
    const result = prepared.flatMap((m: any) => m.content ?? []).find((p: any) => p.type === "tool" && p.name === "subagent")
    const child = result.state.metadata.sessionID
    assert.ok(child)
    assert.match(JSON.stringify(result), /PENDIENTE_CONFIRMACION/)
    api("post", `/api/session/${parent.id}/prompt`, root, connected, { text: `fixture:resume:${child}` })
    await call({ action: "gate", sessionID: child })
    await call({ action: "wait", sessionID: parent.id })
    let settled = false
    const waiting = call({ action: "wait", sessionID: child }).then(r => { settled = true; return r }, error => ({ error: String(error) }))
    const active = api("get", `/api/session/${child}/context`, root, connected).data
    const running = active.flatMap((m: any) => m.content ?? []).findLast((p: any) => p.type === "tool" && p.name === "contract_gate")
    assert.equal(running.state.status, "running")
    assert.equal(settled, false)
    await call({ action: "release", sessionID: child })
    assert.equal((await waiting).waited, true)
    await call({ action: "event", sessionID: parent.id, type: "session.inbox.enqueued", afterCount: 2 })
    await call({ action: "wait", sessionID: parent.id })
    const notified = api("get", `/api/session/${parent.id}/context`, root, connected).data
    await writeFile(join(root, "parent-context.json"), JSON.stringify(notified, null, 2))
    const notification = notified.find((m: any) => m.type === "synthetic" && m.text?.includes(child))
    assert.ok(notification, "La notificación nativa identifica la sesión continuada")
    assert.match(notification.text, /RESULTADO verificado del fixture/)
    const context = api("get", `/api/session/${child}/context`, root, connected).data
    await writeFile(join(root, "child-context.json"), JSON.stringify(context, null, 2))
    const events = (await call({ action: "events" })).events
    await writeFile(join(root, "events.json"), JSON.stringify(events, null, 2))
    assert.ok(events.some((e: any) => e.type === "session.execution.started" && e.sessionID === child))
    assert.ok(context.some((m: any) => m.type === "assistant" && m.content.some((c: any) => c.type === "text" && c.text.includes("RESULTADO"))))
    const inputs = context.filter((m: any) => m.type === "user")
    assert.equal(inputs.length, 2)
    assert.notEqual(inputs[0].id, inputs[1].id, "La continuación tiene otro mensaje nativo en la misma sesión")
    assert.ok(context.findIndex((m: any) => m.type === "idle") < context.indexOf(inputs[1]), "El primer idle solo cerraba la preparación")
    assert.ok(events.filter((e: any) => e.type === "session.execution.started" && e.sessionID === child).length === 2)
    t.diagnostic(`Private native evidence: ${root}`)
  }, ["delegation-test"])
})
