import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { api, withServer } from "./test-support/opencode.mjs"

test("S07 consumidor instalado: eventos concurrentes con dos, secuenciales con uno y corpus erróneo aislado", { timeout: 360_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "delegation-concurrency-")), config = join(root, ".opencode")
  t.diagnostic(`Private programmed fixture (not model behavior): ${root}`)
  const http = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk
    const request = JSON.parse(body), messages = request.messages
    const index = messages.findLastIndex((m: any) => m.role === "user")
    const text = JSON.stringify(messages[index]?.content)
    await writeFile(join(root, "provider-tools.json"), JSON.stringify(request.tools?.map((tool: any) => tool.function?.name)))
    const tools = messages.slice(index + 1).filter((m: any) => m.role === "tool")
    const delegate = text.includes("fixture:delegate:") || text.includes("fixture:resume:")
    const confirm = !delegate && text.includes("CONFIRMAR")
    const name = delegate && tools.length === 0 ? "subagent" : confirm && tools.length === 0 ? "session_work" : confirm && tools.length === 1 ? "contract_gate" : undefined
    const args = name === "subagent" ? { agent: "investigador", description: "Programmed native delegation",
      prompt: text.includes("fixture:resume:") ? `CONFIRMAR ${text.match(/work-[a-f0-9-]+/)![0]} ${text.match(/exec-[a-f0-9-]+/)![0]}` : `fixture:prepare:${text.match(/Q\d+/)![0]}`,
      ...(text.includes("fixture:resume:") ? { sessionID: text.match(/ses_[a-zA-Z0-9]+/)![0], background: true } : {}) }
      : name === "session_work" ? { action: "start", encargo_id: text.match(/work-[a-f0-9-]+/)![0], ejecucion_id: text.match(/exec-[a-f0-9-]+/)![0] } : {}
    const delta = name ? { tool_calls: [{ index: 0, id: `${name}-${tools.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
      : { content: text.includes("fixture:prepare:") ? `PENDIENTE_CONFIRMACION ${text.match(/Q\d+/)![0]} fixture v1` : confirm ? `RESULTADO exacto ${text.match(/exec-[a-f0-9-]+/)![0]}` : "Padre disponible" }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>(resolve => http.close(() => resolve())))
  await mkdir(join(config, "agents"), { recursive: true })
  const source = fileURLToPath(new URL(".", import.meta.url))
  for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(config, dir === "plugin" ? "plugins" : dir), { recursive: true })
  for (const name of ["package.json", "agent-settings.example.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  for (const agent of ["refinador", "investigador", "revisor", "lector-codigo", "lector-documentacion"]) {
      const role = await readFile(join(source, ".apm", "agents", `${agent}.agent.md`), "utf8")
      // Only the synthetic barrier is added to these private consumer roles. Production permissions stay unchanged.
      await writeFile(join(config, "agents", `${agent}.md`), ["refinador", "investigador"].includes(agent)
        ? role.replace(/\r?\n---\r?\n/, "\n  contract_gate: allow\n---\n") : role)
  }
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [new URL("./test-support/delegation", import.meta.url).href] }),
    npm_config_cache: join(process.env.LOCALAPPDATA!, "npm-cache") }
  const setup = spawnSync(process.execPath, [join(source, "scripts/setup-opencode.mjs")], { cwd: root, env, encoding: "utf8", timeout: 240_000 })
  assert.equal(setup.status, 0, setup.error?.message || setup.stdout + setup.stderr)
  const installed = JSON.parse(await readFile(join(config, "opencode.json"), "utf8"))
  Object.assign(installed, { model: "fixture/test", snapshots: false, providers: { fixture: { name: "Programmed stand-in",
    package: "@opencode/ai/providers/openai-compatible", settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${(http.address() as any).port}/v1` },
    models: { test: { capabilities: { tools: true } } } } } })
  await writeFile(join(config, "opencode.json"), JSON.stringify(installed))
  await withServer(root, env, async connected => {
    const rpc = async (input: object) => {
      const response = await fetch(`${connected.OPENCODE_TEST_SERVER}/api/rpc/delegation-test/run`, { method: "POST",
        headers: { "content-type": "application/json", "x-opencode-directory": root, authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }, body: JSON.stringify({ input }) })
      const data = await response.json()
      assert.equal(response.status, 200, JSON.stringify(data))
      return data.output
    }
    for (const limit of [2, 1]) {
      await writeFile(join(root, "native-agents.json"), JSON.stringify(await rpc({ action: "agents" }), null, 2))
      const settingsPath = join(config, "agent-settings.json"), settings = JSON.parse(await readFile(settingsPath, "utf8"))
      settings.agentes.refinador.maxConsultasParalelas = limit
      await writeFile(settingsPath, JSON.stringify(settings))
      const parent = api("post", "/api/session", root, connected, { agent: "refinador", model: { providerID: "fixture", id: "test" }, title: `Limit ${limit}` }).data
      api("post", `/api/session/${parent.id}/prompt`, root, connected, { text: "fixture:parent" })
      await rpc({ action: "wait", sessionID: parent.id })
      const parentMessage = api("get", `/api/session/${parent.id}/context`, root, connected).data.findLast((m: any) => m.type === "assistant").id
      const invoke = async (tool: string, args: object) => {
        const { result } = await rpc({ tool, args, sessionID: parent.id, messageID: parentMessage, agent: "refinador" })
        const content = result.content
        return JSON.parse(typeof content === "string" ? content : content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"))
      }
      const work = (args: object) => invoke("session_work", args)
      const delegate = async (text: string) => {
        api("post", `/api/session/${parent.id}/prompt`, root, connected, { text })
        await rpc({ action: "wait", sessionID: parent.id })
        const context = api("get", `/api/session/${parent.id}/context`, root, connected).data
        await writeFile(join(root, `parent-limit-${limit}.json`), JSON.stringify(context, null, 2))
        return context.flatMap((m: any) => m.content ?? []).findLast((p: any) => p.type === "tool" && p.name === "subagent")
      }
      const main = (await work({ action: "create", pregunta: "Candidata", criterios: ["CA-1", "CA-2"], corpus: "fixture", referencia: "v1" })).encargo
      const queries: any[] = []
      for (const n of [1, 2]) {
        const response = await delegate(`fixture:delegate:Q${n}`)
        assert.equal(response.state.status, "completed", JSON.stringify(response))
        const child = response.state.metadata.sessionID
        const q = (await work({ action: "create", padre_id: main.id, pregunta: `Q${n}`, criterios: [`CA-${n}`], corpus: "fixture", referencia: "v1", responsable_session_id: child, requerido: true })).encargo
        const observation = await work({ action: "get", encargo_id: q.id })
        const confirm = { action: "confirm", encargo_id: q.id, pregunta: q.pregunta, corpus: "fixture", referencia: "v1", preparacion_message_id: observation.mensajes.at(-1).id }
        queries.push({ child, q, confirm })
      }
      await assert.rejects(work({ ...queries[0].confirm, corpus: "otro" }), /corpus/)
      // Reverse order proves a rejected corpus does not block the independent query.
      const start = async (query: any) => {
        query.e = (await work(query.confirm)).ejecucion
        const result = await delegate(`fixture:resume:${query.child} CONFIRMAR ${query.q.id} ${query.e.id}`)
        assert.equal(result.state.metadata.status, "running")
        await rpc({ action: "gate", sessionID: query.child, settledCheck: true })
      }
      const finish = async (query: any) => {
        await rpc({ action: "release", sessionID: query.child })
        await rpc({ action: "wait", sessionID: query.child })
        const observation = await work({ action: "get", encargo_id: query.q.id })
        const result = (await work({ action: "result", encargo_id: query.q.id, ejecucion_id: query.e.id, resultado_message_id: observation.mensajes.at(-1).id })).ejecucion
        const receipt = { action: "integrate", encargo_id: query.q.id, ejecucion_id: query.e.id, resultado_hash: result.result.sha256, efecto: `${query.q.pregunta} integrada`, siguiente_accion: "Revisar" }
        await work(receipt)
        await work(receipt)
      }
      await start(queries[1])
      if (limit === 2) await start(queries[0])
      else await assert.rejects(work(queries[0].confirm), /Límite configurado/)
      const publish = (extra = {}) => invoke("publish_agent_deliverable", { nombre: "borrador.md", contenido: "CA-1 y CA-2 integrados", encargo_id: main.id, operacion_id: "candidata", ...extra })
      await assert.rejects(publish(), /Cierre completo bloqueado/)
      const partial = await publish({ operacion_id: "parcial", parcial: { proposito: "Cotejo preliminar", efecto: "CA sin integrar", siguiente_accion: "Esperar notificaciones nativas" } })
      assert.equal(partial.cierre.estado, "parcial")
      await finish(queries[1])
      await assert.rejects(publish(), /Cierre completo bloqueado/)
      if (limit === 1) await start(queries[0])
      await finish(queries[0])
      const saved = await publish()
      assert.equal(saved.cierre.estado, "completo")
      assert.equal(saved.cierre.dependencias.filter((d: any) => d.estado === "integrado").length, 2)
      assert.deepEqual(await publish(), saved)
      assert.equal(await readFile(saved.rutas["borrador.md"], "utf8"), "CA-1 y CA-2 integrados")
      const events = (await rpc({ action: "events" })).events
      // Durable seq is session-local, not a global order across children.
      const sequence = (child: string, type: string, occurrence: number) => {
        const matches = events.filter((e: any) => e.sessionID === child && e.type === type)
        assert.equal(matches.length, 2, "Una preparación y una continuación por hijo")
        return events.indexOf(matches[occurrence])
      }
      const aStart = sequence(queries[0].child, "session.execution.started", 1), bStart = sequence(queries[1].child, "session.execution.started", 1)
      const aEnd = sequence(queries[0].child, "session.execution.succeeded", 1), bEnd = sequence(queries[1].child, "session.execution.succeeded", 1)
      assert.ok(bStart < bEnd && aStart < aEnd)
      let active = 0, observedPeak = 0
      for (const [position, delta] of [[aStart, 1], [bStart, 1], [aEnd, -1], [bEnd, -1]].sort((a, b) => a[0] - b[0])) {
        active += delta
        observedPeak = Math.max(observedPeak, active)
        assert.ok(position >= 0 && active >= 0)
      }
      assert.equal(active, 0)
      assert.equal(observedPeak, limit, "Pico agregado calculado de eventos, no copiado del límite")
      await writeFile(join(root, `events-limit-${limit}.json`), JSON.stringify({ limit, observedPeak, aStart, bStart, aEnd, bEnd, events, publication: saved }, null, 2))
      if (limit === 2) assert.ok(Math.max(aStart, bStart) < Math.min(aEnd, bEnd), "Ambas continuaciones comienzan antes de terminar cualquiera")
      else assert.ok(bEnd < aStart, "Con límite uno, la primera termina antes de iniciar la segunda")
      if (limit === 1) {
        api("post", "/api/location/reload", root, connected, {})
        assert.deepEqual(await publish(), saved, "Mismos bytes, hash y recibos después de reload real")
        for (const query of queries) {
          const recovered = await work({ action: "get", encargo_id: query.q.id })
          assert.equal(recovered.encargo.executions.length, 1)
          assert.equal(recovered.encargo.executions[0].state, "integrado")
        }
      }
    }
  }, ["delegation-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
})
