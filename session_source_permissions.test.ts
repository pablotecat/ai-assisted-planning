import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import plugin from "./plugin/agent-session.ts"
import { issueOf } from "./test-support/source-access/index.ts"
import { evidenceWriter, loadStates } from "./test-support/evidence-model/verify-model.mjs"
import { nativeWait, privateRequest } from "./test-support/delegation/verify-model.mjs"
import { api, probe, probePlugin, withServer } from "./test-support/opencode.mjs"

const source = fileURLToPath(new URL(".", import.meta.url))
const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
// D05/D08: Code Mode roles that also capture. Revisor verifies snapshots; the
// roles without Code Mode never see the sandbox, let alone the capture tool.
const captureRoles = ["arquitecto", "investigador", "lector-documentacion", "planificador", "refinador"]
const withoutCapture = ["revisor", "lector-codigo", "arquitecto-test"]

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const textOf = (message: any) => typeof message.content === "string" ? message.content
  : Array.isArray(message.content) ? message.content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("")
  : ""

//// S08 8.6 — dedicated permission in registration and role sources. ////

test("S08 permisos: capture_agent_source declara la acción dedicada y la matriz de roles la concede sin ampliar Code Mode", async () => {
  const tools: Record<string, any> = {}
  await plugin.setup({
    session: { get: async () => { throw new Error("Sin uso de sesión") }, context: async () => [],
      hook: async () => {} },
    agent: { transform: async () => {} },
    permission: { assert: async () => {}, hook: async () => {} },
    tool: { transform: async (fn: any) => fn({ add: (tool: any) => { tools[tool.name] = tool } }), hook: async () => {} },
  } as never)
  assert.deepEqual(tools.capture_agent_source.options,
    { namespace: "sesion", codemode: true, permission: "sesion_capture_agent_source" },
    "La herramienta declara su permiso dedicado; no toma prestado 'execute'")
  for (const role of captureRoles) {
    const text = await readFile(join(source, ".apm", "agents", `${role}.agent.md`), "utf8")
    assert.ok(text.includes("  sesion_capture_agent_source: allow"), `${role}: allow específico de captura`)
    assert.ok(text.includes("  execute: allow"), `${role}: conserva Code Mode`)
    assert.ok(text.indexOf('"*": deny') < text.indexOf("  sesion_capture_agent_source: allow"),
      `${role}: la denegación amplia precede a la excepción específica`)
  }
  for (const role of withoutCapture) {
    const text = await readFile(join(source, ".apm", "agents", `${role}.agent.md`), "utf8")
    assert.ok(!text.includes("sesion_capture_agent_source"), `${role}: sin permiso de captura`)
  }
  const revisor = await readFile(join(source, ".apm", "agents", "revisor.agent.md"), "utf8")
  assert.ok(revisor.includes("  execute: allow"), "El Revisor conserva Code Mode para su consulta directa")
})

//// S08 8.6 — real private consumer: sandbox per role, both aliases, receipt = blob. ////

test("S08 motor privado: permiso dedicado monta la captura por rol, ambos alias sintéticos capturan en el mismo código y el recibo es el blob", { timeout: 420_000 }, async t => {
  const root = await mkdtemp(join(temp, "source-perm-"))
  t.diagnostic(`Private server evidence (programmed provider, not a model): ${root}`)
  let count = 0, offCount = 0
  const provider = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    const results = (body.messages ?? []).filter((message: any) => message.role === "tool").map(textOf)
    const last = results.at(-1) ?? ""
    const lastUser = textOf((body.messages ?? []).filter((message: any) => message.role === "user").at(-1) ?? {})
    // Bounded evidence of what the programmed provider exchanged: shapes and sizes only.
    await appendFile(join(root, "provider-requests.jsonl"), JSON.stringify({ index: count++, url: req.url,
      tools: (body.tools ?? []).map((tool: any) => tool.function?.name ?? tool.name),
      user: lastUser.slice(0, 90), lastToolChars: last.length }) + "\n").catch(() => {})
    const call = (code: string) => ({ tool_calls: [{ index: 0, id: `programmed-${count}`, type: "function",
      function: { name: "execute", arguments: JSON.stringify({ code }) } }] })
    const reply = (content: string) => ({ content })
    let delta
    // Auxiliary model requests (title, compaction) carry none of the objective
    // markers: answer plain text so they never issue tools.
    if (!/permisos-a|revisor-inventario|lector-codigo-sin-codemode|captura-sin-guardado/.test(lastUser))
      delta = reply("Respuesta sintética auxiliar")
    else if (/revisor-inventario/.test(lastUser))
      delta = results.length ? reply("INVENTARIO_REVISOR") : call(
        `const sesion = typeof tools.sesion === "object" && tools.sesion !== null ? tools.sesion : null;
        return JSON.stringify({namespace: sesion ? "montado" : "ausente", inventario: sesion ? Object.keys(sesion) : null,
          tipo: sesion ? typeof sesion.capture_agent_source : "sin namespace"})`)
    else if (/lector-codigo-sin-codemode/.test(lastUser))
      delta = reply("SIN_CODE_MODE")
    else {
      const all = results.join("\n")
      const created = /"(work-[a-f0-9-]+)"/.exec(all)
      const work = created?.[1]
      if (/captura-sin-guardado/.test(lastUser)) {
        const needed = /recargado/.test(lastUser) ? 2 : 1
        if (offCount >= needed) delta = reply("CAPTURA_DESACTIVADA")
        else {
          const operacion = `cap-perm-off-${++offCount}`
          delta = call(`const cap = await tools.sesion.capture_agent_source({encargo_id:${JSON.stringify(work)},
            corpus:"fixture",referencia:"acta-permisos-2026-11-03",fuente:"APP-5",operacion_id:${JSON.stringify(operacion)},resultado:"Original pendiente sin guardado"});
            return typeof cap === "string" ? cap : JSON.stringify(cap)`)
        }
      } else if (!results.length)
        delta = { tool_calls: [{ index: 0, id: `programmed-${count}`, type: "function", function: { name: "session_work",
          arguments: JSON.stringify({ action: "create", pregunta: "Conservar los originales APP-5 y APP-6",
            criterios: [], corpus: "fixture", referencia: "acta-permisos-2026-11-03" }) } }] }
      else if (/instantanea_id/.test(last)) delta = reply("CAPTURA_COMPLETADA")
      else if (work)
        delta = call(`const inventario = Object.keys(tools.sesion);
          const original = await tools.jira.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey:"APP-5",view:"full"});
          const alias = await tools.atlassian.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey:"APP-6",view:"full"});
          const capJira = await tools.sesion.capture_agent_source({encargo_id:${JSON.stringify(work)},corpus:"fixture",referencia:"acta-permisos-2026-11-03",fuente:"APP-5",operacion_id:"cap-perm-jira",resultado:original});
          const capAtl = await tools.sesion.capture_agent_source({encargo_id:${JSON.stringify(work)},corpus:"fixture",referencia:"acta-permisos-2026-11-03",fuente:"APP-6",operacion_id:"cap-perm-atl",resultado:alias});
          const parse = (value) => JSON.parse(typeof value === "string" ? value : JSON.stringify(value));
          return JSON.stringify({inventario, capJira: parse(capJira), capAtl: parse(capAtl)})`)
      else delta = reply("ESTADO_INESPERADO")
    }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" in delta ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })

  const config = join(root, ".opencode")
  await mkdir(join(config, "agents"), { recursive: true })
  for (const dir of ["plugin", "tools"]) await cp(join(source, dir), join(config, dir === "plugin" ? "plugins" : dir), { recursive: true })
  for (const name of ["package.json", "agent-settings.example.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  // Production roles verbatim: the effective permissions under test are the package ones.
  for (const agent of ["refinador", "investigador", "revisor", "lector-codigo", "lector-documentacion"])
    await cp(join(source, ".apm", "agents", `${agent}.agent.md`), join(config, "agents", `${agent}.md`))
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    npm_config_cache: join(process.env.LOCALAPPDATA!, "npm-cache") }
  const setup = spawnSync(process.execPath, [join(source, "scripts/setup-opencode.mjs")],
    { cwd: root, env, encoding: "utf8", timeout: 240_000 })
  assert.equal(setup.status, 0, setup.error?.message || setup.stdout + setup.stderr)
  const installed = JSON.parse(await readFile(join(config, "opencode.json"), "utf8"))
  Object.assign(installed, { model: "fixture/test", snapshots: false,
    plugins: [new URL("./test-support/source-access", import.meta.url).href, probePlugin],
    providers: { fixture: { name: "Programmed; not a model", package: "@opencode/ai/providers/openai-compatible",
      settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${(provider.address() as any).port}/v1` },
      models: { test: { capabilities: { tools: true } } } } } })
  await writeFile(join(config, "opencode.json"), JSON.stringify(installed))
  const summary: any = { scope: "S08 dedicated capture permission; programmed provider, not a model",
    model: { providerID: "fixture", id: "test" }, realModelCalls: 0 }

  await withServer(root, env, async connected => {
    const request = privateRequest(connected, root)
    async function runPrompt(sessionID: string, text: string, marker: string) {
      await request("POST", `/api/session/${sessionID}/prompt`, { text })
      await nativeWait(request, sessionID, Date.now() + 120_000, () => {}, "permissions")
      let history: any[] = []
      for (let attempt = 0; attempt < 50; attempt++) {
        history = (await request("GET", `/api/session/${sessionID}/message`)).data
        if (history.find((message: any) => message.type === "assistant")?.finish === "stop") break
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      const final = history.find((message: any) => message.type === "assistant")
      assert.ok(final?.finish === "stop")
      assert.ok(final?.content?.some((part: any) => part.type === "text" && part.text.includes(marker)), marker)
      return { final, calls: history.flatMap((message: any) => message.content ?? []).filter((part: any) => part.type === "tool") }
    }
    try {
    const model = { providerID: "fixture", id: "test" }
    // Investigador: the dedicated permission mounts the capture in its sandbox; both
    // aliases transfer inside the same execute and the receipt hash is the blob.
    const research = (await request("POST", "/api/session", { agent: "investigador", model, title: "S08 permisos" })).data
    summary.investigador = research.id
    const roundA = await runPrompt(research.id, "permisos-a: recupera y conserva los originales APP-5 y APP-6 del sitio confirmado. Datos ficticios.", "CAPTURA_COMPLETADA")
    const executeA = roundA.calls.find((part: any) => part.name === "execute")
    assert.ok(executeA?.state?.status === "completed", "execute (Code Mode) completado para el investigador")
    const captured = JSON.parse((executeA.state.content ?? []).filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n"))
    assert.deepEqual(captured.inventario, ["capture_agent_source"], "El sandbox del investigador monta la captura por permiso dedicado")
    assert.equal(captured.capJira.guardado, true)
    assert.equal(captured.capAtl.guardado, true)
    assert.match(captured.capJira.instantanea_id, /^snap-/)
    assert.match(captured.capAtl.instantanea_id, /^snap-/)
    const states = await loadStates(root)
    const snapshots = states.flatMap((state: any) => Object.values(state.snapshots ?? {}))
    const snapJira = snapshots.find((snapshot: any) => snapshot.fuente === "APP-5")
    const snapAtl = snapshots.find((snapshot: any) => snapshot.fuente === "APP-6")
    assert.ok(snapJira && snapAtl, "Instantáneas de ambos alias registradas en el control del encargo")
    assert.equal(snapJira.contentSha256, captured.capJira.contenido.sha256, "Recibo del código = hash del blob (jira)")
    assert.equal(snapAtl.contentSha256, captured.capAtl.contenido.sha256, "Recibo del código = hash del blob (atlassian)")
    const control = join(root, "informes-agente/sesiones/.control")
    const blob = async (sha256: string) => {
      for (const dir of await readdir(control)) {
        const content = await readFile(join(control, dir, "snapshots", sha256)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error
          return undefined
        })
        if (content) return content
      }
      throw new Error(`Blob ausente: ${sha256}`)
    }
    for (const [snapshot, receipt, key, alias] of [[snapJira, captured.capJira, "APP-5", "jira"],
      [snapAtl, captured.capAtl, "APP-6", "atlassian"]] as const) {
      const bytes = await blob(snapshot.contentSha256)
      assert.equal(hash(bytes), snapshot.contentSha256, `El recibo devuelto por Code Mode es el hash del blob (${alias})`)
      assert.deepEqual(JSON.parse(bytes.toString("utf8")), issueOf(key, alias), `Original transferido íntegro desde ${alias}`)
    }
    // Revisor: Code Mode stays (execute completed) but the capture is not mounted.
    const review = (await request("POST", "/api/session", { agent: "revisor", model, title: "S08 denegación" })).data
    summary.revisor = review.id
    const roundR = await runPrompt(review.id, "revisor-inventario: enumera tus herramientas de sesión en código. Datos ficticios.", "INVENTARIO_REVISOR")
    const executeR = roundR.calls.find((part: any) => part.name === "execute")
    assert.ok(executeR?.state?.status === "completed", "El Revisor conserva Code Mode; no pierde execute")
    const inventory = JSON.parse((executeR.state.content ?? []).filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n"))
    assert.ok(!inventory.inventario?.length, `Sin captura montada para el Revisor: ${JSON.stringify(inventory)}`)
    assert.notEqual(inventory.tipo, "function", "Denegación efectiva: la captura no es invocable en su sandbox")
    // Lector Código: without Code Mode there is no sandbox at all.
    const code = (await request("POST", "/api/session", { agent: "lector-codigo", model, title: "S08 sin Code Mode" })).data
    summary.lectorCodigo = code.id
    const roundC = await runPrompt(code.id, "lector-codigo-sin-codemode: intento de inventario. Datos ficticios.", "SIN_CODE_MODE")
    assert.ok(roundC.calls.every((part: any) => part.name !== "execute"), "Sin execute disponible para lector-codigo")
    const requests = (await readFile(join(root, "provider-requests.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    const openTools = (marker: string) => requests.filter(entry => entry.user.includes(marker)).map(entry => entry.tools)
    assert.ok(openTools("permisos-a").every(tools => tools.includes("execute")), "Modelo con Code Mode (investigador)")
    assert.ok(openTools("revisor-inventario").every(tools => tools.includes("execute")), "El Revisor conserva execute")
    assert.ok(openTools("lector-codigo-sin-codemode").length > 0)
    assert.ok(openTools("lector-codigo-sin-codemode").every(tools => !tools.includes("execute")),
      "Code Mode denegado a lector-codigo: sin sandbox al que montar capturas")
    // The deny was effective without any source read attempt by the denied roles.
    const callsAfter = (await readFile(join(root, "source-access-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    assert.equal(callsAfter.filter(call => call.alias === "jira").length, 1, "Lectura única por alias (jira)")
    assert.equal(callsAfter.filter(call => call.alias === "atlassian").length, 1, "Lectura única por alias (atlassian)")
    assert.ok(callsAfter.every(call => call.sessionID === research.id), "Ningún rol denegado intentó leer la fuente")
    // Reading the persisted snapshot does not recover the source: retrieval avoided, observed.
    const read = (args: object) => JSON.parse(probe(root, connected, { sessionID: research.id,
      messageID: roundA.final.id, agent: "investigador", tool: "session_artifacts", args }).result.content)
    const view = read({ action: "read", encargo_id: snapJira.workID, corpus: "fixture",
      referencia: "acta-permisos-2026-11-03", artefacto_id: snapJira.id, archivo: snapJira.archivo, vista: "linea", limite: 9000 })
    assert.equal(view.diagnostico, undefined)
    assert.equal(view.total_lineas, 1)
    assert.deepEqual(JSON.parse(view.lineas[0].contenido), issueOf("APP-5", "jira"), "La lectura de la instantánea devuelve el original sin recuperarlo")
    const callsAfterRead = (await readFile(join(root, "source-access-calls.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
    assert.equal(callsAfterRead.length, callsAfter.length, "Leer la instantánea no volvió a leer la fuente")
    // Saving disabled: exact {guardado:false} without disk, before and after a real reload.
    const sessionsRoot = join(root, "informes-agente/sesiones")
    const before = JSON.stringify(await readdir(sessionsRoot, { recursive: true }))
    const controls = await Promise.all((await readdir(control)).map(async dir => ({ path: join(control, dir, "state.json"),
      content: await readFile(join(control, dir, "state.json")) })))
    const settingsPath = join(config, "agent-settings.json")
    const settings = JSON.parse(await readFile(settingsPath, "utf8"))
    settings.agentes.investigador.guardarEntregablesEnSesion = false
    await writeFile(settingsPath, JSON.stringify(settings))
    for (const reload of [false, true]) {
      if (reload) api("post", "/api/location/reload", root, connected, {})
      const marker = reload ? "captura-sin-guardado-recargado" : "captura-sin-guardado-inicial"
      const round = await runPrompt(research.id, `${marker}: conserva el original recibido. Datos ficticios.`, "CAPTURA_DESACTIVADA")
      // History arrives newest-first: select this round's execution by its exact result.
      const toolText = (part: any) => (part.state?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n")
      const off = round.calls.find((part: any) => part.name === "execute" && toolText(part).includes('"guardado":false'))
      assert.ok(off?.state?.status === "completed", "execute de captura sin guardado presente y completado")
      assert.deepEqual(JSON.parse(toolText(off)), { guardado: false }, `Exactamente {guardado:false}${reload ? " tras reload real" : ""}`)
      assert.equal(JSON.stringify(await readdir(sessionsRoot, { recursive: true })), before, "Sin archivos ni blobs nuevos")
      for (const saved of controls) assert.ok((await readFile(saved.path)).equals(saved.content), "Control intacto")
    }
    const decisions = (agent: string) => probe(root, connected, { agent, checks: [
      { action: "sesion_capture_agent_source", resource: "*" }, { action: "execute", resource: "*" }] }).decisions
    for (const agent of ["investigador", "refinador", "lector-documentacion"]) {
      const decided = decisions(agent)
      assert.equal(decided["sesion_capture_agent_source:*"], "allow", `${agent}: captura permitida`)
      assert.equal(decided["execute:*"], "allow", `${agent}: Code Mode conservado`)
    }
    assert.equal(decisions("revisor")["execute:*"], "allow", "El Revisor conserva Code Mode")
    summary.providerRequests = count
    } catch (error) {
      await evidenceWriter(root).save("callback-failure.json", { error: String(error), providerRequests: count })
      throw error
    }
  }, ["source-access-test", "planning-test", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  await evidenceWriter(root).save("permissions-verification.json", { ...summary, providerRequests: count,
    realModelCalls: 0, serverExited: true })
  t.diagnostic(`Private server exited; retained PROGRAMMED-only evidence: ${root}`)
})
