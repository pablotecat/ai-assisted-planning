import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import test from "node:test"
import { acquireSessions, apiReader, formatDiagnostics, main, reduceDiagnostics } from "./scripts/session-diagnostics.mjs"
import { api, opencode, withServer } from "./test-support/opencode.mjs"

const fixtureURL = new URL("./test-support/session-diagnostics.json", import.meta.url)
const fixture = async () => JSON.parse(await readFile(fixtureURL, "utf8"))
const selection = { rootID: "ses_root", from: 1000, to: 1600, exclude: ["ses_audit"] }

test("selección, deduplicación, turnos con steering, intervalo cerrado y export JSON/Markdown reproducibles", async () => {
  const data = await fixture()
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.acquisition.duplicates.value, 1)
  assert.deepEqual(report.sessions.map(session => session.id), ["ses_root", "ses_child", "ses_grandchild"])
  assert.equal(report.counts.messages.value, 5)
  assert.equal(report.sessions[0].turns.length, 1)
  assert.deepEqual(report.sessions[0].turns[0].inputMessageIDs, ["msg_user", "msg_steer"])
  assert.equal(report.sessions[1].turns[0].closedWithinInterval, false)
  assert.equal(report.relationships.delegation.length, 2)
  assert.equal(reduceDiagnostics(data, { ...selection, descendants: "none" }).counts.sessions.value, 1)
  assert.equal(reduceDiagnostics(data, { ...selection, descendants: ["ses_child"] }).counts.sessions.value, 2)
  assert.throws(() => reduceDiagnostics(data, { ...selection, descendants: ["ses_other"] }), /árbol/)
  assert.throws(() => reduceDiagnostics(data, { ...selection, exclude: ["ses_root"] }), /excluida/)
  assert.throws(() => reduceDiagnostics(data, { ...selection, to: 999 }), /intervalo/)
  assert.deepEqual(JSON.parse(formatDiagnostics(report)), JSON.parse(JSON.stringify(report)))
  assert.match(formatDiagnostics(report, "markdown"), /Diagnóstico de ejecución/)
  for (const format of ["json", "markdown"]) {
    const output = await main(["--input", fileURLToPath(fixtureURL), "--root", "ses_root",
      "--from", "1000", "--to", "1600", "--audit-session", "ses_audit", "--format", format])
    assert.ok(!output.includes("msg_audit"))
    assert.ok(!output.includes("msg_later"))
  }
})

test("adquisición paginada: sigue todos los cursores, deduplica y no lee la auditoría; rechaza bucles y formatos desconocidos", async () => {
  const contract = { paths: Object.fromEntries([
    ["/api/info", "server.info"], ["/api/session", "session.list"], ["/api/session/{sessionID}", "session.get"],
    ["/api/session/{sessionID}/message", "session.message.list"],
  ].map(([path, operationId]) => [path, { get: { operationId, parameters: ["limit", "cursor", "order"].map(name => ({ name })) } }])) }
  const calls: string[] = []
  const read = async (path: string) => {
    calls.push(path)
    if (path === "/openapi.json") return contract
    if (path === "/api/info") return { version: "2.1.2" }
    if (path === "/api/session/ses_root") return { data: { id: "ses_root" } }
    const url = new URL(path, "http://fixture")
    if (url.pathname === "/api/session") {
      if (url.searchParams.get("parentID") === "ses_child") return { data: [], cursor: {} }
      return url.searchParams.has("cursor")
        ? { data: [{ id: "ses_child", parentID: "ses_root" }, { id: "ses_audit", parentID: "ses_root" }], cursor: { next: null } }
        : { data: [{ id: "ses_child", parentID: "ses_root" }], cursor: { next: "page-two" } }
    }
    return url.searchParams.has("cursor") ? { data: [{ id: "msg_a", time: { created: 1000 } }, { id: "msg_b", time: { created: 1100 } }], cursor: {} }
      : { data: [{ id: "msg_a", time: { created: 1000 } }], cursor: { next: "messages-two" } }
  }
  const data = await acquireSessions(read, { ...selection, pageSize: 1, now: () => 1700 })
  assert.equal(data.acquisition.pages, 7)
  assert.equal(data.acquisition.duplicates, 3)
  assert.equal(data.sessions[0].messages.length, 2)
  assert.ok(!calls.some(path => path.includes("ses_audit")))
  assert.ok(calls.filter(path => path.includes("cursor=")).every(path => !path.includes("order=")))
  await assert.rejects(acquireSessions(async path => path.startsWith("/api/session?")
    ? { data: [], cursor: { next: "loop" } } : read(path), selection), /repetido/)
  await assert.rejects(acquireSessions(async () => ({}), selection), /Contrato/)
})

const tool = (id: string, name: string, state: object = {}) => ({ type: "tool", id, name,
  time: { created: 1110, ran: 1120, completed: 1200 },
  state: { status: "completed", input: {}, content: [{ type: "text", text: "ok" }], ...state } })
const receipt = (id: string, name: string, parentID?: string, extra = {}) => ({ id, name, parentID,
  sessionID: "ses_root", messageID: "msg_step", provenance: "original-event", time: { created: 1110, ran: 1120, completed: 1200 }, ...extra })
async function operationFixture(tools: object[], operations: object[] = []) {
  const data = await fixture()
  data.sessions[0].messages = data.sessions[0].messages.filter((message: any) => message.id !== "msg_step")
  data.sessions[0].messages.push({ id: "msg_step", type: "assistant", time: { created: 1100, completed: 1300 }, content: tools })
  data.observations = { operations }
  return data
}

test("execute con tres hijas: una exterior, tres internas/finales; sin inferencia de HTTP", async () => {
  const data = await operationFixture([tool("outer", "execute")], [
    receipt("outer", "execute", undefined, { kind: "container", expansion: "complete" }),
    receipt("a", "jira.read", "outer", { layer: "recovery-request" }),
    receipt("b", "jira.read", "outer", { layer: "recovery-request" }),
    receipt("c", "search", "outer", { layer: "catalog-search" }),
    receipt("a", "jira.read", "outer", { layer: "recovery-request" }),
  ])
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.counts.registeredTools.value, 1)
  assert.equal(report.counts.internalOperations.value, 3)
  assert.equal(report.counts.finalOperations.value, 3)
  assert.equal(report.counts.catalogSearches.value, 1)
  assert.equal(report.counts.recoveryRequests.value, 2)
  assert.equal(report.counts.httpRequests.value, null)
  assert.equal(report.relationships.containment.length, 3)
})

test("parallel anidado, execute local conservado y expansión desconocida/parcial sin analizar código", async () => {
  const data = await operationFixture([tool("parallel", "multi_tool_use.parallel"), tool("local", "execute"),
    tool("unknown", "execute", { input: { code: "tools.jira.read(); tools.jira.read()" } })], [
    receipt("parallel", "multi_tool_use.parallel", undefined, { expansion: "complete" }),
    receipt("execute", "execute", "parallel", { expansion: "complete" }),
    receipt("a", "jira.read", "execute"), receipt("b", "jira.read", "execute"),
    receipt("local", "execute", undefined, { expansion: "complete", kind: "local" }),
  ])
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.counts.finalOperations.value, 3, "Dos hojas y una ejecución local; desconocida no inventada")
  assert.equal(report.counts.finalOperations.coverage, "partial")
  assert.equal(report.counts.unknownExpansions.value, 1)
  data.observations.operations.push(receipt("knownChild", "search", "unknown", { layer: "catalog-search" }))
  assert.equal(reduceDiagnostics(data, selection).counts.finalOperations.value, 4)
  data.observations.operations.push(receipt("parallel", "multi_tool_use.parallel", "execute"))
  assert.throws(() => reduceDiagnostics(data, selection), /Ciclo/)
})

test("404 de dominio en herramienta completada, referencias y reintentos correlacionados sin contar menciones", async () => {
  const data = await operationFixture([tool("read", "jira.read", { content: [{ type: "text",
    text: JSON.stringify({ error: { type: "domain", status: 404, message: "No existe" } }) }] }),
    tool("denied", "read", { status: "error", error: { type: "permission.denied", message: "No" } }),
    tool("invalid", "read", { status: "error", error: { type: "tool.input", message: "No" } })])
  data.sessions[1].messages.push({ id: "msg_mentions", type: "assistant", time: { created: 1250 },
    content: [{ type: "text", text: "404 404 404" }], error: { type: "ProviderRequestError", message: "quota", status: 429 } })
  data.observations.incidents = [
    { id: "read", sessionID: "ses_root", at: 1300, category: "domain", status: 404, provenance: "history-reconstruction",
      references: [{ sessionID: "ses_child", messageID: "msg_mentions" }] },
    { id: "retry_read", sessionID: "ses_root", at: 1400, category: "domain", status: 404, retryOf: "read", provenance: "original-event",
      references: [{ sessionID: "ses_root", messageID: "msg_step" }] },
  ]
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.incidents.length, 4)
  const domain = report.incidents.find(incident => incident.category === "domain")!
  assert.equal(domain.status, 404)
  assert.equal(domain.attempts, 2)
  assert.equal(domain.references.length, 3)
  assert.equal(report.operations.find(operation => operation.id === "read")?.status, "completed")
  assert.deepEqual(new Set(report.incidents.map(incident => incident.category)), new Set(["domain", "permission", "invocation", "provider"]))
  assert.equal(report.counts.httpRequests.value, null)
  data.observations.incidents.push({ id: "retry_second", sessionID: "ses_root", at: 1450, category: "domain", status: 404,
    retryOf: "retry_read", provenance: "original-event", references: [{ sessionID: "ses_root", messageID: "msg_step" }] })
  assert.equal(reduceDiagnostics(data, selection).incidents.find(incident => incident.category === "domain")?.attempts, 3)
  data.observations.incidents.reverse()
  assert.equal(reduceDiagnostics(data, selection).incidents.find(incident => incident.category === "domain")?.attempts, 3)
})

test("reloj simulado: esperas solapadas, límites censurados y marcas ausentes no se atribuyen a una causa", async () => {
  const data = await operationFixture([tool("local", "read")])
  data.sessions.push({ id: "ses_second", parentID: "ses_root", messages: [] })
  data.observations.timings = [
    { id: "wait_a", kind: "delegated-wait", sessionID: "ses_root", childSessionID: "ses_child", start: 1150, end: 1450, provenance: "original-event" },
    { id: "wait_b", kind: "delegated-wait", sessionID: "ses_root", childSessionID: "ses_second", start: 1250, end: 1800, provenance: "original-event" },
    { id: "delivery", kind: "result-delivery", sessionID: "ses_root", childSessionID: "ses_child", resultAt: 1450, notifiedAt: 1500, integratedAt: 1800, provenance: "original-event" },
    { id: "later", kind: "delegated-wait", sessionID: "ses_root", childSessionID: "ses_child", start: 1700, end: 2000, provenance: "original-event" },
  ]
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.timing.metrics.windowWall.value, 600)
  assert.equal(report.timing.metrics.toolExecutionWall.value, 80)
  assert.equal(report.timing.metrics.delegatedWaitWall.value, 450, "Unión, no suma de 650 ms")
  assert.equal(report.timing.metrics.observedActivityWall.value, 480, "Espera y trabajo solapados no se suman")
  assert.equal(report.timing.metrics.observedActivitySpan.value, 480)
  assert.equal(report.timing.queue[0].elapsed.value, 10)
  assert.equal(report.timing.metrics.firstProviderEvent.value, null)
  assert.equal(report.timing.deliveries[0].resultToNotification.value, 50)
  assert.equal(report.timing.deliveries[0].resultToIntegration.value, null, "Evento posterior al cierre no integra")
  assert.equal(report.timing.waits.length, 2)
  assert.equal(report.timing.waits[1].end, 1600)
  assert.equal(report.timing.waits[1].coverage, "partial")
  data.observations.timings.push({ id: "first", kind: "first-event", sessionID: "ses_root", messageID: "msg_step", firstEventAt: 1107, provenance: "original-event" })
  assert.equal(reduceDiagnostics(data, selection).timing.metrics.firstProviderEvent.value, 7)
  assert.ok(!JSON.stringify(report).includes("disk"))
})

test("tokens, USD y caracteres independientes; declaraciones parciales nunca se convierten en observación o factura", async () => {
  const data = await operationFixture([tool("publisher", "publish_agent_deliverable", { input: { nombre: "nota.md", contenido: "A😀" } })])
  const step = data.sessions[0].messages.find((message: any) => message.id === "msg_step")
  step.tokens = { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } }
  step.cost = 0.01
  data.sessions[1].messages.push({ id: "msg_partial", type: "assistant", time: { created: 1200, completed: 1800 }, tokens: { input: 999 }, content: [] })
  data.observations.declarations = [{ id: "decl_a", sessionID: "ses_child", at: 1300, metric: "sourcesRead", value: 4 }]
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.usage.tokens.input.value, 10, "No atribuir tokens de un paso que cruza el cierre")
  assert.equal(report.usage.tokens.input.unit, "tokens")
  assert.equal(report.usage.tokens.input.coverage, "partial")
  assert.equal(report.usage.providerCost.value, 0.01)
  assert.equal(report.usage.providerCost.unit, "USD")
  assert.equal(report.usage.publisherArgumentCodeUnits.value, JSON.stringify({ nombre: "nota.md", contenido: "A😀" }).length)
  assert.equal(report.usage.publisherArgumentCodeUnits.unit, "UTF-16-code-units")
  assert.deepEqual(report.usage.declarations[0], { id: "decl_a", sessionID: "ses_child", name: "sourcesRead",
    value: 4, unit: "sources", coverage: "partial", provenance: "agent-declaration" })
  delete step.tokens
  delete step.cost
  const missing = reduceDiagnostics(data, selection)
  assert.equal(missing.usage.tokens.input.value, null)
  assert.equal(missing.usage.providerCost.value, null)
  assert.equal(missing.timing.metrics.peakConcurrentAssistantSteps.value, 2)
  assert.match(formatDiagnostics(missing, "markdown"), /no determinado/)
})

test("fronteras [from,to), recibos repetidos y reintento de error nativo conservan identidad sin duplicar conteos", async () => {
  const publisher = tool("publisher", "publish_agent_deliverable", { input: { contenido: "Documento" } })
  const failed = tool("native_error", "read", { status: "error", error: { type: "unexpected", message: "No" } })
  const instant = { ...tool("instant", "read"), time: { created: 1000, ran: 1000, completed: 1000 } }
  const data = await operationFixture([publisher, publisher, failed, instant])
  data.observations.incidents = [
    { id: "original", sessionID: "ses_root", at: 1200, category: "domain", status: 404, provenance: "original-event",
      references: [{ sessionID: "ses_root", messageID: "msg_step" }] },
    { id: "native_error", sessionID: "ses_root", at: 1300, category: "domain", status: 404, retryOf: "original", provenance: "history-reconstruction",
      references: [{ sessionID: "ses_root", messageID: "msg_step", operationID: "native_error" }] },
  ]
  const report = reduceDiagnostics(data, selection)
  assert.equal(report.counts.registeredTools.value, 3)
  assert.equal(report.usage.publisherArgumentCodeUnits.value, JSON.stringify(publisher.state.input).length)
  assert.equal(report.incidents.length, 1)
  assert.equal(report.incidents[0].attempts, 2)
  assert.equal(report.incidents[0].category, "domain")
  assert.equal(reduceDiagnostics(data, { ...selection, to: 1500 }).sessions[0].turns[0].closedWithinInterval, false)
  data.observations.incidents[1].references[0].operationID = "invented"
  assert.throws(() => reduceDiagnostics(data, selection), /no verificada/)
})

test("lista de campos permitidos: ningún prompt, argumento documental, cabecera, URL firmada, error o razonamiento nativo sale en JSON/Markdown", async () => {
  const secrets = ["SECRET_PROMPT_410", "SECRET_DOCUMENT_411", "SECRET_BEARER_412", "SECRET_TITLE_413",
    "SECRET_REASONING_414", "SECRET_ERROR_415", "SECRET_METADATA_416", "https://private.invalid/file?signature=SECRET_URL_417"]
  const data = await operationFixture([tool("publisher", "publish_agent_deliverable", {
    input: { nombre: "nota.md", contenido: secrets[1], headers: { Authorization: secrets[2] }, url: secrets[7] },
    content: [{ type: "text", text: JSON.stringify({ error: { type: "domain", status: 404, message: secrets[5] } }) }],
    metadata: { private: secrets[6] },
  })])
  data.debug = secrets[6]
  data.acquisition.headers = { Authorization: secrets[2] }
  data.acquisition.duplicates = secrets[2]
  data.acquisition.pages = { secret: secrets[2] }
  data.sessions[0].title = secrets[3]
  data.sessions[0].location = { directory: secrets[1] }
  const message = data.sessions[0].messages.find((message: any) => message.id === "msg_step")
  message.content.push({ type: "reasoning", text: secrets[4], native: { encrypted_content: secrets[4] } })
  message.native = { response: { body: secrets[4] } }
  message.metadata = { secret: secrets[6] }
  data.sessions[0].messages[0].text = secrets[0]
  data.sessions[0].messages[0].files = [{ url: secrets[7], filename: secrets[1] }]
  const report = reduceDiagnostics(data, selection)
  for (const format of ["json", "markdown"]) {
    const output = formatDiagnostics(report, format)
    for (const secret of secrets) assert.ok(!output.includes(secret), `${format} no debe contener ${secret}`)
    for (const forbidden of ["encrypted_content", "Authorization", "signature=", '"contenido"', '"text"', '"native"', '"title"', '"headers"'])
      assert.ok(!output.includes(forbidden), forbidden)
  }
  assert.equal(report.acquisition.pages.value, null)
  assert.equal(report.incidents[0].status, 404)
  assert.ok(report.usage.publisherArgumentCodeUnits.value! > 0)
  assert.equal(report.operations[0].name, "publish_agent_deliverable")
})

test("adaptador V2: contrato instalado, páginas, hijos y marcas en consumidor privado sin modelo", {
  skip: opencode(["--version"]).status !== 0 ? "Requiere OpenCode en PATH" : false,
  timeout: 120_000,
}, async () => {
  const parent = join(tmpdir(), "opencode")
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, "diagnostics-"))
  const env = { ...process.env, HOME: root, USERPROFILE: root,
    APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config", "opencode"), OPENCODE_CONFIG: "",
    OPENCODE_CONFIG_CONTENT: "{}", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1", OPENCODE_DISABLE_MODELS_FETCH: "1" }
  await writeFile(join(root, "opencode.json"), JSON.stringify({ agents: { fixture: { mode: "all" } } }))
  await withServer(root, env, async connected => {
    const template = api("post", "/api/session", root, connected, { agent: "fixture" }).data
    const created = template.time.created
    const messages = [
      { id: "msg_diag_user", type: "user", text: "Contenido privado", time: { created } },
      { id: "msg_diag_assistant", type: "assistant", agent: "fixture", model: { providerID: "fixture", id: "fixture" },
        time: { created: created + 1, streamed: created + 9, completed: created + 10 }, finish: "stop",
        content: [{ type: "tool", id: "call_diag", name: "execute", time: { created: created + 2, ran: created + 3, completed: created + 8 },
          state: { status: "completed", input: { code: "return 1" }, content: [{ type: "text", text: "1" }] } }] },
      { id: "msg_diag_idle", type: "idle", time: { created: created + 11 }, outcome: "succeeded" },
    ]
    api("post", "/api/experimental/session/import", root, connected, { info: { ...template, id: `${template.id}-history` }, messages })
    const rootID = `${template.id}-history`
    const children = Array.from({ length: 3 }, () => api("post", "/api/session", root, connected, { parentID: rootID }).data)
    const grandchild = api("post", "/api/session", root, connected, { parentID: children[0].id }).data
    const read = apiReader({ cwd: root, env: connected, server: connected.OPENCODE_TEST_SERVER })
    const acquired = await acquireSessions(read, { rootID, exclude: [children[2].id], pageSize: 1 })
    assert.equal(acquired.acquisition.version, opencode(["--version"]).stdout.trim().replace(/^opencode v/, ""))
    assert.equal(acquired.acquisition.contract.pagination, "cursor.next")
    assert.ok(acquired.acquisition.contract.absent.includes("internal-operations"))
    assert.ok(acquired.acquisition.pages >= 8)
    assert.deepEqual(new Set(acquired.sessions.map(session => session.id)), new Set([rootID, children[0].id, children[1].id, grandchild.id]))
    const history = acquired.sessions[0].messages
    assert.equal(history.length, 3)
    assert.deepEqual(history[1].time, messages[1].time)
    assert.deepEqual(history[1].content[0].time, messages[1].content[0].time)
    assert.equal(history[1].content[0].state.children, undefined)
    assert.equal(history[1].time.firstEvent, undefined)
    assert.equal(history[0].turnID, undefined)
    const sparse = await acquireSessions(read, { rootID, descendants: [grandchild.id], exclude: [children[2].id] })
    assert.deepEqual(reduceDiagnostics(sparse, { rootID, descendants: [grandchild.id], from: created, to: created + 20 }).sessions.map(session => session.id), [rootID, grandchild.id])
    assert.deepEqual(sparse.sessions.find(session => session.id === children[0].id)?.messages, [], "Solo cabecera de ancestro intermedio")
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("./scripts/session-diagnostics.mjs", import.meta.url)),
      "--server", connected.OPENCODE_TEST_SERVER, "--root", rootID, "--from", String(created), "--to", String(created + 20),
      "--audit-session", children[2].id, "--page-size", "1"], { cwd: root, env: connected, encoding: "utf8", timeout: 60_000 })
    assert.equal(command.status, 0, command.stderr)
    const exported = JSON.parse(command.stdout)
    assert.equal(exported.counts.registeredTools.value, 1)
    assert.equal(exported.counts.unknownExpansions.value, 1)
    assert.equal(exported.usage.tokens.input.value, null)
    assert.ok(!command.stdout.includes("Contenido privado"))
    // Keep this isolated consumer as a local diagnostic record; no credentials were copied.
  }, [])
})
