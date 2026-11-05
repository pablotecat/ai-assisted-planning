import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { withServer } from "./test-support/opencode.mjs"
import { privateRequest } from "./test-support/delegation/verify-model.mjs"
import { evidenceWriter, prepareConsumer, textOf } from "./test-support/evidence-model/verify-model.mjs"
import { runContextCase } from "./test-support/context-model/verify-model.mjs"
import { avance, objective } from "./test-support/context-model/data.mjs"

// Programmed provider only: this motor check exercises the S13 driver plumbing
// (sessions, inbox, polling, capture, dispatch recording, case classification)
// without any real model call. The admission case has no delegation; the
// dedicated case programs an active child only to test capture, never 13.4 acceptance.
test("S13 nativo: admite avance con padre ocupado y sin hijo, captura respuesta sin acreditar 13.4", { timeout: 240_000 }, async t => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s13-native-"))
  const requests: any[] = []
  const objectiveStarted = Promise.withResolvers<void>(), releaseObjective = Promise.withResolvers<void>()
  const releaseChild = Promise.withResolvers<void>()
  t.after(() => releaseObjective.resolve())
  t.after(() => releaseChild.resolve())
  const provider = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw); requests.push(body)
    const userTurns = (body.messages ?? []).filter((message: any) => message.role === "user").length
    const userInput = JSON.stringify((body.messages ?? []).filter((message: any) => message.role === "user"))
    const activeCase = userInput.includes("probe-active")
    const childCase = userInput.includes("probe-child")
    if (!activeCase && !childCase && userTurns < 2) {
      objectiveStarted.resolve()
      await releaseObjective.promise
    }
    // Reproduce the observed driver failure: a valid advance takes longer than
    // the former 20 s native-wait cap, but remains inside the 60 s fixture flow.
    if (!activeCase && !childCase && userTurns >= 2) await new Promise(resolve => setTimeout(resolve, 21_000))
    let delta: any = userTurns >= 2
      ? { content: "PROGRAMMED: avance parcial; sigue pendiente del investigador; siguiente acción: esperar su lectura." }
      : { content: "PROGRAMMED: objetivo registrado; resolveré con mi investigador antes de cerrar la candidata." }
    const tool = (name: string, args: object) => ({ tool_calls: [{ index: 0, id: "native-" + requests.length,
      type: "function", function: { name, arguments: JSON.stringify(args) } }] })
    if (childCase) {
      const results = (body.messages ?? []).filter((message: any) => message.role === "tool")
      if (!results.length) delta = tool("skill", { id: "operativa-comun" })
      else if (results.length === 1) delta = tool("execute", { code: 'return await tools.jira.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey:"APP-1",view:"full"});' })
      else { await releaseChild.promise; delta = { content: "PROGRAMMED: child done" } }
    } else if (activeCase) {
      if (userTurns >= 2) delta = { content: "PROGRAMMED: avance parcial; hijo activo, evidencia pendiente, efecto en la candidata; siguiente acción: esperar." }
      else if (!(body.messages ?? []).some((message: any) => message.role === "tool"))
        delta = tool("subagent", { agent: "investigador", description: "Native active child fixture", prompt: "probe-child", background: true })
      else delta = { content: "PROGRAMMED: objective admitted with child" }
    }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "native", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: delta.tool_calls ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  const url = `http://127.0.0.1:${(provider.address() as any).port}`
  const model = { providerID: "fixture", id: "test" }
  const { host, config, settings, env } = await prepareConsumer(root, model, "")
  settings.plugins = [new URL("./test-support/context-model/observer", import.meta.url).href, ...settings.plugins]
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { name: "Programmed only", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: url + "/v1" },
    models: { test: { capabilities: { tools: true, input: ["text"], output: ["text"] } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  await withServer(host, env, async connected => {
    const rawRequest = privateRequest(connected, host)
    const writer = evidenceWriter(root)
    writer.secrets.push(connected.OPENCODE_PASSWORD)
    let advances = 0
    const request = async (method: string, path: string, input?: any, timeout?: number) => {
      if (method === "POST" && path.endsWith("/prompt") && input.text === avance) {
        advances++
        try {
          const sessions = (await rawRequest("GET", "/api/session")).data
          const parent = sessions.find((session: any) => path.includes(session.id))
          assert.ok(parent && parent.time.idle == null, "El objetivo sigue ocupado al encolar el avance")
          assert.equal(sessions.filter((session: any) => session.parentID === parent.id).length, 0,
            "No hay hijo cuya aparición pueda habilitar el avance")
          const admitted = await rawRequest(method, path, input, timeout)
          await writer.save("admission-boundary.json", { parentBusy: true, children: 0, inboxID: admitted.data.id, at: Date.now() })
          return admitted
        } finally { releaseObjective.resolve() }
      }
      const result = await rawRequest(method, path, input, timeout)
      if (method === "POST" && path.endsWith("/prompt") && input.text === objective)
        await objectiveStarted.promise
      return result
    }
    const summary: any = { scope: "S13 native plumbing only", model, check: "in_progress", started: Date.now() }
    try { await runContextCase({ request, writer, summary, host, flow: 60_000, model, avanceDelay: 100 }) }
    finally { releaseObjective.resolve() }
    assert.equal(summary.check, "review_required", "Las comprobaciones mecánicas del driver deben pasar con proveedor programado")
    assert.equal(advances, 1, "El avance se admite una sola vez")
    assert.equal(summary.avance.childSeen, null)
    assert.equal(summary.cases.delegacionConReglas.observed, false, "El fixture no acredita delegación: efecto falso del propio diseño")
    assert.equal(summary.cases.preentregaConHijoActivo.observed, false, "Sin hijo activo el caso B no se observa desde un fixture")
    const marks = summary.cases.preentregaConHijoActivo.marks
    assert.equal(marks.pendiente, true, "El marcador estructural del avance programado se registra")
    const messages = (await request("GET", `/api/session/${summary.sessionID}/message`)).data
    const stops = messages.filter((message: any) => message.type === "assistant" && message.finish === "stop")
    assert.ok(stops.some((message: any) => /avance parcial.*siguiente acción/.test(textOf(message))),
      "La respuesta programada del avance queda registrada íntegra en los mensajes")
    for (const message of messages.filter((message: any) => message.type === "assistant"))
      assert.equal(message.model?.id, "test")
    assert.equal(requests.length, 2, "Exactamente dos turnos de chat, sin reintentos ni modelo real")
    for (const body of requests) assert.equal(body.model, "test")
    const events = (await request("POST", "/api/rpc/context-model-observer/run", { input: { action: "events" } })).output.events
    await writer.save("events.json", events)
    for (const type of ["session.inbox.enqueued", "session.inbox.delivered"])
      assert.ok(events.some((event: any) => event.type === type && event.inboxID === summary.avance.inboxID),
        `Captura nativa del avance propio: ${type}`)
    const dedicated: any = { scope: "S13 active-child plumbing only", model, check: "in_progress" }
    await runContextCase({ request: rawRequest, writer, summary: dedicated, host, flow: 60_000, model,
      objectiveText: "probe-active", avanceTrigger: "active-child" })
    assert.equal(dedicated.check, "review_required", dedicated.error)
    assert.ok(dedicated.activeChildEvent.childID)
    assert.equal(dedicated.avance.childSeen, dedicated.activeChildEvent.childID)
    assert.equal(dedicated.cases.preentregaConHijoActivo.observed, true, "El escenario captura un hijo realmente activo; no es aprobación semántica")
    assert.equal(dedicated.cases.delegacionConReglas.observed, true, "La fixture prueba captura de reglas y lectura; el dictamen semántico sigue pendiente")
    const absent = (await rawRequest("POST", "/api/rpc/context-model-observer/run", {
      input: { action: "active-child", parentID: summary.sessionID, timeout: 50 } })).output
    assert.equal(absent.childID, null, "Una ventana sin hijo devuelve diagnóstico sin agotar el HTTP ni crear sesiones")
    releaseChild.resolve()
  }, ["delegation-test", "evidence-model-fixture", "context-model-observer",
    "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  console.log(`S13 native driver evidence: ${root}`)
})
