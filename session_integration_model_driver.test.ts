import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { consentS14, correction, runIntegration, runTurn } from "./test-support/integration-model/verify-model.mjs"
import { prepareTrial } from "./test-support/source-model/verify-model.mjs"
import { evidenceWriter } from "./test-support/evidence-model/verify-model.mjs"
import { privateRequest } from "./test-support/delegation/verify-model.mjs"
import { withServer } from "./test-support/opencode.mjs"

test("S14 driver: opt-in propio, modelo único y ventana renovada explícita antes de efectos", () => {
  const valid = { OPENCODE_INTEGRATION_MODEL_CONSENT: "s14-integrated", OPENCODE_INTEGRATION_FLOW_MS: "900000", OPENCODE_INTEGRATION_WINDOW_MS: "1200000" }
  assert.deepEqual(consentS14(valid), { flow: 900000, window: 1200000 })
  assert.deepEqual(consentS14({ ...valid, OPENCODE_INTEGRATION_FLOW_MS: "5400000", OPENCODE_INTEGRATION_WINDOW_MS: "6000000" }),
    { flow: 5400000, window: 6000000 })
  for (const change of [{ OPENCODE_INTEGRATION_MODEL_CONSENT: "s13-context" }, { OPENCODE_EVIDENCE_MODEL: "other/model" },
    { OPENCODE_INTEGRATION_FLOW_MS: "5400001" }, { OPENCODE_INTEGRATION_FLOW_MS: "0" },
    { OPENCODE_INTEGRATION_FLOW_MS: "0.5" }, { OPENCODE_INTEGRATION_WINDOW_MS: "6000001" },
    { OPENCODE_INTEGRATION_WINDOW_MS: "930000" }])
    assert.throws(() => consentS14({ ...valid, ...change }))
  const result = spawnSync(process.execPath, ["test-support/integration-model/verify-model.mjs"], {
    cwd: import.meta.dirname, env: { ...process.env, OPENCODE_INTEGRATION_MODEL_CONSENT: "" }, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
})

test("S14 driver: corrección de encabezado exacta y única sin seleccionar secciones ambiguas", () => {
  const content = "# APP-1 — Compra\n\nCuerpo intacto\n"
  const result = correction(content)
  assert.equal(result.previous, "# APP-1 — Compra")
  assert.equal(content.replace(result.previous, result.next), "# APP-1 — Compra — edición corregida\n\nCuerpo intacto\n")
  assert.throws(() => correction("Sin encabezado"))
  assert.throws(() => correction(content + content))
})

test("S14 driver: un fallo nativo no reenvía el objetivo; plazo vencido no admite el siguiente", async () => {
  let prompts = 0
  const request = async (method: string, path: string) => {
    if (method === "POST" && path.endsWith("/prompt")) { prompts++; return { data: { id: "u" } } }
    if (path === "/api/session") return { data: [{ id: "ses_root" }] }
    return { output: { events: [{ type: "session.execution.failed", sessionID: "ses_root", at: Date.now() }] } }
  }
  const args = { request, parent: { id: "ses_root" }, prompt: "goal", deadline: Date.now() + 1000, writer: { record: async () => {} }, turn: 1 }
  await assert.rejects(runTurn(args), /failed; no retry/)
  assert.equal(prompts, 1)
  await assert.rejects(runTurn({ ...args, deadline: Date.now() - 1, turn: 2 }), /flow exhausted/)
  assert.equal(prompts, 1)
})

test("S14 nativo: segundo input solo tras cierre nativo exacto del primero, sin acreditar campaña por fixture", { timeout: 240_000 }, async t => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s14-native-"))
  const requests: any[] = []
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); requests.push(body)
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: { content: "PROGRAMMED: plumbing only" }, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const { host, config, settings, env } = await prepareTrial(root, { providerID: "fixture", id: "test" }, "")
  settings.plugins.push(new URL("./test-support/context-model/observer", import.meta.url).href)
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { package: "@opencode/ai/providers/openai-compatible", settings: {
    apiKey: "synthetic", baseURL: `http://127.0.0.1:${(server.address() as any).port}/v1` },
    models: { test: { capabilities: { tools: true, input: ["text"], output: ["text"] } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host), writer = evidenceWriter(root)
    const parent = (await request("POST", "/api/session", { agent: "refinador", model: { providerID: "fixture", id: "test" } })).data
    const deadline = Date.now() + 60_000
    const first = await runTurn({ request, writer, parent, prompt: "first-goal", deadline, turn: 1 })
    const second = await runTurn({ request, writer, parent, prompt: "later-question", deadline, turn: 2 })
    assert.notEqual(first.admitted.id, second.admitted.id)
    assert.ok(first.final.time.completed < second.final.time.created)
    assert.equal(requests.length, 2)
    const interrupted: string[] = [], summary: any = {}
    const observedRequest = async (method: string, path: string, input?: any, timeout?: number) => {
      if (path.endsWith("/interrupt?resume=false")) interrupted.push(path)
      return request(method, path, input, timeout)
    }
    await assert.rejects(runIntegration({ request: observedRequest, writer, summary, host, flow: 30_000,
      selectedModel: { providerID: "fixture", id: "test" } }), /Confirmed complete root delivery/)
    assert.equal(summary.check, "failed", "Una respuesta programada sin entrega no aprueba la campaña")
    assert.equal(summary.stages.length, 1, "Sin publicación no se admite promoción, corrección ni pregunta posterior")
    assert.equal(summary.fixtureClosed, true)
    assert.deepEqual(interrupted, [`/api/session/${summary.sessionID}/interrupt?resume=false`], "Limpia solo su propio árbol")
    assert.equal(requests.length, 3, "No hay reintentos del objetivo fallido")
    await writer.save("result.json", { scope: "S14 native boundaries only", trialAccepted: false, first, second, realModelCalls: 0 })
  }, ["delegation-test", "source-model-fixture", "context-model-observer", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  console.log("S14 native evidence: " + root)
})
