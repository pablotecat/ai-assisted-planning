import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { makeIdentity, workModel } from "./tools/identity.ts"
import { sessionWork } from "./tools/session_store.ts"
import { acquireSessions, formatDiagnostics, main, reduceDiagnostics } from "./scripts/session-diagnostics.mjs"
import { api, withServer } from "./test-support/opencode.mjs"
import { recoveryProvider } from "./test-support/recovery/provider.mjs"

const selection = { rootID: "ses_root", from: 1000, to: 2000 }
const tool = (extra: any = {}) => ({ type: "tool", id: "call_publish", name: "publish_agent_deliverable",
  time: { created: 1100, ran: 1200 }, state: { status: "running", input: { operacion_id: "logical", encargo_id: "work_one" } }, ...extra })
function snapshot(content: any[] = []) {
  return { schemaVersion: 1, acquisition: { source: "original-event" }, sessions: [
    { id: "ses_root", agent: "refinador", messages: [{ id: "msg_step", type: "assistant", time: { created: 1050 }, content }] },
  ], observations: { recoveries: [] as any[], timings: [] as any[] } }
}
const recovery = (extra = {}) => ({ id: "rec_one", sessionID: "ses_root", messageID: "msg_step", at: 1900,
  operationID: "call_publish", provenance: "original-event", ...extra })
const report = (data: any, extra = {}) => reduceDiagnostics(data, { ...selection, ...extra }) as any

test("S12 modelo: selección nativa por encargo, padre cambiado no cambia hijo; denegación antes de leer selección ajena", async t => {
  const dir = await mkdtemp(join(tmpdir(), "recovery-model-")); t.diagnostic(dir)
  const nodes: Record<string, any> = { ses_root: { agent: "refinador", model: { providerID: "fixture", id: "old" } },
    ses_child: { agent: "investigador", parentID: "ses_root", model: { providerID: "fixture", id: "old" } },
    ses_sibling: { agent: "investigador", parentID: "ses_root" } }
  const reads: string[] = []
  const get = makeIdentity({ session: {
    get: async ({ sessionID }: any) => { reads.push(sessionID); return { ...nodes[sessionID], id: sessionID,
      title: "S12", time: { created: 1 }, location: { directory: dir } } },
    context: async ({ sessionID }: any) => [{ id: `msg_${sessionID}`, type: "assistant", agent: nodes[sessionID].agent, content: [], time: {} }],
  } } as never)
  const actor = (id: string) => ({ sessionID: id, agent: nodes[id].agent, messageID: `msg_${id}`, resolver: get })
  const options = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"), get }
  const w = (await sessionWork({ action: "create", pregunta: "Q", criterios: [], corpus: "C", referencia: "R",
    responsable_session_id: "ses_child" }, actor("ses_root"), options) as any).encargo
  // Test the same post-authorization path used by the tool without changing global settings paths.
  const inspect = async (id: string, encargo = w.id) => {
    const result = await sessionWork({ action: "get", encargo_id: encargo }, actor(id), options) as any
    return workModel(get, result.encargo.responsibleSessionID, () => 1900)
  }
  nodes.ses_root.model = { providerID: "fixture", id: "new", variant: "small" }
  assert.deepEqual((await inspect("ses_root")).modelo, { providerID: "fixture", id: "old" })
  assert.equal((await workModel(get, "ses_root")).modelo?.id, "new")
  const before = reads.length
  await assert.rejects(inspect("ses_sibling"), /no asignado/)
  assert.ok(!reads.slice(before).includes("ses_child"), "Ni siquiera se consulta la sesión responsable de un encargo ajeno")
  await assert.rejects(sessionWork({ action: "get", encargo_id: w.id, sessionID: "ses_sibling" } as never, actor("ses_root"), options), /Unrecognized/)
  delete nodes.ses_child.model
  assert.equal((await inspect("ses_root")).estado, "no_disponible")
  assert.equal((await inspect("ses_root")).modelo, undefined)
  const other = makeIdentity({ session: { get: async () => ({ id: "other" }) } } as never)
  await assert.rejects(workModel(other, "ses_root"), /otra sesión/)
})

test("S12 cuota: espera conocida, negativa sin autorización y verificación posterior dirigida sin ejecutar cambios", () => {
  const data = snapshot([tool()])
  data.observations.recoveries = [recovery({ reason: "quota", resetAt: 3000 })]
  assert.equal(report(data).recoveries[0].quota.action, "inform-wait")
  assert.equal(report(data).recoveries[0].quota.wait.value, 1100)
  const r = data.observations.recoveries[0]
  r.change = { authorized: false, at: 1800, model: { providerID: "fixture", id: "new" } }
  assert.equal(report(data).recoveries[0].quota.action, "ask-user-no-change")
  r.change.authorized = true
  r.selection = { session_id: "ses_other", estado: "observado", procedencia: "session.get", comprobado_en: 1850,
    modelo: { providerID: "fixture", id: "new" } }
  assert.equal(report(data).recoveries[0].quota.action, "verify-directed-change")
  r.selection.session_id = "ses_root"; r.selection.comprobado_en = 1750
  assert.equal(report(data).recoveries[0].quota.action, "verify-directed-change", "Una lectura anterior no verifica el cambio")
  r.selection.comprobado_en = 1850
  assert.equal(report(data).recoveries[0].quota.action, "selection-verified-check-effects")
  r.selection.modelo.variant = "different"
  assert.equal(report(data).recoveries[0].quota.action, "verify-directed-change")
  delete r.change; delete r.resetAt
  assert.equal(report(data).recoveries[0].quota.wait.value, null)
  assert.equal(report(data).recoveries[0].quota.action, "ask-user-or-check-reset")
})

test("S12 efectos: antes de ejecutar, iniciada, completada y respuesta perdida; ausencia de marcas no acredita causa", () => {
  const data = snapshot([tool()]), r = recovery({ reason: "transport" })
  data.observations.recoveries = [r]
  assert.equal(report(data).recoveries[0].phase, "started")
  assert.equal(report(data).recoveries[0].next, "inspect-work-and-artifacts-before-repeat")
  const call = data.sessions[0].messages[0].content[0]
  delete call.time.ran
  assert.equal(report(data).recoveries[0].phase, "undetermined")
  Object.assign(r, { beforeExecutionAt: 1150 })
  assert.equal(report(data).recoveries[0].phase, "before-execution")
  Object.assign(r, { provenance: "agent-declaration" })
  assert.equal(report(data).recoveries[0].phase, "undetermined")
  delete (r as any).beforeExecutionAt
  Object.assign(call.time, { ran: 1200, completed: 1300 }); call.state.status = "completed"
  assert.equal(report(data).recoveries[0].phase, "completed")
  Object.assign(r, { responseLost: true })
  assert.equal(report(data).recoveries[0].phase, "completed-response-lost")
  assert.equal(report(data).recoveries[0].next, "inspect-work-and-artifacts-before-repeat", "Completar llamada no confirma guardado")
  Object.assign(r, { reason: "unproven-cause" })
  assert.equal(report(data).recoveries[0].reason, "unknown")
  Object.assign(r, { beforeExecutionAt: 1250, provenance: "original-event" })
  assert.throws(() => report(data), /incompatible/)
})

test("S12 efectos confirmados: inventario S06 exacto anterior al reintento, no otro productor/encargo/operación", () => {
  const data = snapshot([tool()]), r = recovery({ responseLost: true, effectsSessionID: "ses_root", effectsOperationID: "call_inventory" })
  const artifact: any = { id: "artifact_one", manifestHash: "a".repeat(64), producerSessionID: "ses_root", producerMessageID: "msg_step",
    workID: "work_one", operacion_id: "logical", type: "publish_agent_deliverable" }
  const inventory = { type: "tool", id: "call_inventory", name: "session_artifacts", time: { created: 1400, ran: 1410, completed: 1500 },
    state: { status: "completed", input: { action: "list", encargo_id: "work_one" }, content: [] as any[] } }
  data.sessions[0].messages[0].content.push(inventory)
  data.observations.recoveries = [r]
  const check = () => { inventory.state.content = [{ type: "text", text: JSON.stringify({ artefactos: [artifact], cursor: null }) }]; return report(data).recoveries[0] }
  assert.equal(check().next, "reuse-confirmed-effect")
  for (const key of ["producerSessionID", "producerMessageID", "workID", "operacion_id", "type"]) {
    const old = artifact[key]; artifact[key] = "other"
    assert.equal(check().next, "inspect-work-and-artifacts-before-repeat", key)
    artifact[key] = old
  }
  inventory.time.completed = 1950
  assert.throws(check, /Consulta de efectos/)
})

test("S12 alertas opt-in: reloj acotado, primer evento no observado, progreso, hijos y privacidad", async () => {
  const data = snapshot(), alerts = { thresholdMs: 200, basis: "agreed" }
  assert.equal(report(data).activity, undefined)
  assert.throws(() => report(data, { alerts: { thresholdMs: 0, basis: "agreed" } }), /umbral/)
  assert.throws(() => report(data, { alerts: { thresholdMs: 200, basis: "guessed" } }), /umbral/)
  assert.equal(report(data, { alerts }).activity.notices[0].state, "first-event-unknown")
  data.observations.timings = [{ id: "first_one", sessionID: "ses_root", messageID: "msg_step", kind: "first-event",
    observedThrough: 2000, provenance: "original-event", private: "SECRET_RECEIPT" }]
  assert.equal(report(data, { alerts }).activity.notices[0].state, "no-first-event-observed")
  data.sessions[0].messages[0].content.push(tool())
  data.observations.timings.push({ id: "progress_one", sessionID: "ses_root", messageID: "msg_step", operationID: "call_publish",
    kind: "tool-progress", at: 1950, provenance: "original-event", text: "SECRET_PROGRESS" })
  assert.equal(report(data, { alerts }).activity.notices[0].state, "tool-with-progress")
  data.sessions[0].messages[0].content = []
  data.sessions.push({ id: "ses_child", parentID: "ses_root", agent: "investigador", messages: [
    { id: "msg_child", type: "assistant", time: { created: 1100 }, content: [] }] } as any)
  assert.equal(report(data, { alerts }).activity.notices[0].state, "active-children")
  for (const format of ["json", "markdown"]) assert.doesNotMatch(formatDiagnostics(report(data, { alerts }), format), /SECRET_/)
  assert.equal(report(data, { alerts, to: 1200 }).activity.notices.length, 0)
  await assert.rejects(main(["--root", "ses_root", "--from", "1000", "--to", "2000", "--audit-session", "ses_audit",
    "--alert-after-ms", "100"]), /alert-basis/)
})

test("S12 contrato V2 privado: modelos separados, cuota/transporte inyectados, inventario antes de reintentar y reload", { timeout: 180_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "provider-recovery-")), config = join(root, ".opencode")
  t.diagnostic(`Private recovery evidence: ${root}`)
  const source = fileURLToPath(new URL(".", import.meta.url))
  const provider = await recoveryProvider(); t.after(provider.close)
  await mkdir(join(config, "agents"), { recursive: true })
  for (const name of ["refinador", "investigador"])
    await cp(join(source, ".apm", "agents", `${name}.agent.md`), join(config, "agents", `${name}.md`))
  await cp(join(source, "plugin"), join(config, "plugins"), { recursive: true })
  await cp(join(source, "tools"), join(config, "tools"), { recursive: true })
  for (const name of ["agent-settings.example.json", "package.json"]) await cp(join(source, name), join(config, name))
  await cp(join(source, "agent-settings.example.json"), join(config, "agent-settings.json"))
  // Uses pinned worktree dependencies; not a fresh-install/installer regression.
  await symlink(join(source, "node_modules"), join(config, "node_modules"), process.platform === "win32" ? "junction" : "dir")
  await writeFile(join(config, "opencode.json"), JSON.stringify({ model: "fixture/test", snapshots: false,
    providers: { fixture: { name: "Synthetic recovery", package: "@opencode/ai/providers/openai-compatible",
      settings: { apiKey: "fixture-not-a-secret", baseURL: provider.url }, models: Object.fromEntries(
        ["test", "new", "quota", "transport"].map(id => [id, { capabilities: { tools: true } }])) } } }))
  const env = { ...process.env, HOME: root, USERPROFILE: root, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [new URL("./test-support/recovery", import.meta.url).href] }) }
  await withServer(root, env, async connected => {
    const rpc = async (input: any) => {
      const response = await fetch(`${connected.OPENCODE_TEST_SERVER}/api/rpc/recovery-test/run`, { method: "POST",
        signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", "x-opencode-directory": root,
          authorization: "Basic " + Buffer.from(`opencode:${connected.OPENCODE_PASSWORD}`).toString("base64") }, body: JSON.stringify({ input }) })
      assert.equal(response.status, 200, await response.clone().text())
      return (await response.json()).output
    }
    const contract = api("get", "/openapi.json", root, connected)
    assert.equal(contract.paths["/api/session/{sessionID}/model"].post.operationId, "session.switchModel")
    assert.ok(contract.paths["/api/session/{sessionID}/interrupt"].post.parameters.some((p: any) => p.name === "resume" && p.in === "query"))
    await writeFile(join(root, "native-openapi.json"), JSON.stringify(contract))
    const create = (agent: string, parentID?: string) => api("post", "/api/session", root, connected,
      { agent, ...(parentID ? { parentID } : {}), title: "Recovery fixture", model: { providerID: "fixture", id: "test" } }).data
    const parent = create("refinador"), child = create("investigador", parent.id), sibling = create("investigador", parent.id)
    const prompt = async (sessionID: string, text: string) => {
      const after = Date.now()
      api("post", `/api/session/${sessionID}/prompt`, root, connected, { text })
      await rpc({ action: "event", sessionID, type: "session.execution.succeeded", after })
      await rpc({ action: "wait", sessionID })
      return api("get", `/api/session/${sessionID}/context`, root, connected).data
    }
    let parentHistory = await prompt(parent.id, "fixture:author"), childHistory = await prompt(child.id, "fixture:author")
    const siblingHistory = await prompt(sibling.id, "fixture:author")
    const author = (history: any[]) => history.findLast(m => m.type === "assistant").id
    const call = async (session: any, history: any[], tool: string, args: any, captureError = false) => {
      const result = await rpc({ tool, args, sessionID: session.id, agent: session.agent, messageID: author(history), captureError })
      const content = result.result?.content
      return result.error ? result : JSON.parse(typeof content === "string" ? content : content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"))
    }
    const work = (await call(parent, parentHistory, "session_work", { action: "create", pregunta: "Recover CA", criterios: ["CA-1", "CA-2"],
      corpus: "fixture", referencia: "v1", responsable_session_id: child.id })).encargo
    const inspect = () => call(parent, parentHistory, "session_work", { action: "get", encargo_id: work.id })
    // This is the already-authorized operator API, not a package tool or permission expansion.
    const change = (id: string, model: string) => api("post", `/api/session/${id}/model`, root, connected, { model: { providerID: "fixture", id: model } })
    change(parent.id, "new")
    assert.equal((await inspect()).modelo_efectivo.modelo.id, "test")
    assert.equal(api("get", `/api/session/${parent.id}`, root, connected).data.model.id, "new")
    assert.match((await call(sibling, siblingHistory, "session_work", { action: "get", encargo_id: work.id }, true)).error, /no asignado/)
    assert.match((await call(parent, parentHistory, "session_work", { action: "switch_model", encargo_id: work.id }, true)).error, /Invalid|enum|action/i)
    assert.equal((await inspect()).modelo_efectivo.modelo.id, "test")
    change(child.id, "new")
    assert.equal((await inspect()).modelo_efectivo.modelo.id, "new")
    const injected = []
    for (const model of ["quota", "transport"]) {
      change(child.id, model)
      const after = Date.now()
      api("post", `/api/session/${child.id}/prompt`, root, connected, { text: `fixture:${model}` })
      const event = (await rpc({ action: "event", sessionID: child.id, type: "session.retry.scheduled", after })).event
      if (model === "quota") { assert.equal(event.error.status, 429); assert.equal(event.error.retryAfterMs, 3_600_000) }
      const interruption = api("post", `/api/session/${child.id}/interrupt?resume=false`, root, connected)
      assert.equal(interruption.interrupted, true)
      await rpc({ action: "wait", sessionID: child.id })
      injected.push({ model, event, interruption })
    }
    change(child.id, "new")
    const modelAfterChange = (await inspect()).modelo_efectivo
    assert.equal(modelAfterChange.modelo.id, "new")
    childHistory = await prompt(child.id, `fixture:publish ${work.id}`)
    const publicationMessage = childHistory.findLast((m: any) => m.type === "assistant" && m.content.some((c: any) => c.name === "publish_agent_deliverable"))
    const publication = publicationMessage.content.find((c: any) => c.name === "publish_agent_deliverable")
    assert.equal(publication.state.status, "completed")
    // Deliberately discard the successful reply at the coordinator; this is simulated response loss, not a network outage.
    const saved = JSON.parse(publication.state.content[0].text)
    assert.equal(saved.guardado, true)
    parentHistory = await prompt(parent.id, `fixture:inventory ${work.id}`)
    const inventory = parentHistory.flatMap((m: any) => m.content ?? []).findLast((c: any) => c.name === "session_artifacts")
    assert.equal(inventory.state.status, "completed")
    const data: any = await acquireSessions(async (path: string) => api("get", path, root, connected), { rootID: parent.id })
    data.observations = { recoveries: [{ id: "lost-reply", sessionID: child.id, messageID: publicationMessage.id, operationID: publication.id,
      at: Date.now(), responseLost: true, reason: "transport", effectsSessionID: parent.id, effectsOperationID: inventory.id, provenance: "agent-declaration" }] }
    const reduced = reduceDiagnostics(data, { rootID: parent.id, from: parent.time.created, to: Date.now() + 1 }) as any
    assert.equal(reduced.recoveries[0].phase, "completed-response-lost")
    assert.equal(reduced.recoveries[0].next, "reuse-confirmed-effect")
    assert.equal(reduced.recoveries[0].effect.artifactID, saved.artefacto_id)
    await writeFile(join(root, "diagnostic.json"), formatDiagnostics(reduced))
    api("post", "/api/location/reload", root, connected)
    assert.equal((await inspect()).modelo_efectivo.modelo.id, "new", "Resolvedor de modelo ligado también a la instancia tras reload")
    const retried = await call(child, childHistory, "publish_agent_deliverable", publication.state.input)
    assert.deepEqual(retried, saved)
    const all = await call(parent, parentHistory, "session_artifacts", { action: "list", encargo_id: work.id, corpus: "fixture", referencia: "v1" })
    assert.equal(all.artefactos.length, 1)
    assert.equal(await readFile(saved.rutas["conclusion.md"], "utf8"), "CA-1 verificado; CA-2 pendiente")
    assert.equal(api("get", `/api/session?parentID=${parent.id}`, root, connected).data.length, 2, "Ningún hijo para eludir cuota")
    await writeFile(join(root, "native-evidence.json"), JSON.stringify({ version: api("get", "/api/info", root, connected).version,
      modelAfterChange, injected, requests: provider.requests, events: (await rpc({ action: "events" })).events }, null, 2))
  }, ["ai-assisted-planning.agent-session", "recovery-test"])
})
