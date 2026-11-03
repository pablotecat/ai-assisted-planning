import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { captureSessions, privateRequest, runBounded } from "./test-support/delegation/verify-model.mjs"
import { consent, evidenceWriter, hash, prepareConsumer, providerPluginWrapper, resolveModel, resolveProviderPlugin, reviewChecklist, runCase, sanitize, verifyReads, verifyReport } from "./test-support/evidence-model/verify-model.mjs"
import { descriptions, prompt, unavailable } from "./test-support/evidence-model/data.mjs"
import { withServer } from "./test-support/opencode.mjs"

const temp = join(process.env.LOCALAPPDATA!, "Temp/opencode")
const parent = { id: "ses_root", agent: "investigador" }
const contract = { paths: Object.fromEntries([
  ["/api/info", "server.info"], ["/api/session", "session.list"], ["/api/session/{sessionID}", "session.get"],
  ["/api/session/{sessionID}/message", "session.message.list"],
].map(([path, operationId]) => [path, { get: { operationId, parameters: ["limit", "cursor", "order"].map(name => ({ name })) } }])) }

test("S02 guard: opt-in separado y presupuestos explícitos antes de cualquier credencial/efecto", () => {
  const env = { ...process.env, OPENCODE_TEST_MODEL_CONSENT: "yes", OPENCODE_EVIDENCE_MODEL_CONSENT: "", OPENCODE_EVIDENCE_FLOW_MS: "1000", OPENCODE_EVIDENCE_WINDOW_MS: "32000" }
  assert.throws(() => consent(env), /opt-in/)
  const result = spawnSync(process.execPath, ["test-support/evidence-model/verify-model.mjs"], { cwd: import.meta.dirname, env, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
  assert.deepEqual(consent({ ...env, OPENCODE_EVIDENCE_MODEL_CONSENT: "s02-2.4" }), { flow: 1000, window: 32000 })
  for (const value of ["", "NaN", "0", "1.5", "Infinity"]) assert.throws(() => consent({ ...env, OPENCODE_EVIDENCE_MODEL_CONSENT: "s02-2.4", OPENCODE_EVIDENCE_FLOW_MS: value }))
  assert.throws(() => consent({ ...env, OPENCODE_EVIDENCE_MODEL_CONSENT: "s02-2.4", OPENCODE_EVIDENCE_WINDOW_MS: "31000" }))
})

test("S02 modelo: parámetro configurable validado sintácticamente, declarado y nunca ejecutado", () => {
  const env = { OPENCODE_EVIDENCE_MODEL_CONSENT: "s02-2.4", OPENCODE_EVIDENCE_FLOW_MS: "1000", OPENCODE_EVIDENCE_WINDOW_MS: "32000" }
  assert.deepEqual(resolveModel(env), { providerID: "openai", id: "gpt-6.1-sol" })
  assert.deepEqual(resolveModel({ ...env, OPENCODE_EVIDENCE_MODEL: "" }), { providerID: "openai", id: "gpt-6.1-sol" })
  assert.deepEqual(resolveModel({ ...env, OPENCODE_EVIDENCE_MODEL: "fixture/test" }), { providerID: "fixture", id: "test" })
  assert.deepEqual(resolveModel({ ...env, OPENCODE_EVIDENCE_MODEL: "anthropic/claude-sonnet-4.5" }), { providerID: "anthropic", id: "claude-sonnet-4.5" })
  for (const value of ["no-slash", "/leading", "trailing/", "openai//gpt", "openai/gpt 6", "OpenAI/gpt", "a".repeat(65) + "/gpt", "openai/" + "m".repeat(129), "openai/gpt\n injected"])
    assert.throws(() => resolveModel({ ...env, OPENCODE_EVIDENCE_MODEL: value }), /providerID\/modelID/)
  // Consent is checked before any model resolution in the CLI; without opt-in nothing runs.
  const refused = { ...process.env, OPENCODE_EVIDENCE_MODEL_CONSENT: "", OPENCODE_EVIDENCE_FLOW_MS: "1000", OPENCODE_EVIDENCE_WINDOW_MS: "32000", OPENCODE_EVIDENCE_MODEL: "fixture/test" }
  const result = spawnSync(process.execPath, ["test-support/evidence-model/verify-model.mjs"], { cwd: import.meta.dirname, env: refused, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /opt-in required/)
})

test("S02 proveedor externo: ruta absoluta de plugin validada sin copiar, editar ni cargar", async () => {
  assert.equal(await resolveProviderPlugin(undefined), undefined)
  assert.equal(await resolveProviderPlugin(""), undefined)
  const root = await mkdtemp(join(temp, "s02-plugin-"))
  const plugin = join(root, "provider.js")
  await writeFile(plugin, "// synthetic path check only; this file is never loaded or executed by the test\n")
  assert.equal(await resolveProviderPlugin(plugin), pathToFileURL(plugin).href)
  const wrapperRunDir = join(root, "wrapper")
  await mkdir(wrapperRunDir)
  const wrapper = await providerPluginWrapper(wrapperRunDir, pathToFileURL(plugin).href)
  assert.deepEqual([wrapper.entry, wrapper.index].map(url => url.replace(/\\/g, "/")),
    [pathToFileURL(join(root, "wrapper", "provider-plugin")).href, join(root, "wrapper", "provider-plugin", "index.js").replace(/\\/g, "/")])
  const generated = await readFile(wrapper.index, "utf8")
  assert.match(generated, new RegExp(`export \\{ default \\} from ${JSON.stringify(pathToFileURL(plugin).href)}`))
  assert.ok(generated.includes("read-only") && generated.includes("never copied"), "Wrapper must document read-only loading")
  assert.ok(!generated.includes("forge"), "Wrapper must not inline plugin content")
  await mkdir(join(root, "dir"))
  await writeFile(join(root, "provider.txt"), "// exists but is not a plugin file\n")
  await assert.rejects(resolveProviderPlugin("relative/provider.js"), /absolute path/)
  await assert.rejects(resolveProviderPlugin(join(root, "missing.js")), /not readable/)
  await assert.rejects(resolveProviderPlugin(join(root, "dir")), /must be a file/)
  await assert.rejects(resolveProviderPlugin(join(root, "provider.txt")), /\.js\/\.cjs\/\.mjs/)
})

test("S02 privacidad: contenido sintético íntegro, sin secretos conocidos/cabeceras/native/razonamiento", () => {
  const value = sanitize({ authorization: "Bearer bad", headers: { secret: "bad" }, native: "NATIVE", reasoning: "REASONING",
    content: "Complete fictional source\nknown-token Bearer opaque https://fixture.invalid/file?signature=SECRET", access: "access", refresh: "refresh" }, ["known-token"])
  assert.equal(Object.keys(value).join(), "content")
  assert.match(value.content, /Complete fictional source\n/)
  assert.ok(!/known-token|opaque|signature|SECRET|NATIVE|REASONING/.test(JSON.stringify(value)))
})

function readFixture() {
  return async (path: string) => {
    if (path === "/openapi.json") return contract
    if (path === "/api/info") return { version: "2.1.2" }
    if (path === "/api/session/ses_root") return { data: parent }
    const url = new URL(path, "http://fixture"), cursor = url.searchParams.get("cursor")
    if (url.pathname === "/api/session") return { data: url.searchParams.get("parentID") === parent.id
      ? [{ id: "ses_child", parentID: parent.id, agent: "investigador" }] : [], cursor: { next: null } }
    return { data: [{ id: cursor ? "msg_final" : "msg_first", type: "assistant", finish: "stop", content: [
      { type: "text", text: "Complete synthetic evidence" }, { type: "reasoning", text: "PRIVATE_REASONING" },
    ], native: { secret: "PRIVATE_NATIVE" } }], cursor: { next: cursor ? null : "page-2" } }
  }
}

test("S02 captura: todas las páginas/descendientes y ausencia de reasoning/native usando helper S07 intacto", async () => {
  const saved = new Map<string, any>(), summary: any = {}
  const sessions = await captureSessions(readFixture(), parent, async (name: string, value: any) => { saved.set(name, value) }, summary)
  assert.equal(sessions.length, 2); assert.equal(saved.get("ses_child.json").length, 2)
  assert.equal(summary.coverage.tree, "complete"); assert.equal(summary.coverage.consistency, "non-atomic-read")
  assert.ok(!JSON.stringify([...saved]).includes("PRIVATE_"))
})

function syntheticReads() {
  return Object.keys({ ...descriptions, ...unavailable }).flatMap(key => {
    const result = descriptions[key] ? { key, fields: { description: descriptions[key] } } : { key, error: unavailable[key] }
    return ["started", "completed"].map((state, time) => ({ key, name: "getJiraIssue", state, time, sessionID: parent.id,
      messageID: "msg_reads", callID: `call_${key}`, result, resultSha256: hash(JSON.stringify(result)), outcome: descriptions[key] ? "available" : "source_unavailable" }))
  })
}

test("S02 lecturas: resultado completo exacto y recibo de inaccesibilidad, no solo IDs ni llamadas iniciadas", () => {
  const sessions = [{ ...parent, messages: [{ id: "msg_reads", type: "assistant", content: Object.keys({ ...descriptions, ...unavailable }).map(key =>
    ({ type: "tool", id: `call_${key}`, name: "execute", state: { status: "completed" } })) }] }]
  assert.equal(verifyReads(syntheticReads(), sessions).length, 4)
  for (const change of [
    (calls: any[]) => calls.filter(c => !(c.key === "APP-4" && c.state === "completed")),
    (calls: any[]) => calls.map(c => c.key === "APP-2" ? { ...c, messageID: "msg_unrelated" } : c),
    (calls: any[]) => calls.map(c => c.key === "APP-3" ? { ...c, outcome: "available" } : c),
    (calls: any[]) => calls.map(c => c.key === "APP-1" ? { ...c, resultSha256: "wrong" } : c),
    (calls: any[]) => [...calls, { key: "APP-99", state: "rejected" }],
  ]) assert.throws(() => verifyReads(change(syntheticReads()), sessions))
  assert.throws(() => verifyReads(syntheticReads(), [{ ...parent, messages: [{ id: "msg_reads", type: "assistant" }] }]), /APP-1/)
})

function reportFixture() {
  const files = { "resumen-ejecutivo.md": "APP-3 y APP-4 recuperados: Marta y Luis tienen responsables asignados. Cerrado.",
    "informe-detallado.md": "Q-CANCELACION y Q-ABONO completas. 48 horas y 7 días. APP-2." }
  const args = { slug: "consulta", resumen_ejecutivo: files["resumen-ejecutivo.md"], informe_detallado: files["informe-detallado.md"], operacion_id: "op_report" }
  const manifest = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({ path, sha256: hash(content), bytes: Buffer.byteLength(content) }))
  const base = join(temp, "s02-synthetic-not-written")
  const artifact = { id: "artifact_report", type: "write_report_pair", rootSessionID: parent.id, producerSessionID: parent.id, producerMessageID: "msg_publish",
    agent: "investigador", files: manifest, manifestHash: hash(JSON.stringify(manifest)) }
  const paths = Object.fromEntries(Object.keys(files).map(name => [name, join(base, name)]))
  const result = { guardado: true, artefacto_id: artifact.id, hash_manifiesto: artifact.manifestHash, archivos: manifest, rutas: paths, sesion: base, operacion_id: args.operacion_id }
  const operation = { type: artifact.type, producerSessionID: parent.id, agent: parent.agent, phase: "confirmed", logicalID: args.operacion_id, artifact, paths, result,
    digest: hash(JSON.stringify({ type: artifact.type, topic: args.slug, group: "consulta", delivery: null,
      files: Object.keys(files).sort().map(name => [name, files[name]]), sources: [], decisions: [], keys: [] })) }
  const messages = [{ id: "msg_publish", type: "assistant", content: [{ type: "tool", name: artifact.type,
    state: { status: "completed", input: args, content: [{ type: "text", text: JSON.stringify(result) }] } }] },
    { id: "msg_final", type: "assistant", finish: "stop", content: [{ type: "text", text: "Investigación completada." }] }]
  return { states: [{ operations: { op_report: operation }, artifacts: { artifact_report: artifact } }], sessions: [{ ...parent, messages }],
    files, operation, read: async (path: string) => Buffer.from(files[Object.keys(paths).find(key => paths[key] === path)!]) }
}

test("S02 publicación: productor/llamada/digest/manifiesto/bytes exactos; negativos no pasan con IDs assistant sueltos", async () => {
  const valid = reportFixture()
  assert.equal((await verifyReport(valid.states, parent.id, valid.sessions, valid.read)).files.length, 2)
  for (const corrupt of [
    (f: any) => { f.operation.artifact.producerSessionID = "ses_other" },
    (f: any) => { delete f.states[0].artifacts.artifact_report },
    (f: any) => { f.operation.phase = "prepared" },
    (f: any) => { f.sessions[0].messages[0].content = [{ type: "text", text: "Publicación completada artifact_report" }] },
    (f: any) => { f.sessions[0].messages[0].content[0].state.input.resumen_ejecutivo = "different" },
    (f: any) => { f.operation.artifact.manifestHash = hash("wrong") },
    (f: any) => { f.files["informe-detallado.md"] = "Changed after publication" },
  ]) { const f = reportFixture(); corrupt(f); await assert.rejects(verifyReport(f.states, parent.id, f.sessions, f.read)) }
})

test("S02 revisión: prosa contradictoria con claves/números correctos nunca autoaprueba 2.4", async () => {
  const f = reportFixture(), verified = await verifyReport(f.states, parent.id, f.sessions, f.read)
  const checklist = reviewChecklist(verified.candidate, verified.files, f.sessions)
  assert.equal(checklist.status, "review_required"); assert.equal(checklist.sufficientFor24, false)
  assert.equal(checklist.conditions.length, 6)
  assert.ok(checklist.conditions.every(c => c.verdict === "pending" && c.contradictionCheck === "pending" && !c.reportReferences.length && !c.nativeReferences.length))
  assert.deepEqual(checklist.conditions.slice(0, 2).map(c => [c.question, c.source]), [["Q-CANCELACION", "APP-3"], ["Q-ABONO", "APP-4"]])
  assert.match(JSON.stringify(checklist), /asignación aceptada a Marta\/Luis/)
  assert.throws(() => reviewChecklist(verified.candidate, verified.files.slice(0, 1), f.sessions))
})

test("S02 timeout: espera HTTP abortada no cancela; páginas previas/eventos/estados sobreviven e interrupt query cubre hijos", { timeout: 10_000 }, async t => {
  const root = await mkdtemp(join(temp, "s02-driver-timeout-")), host = join(root, "consumer"), interrupts: string[] = []
  await mkdir(host)
  let active = true, activeAtFirstInterrupt = false
  const read = readFixture()
  const http = createServer(async (req, res) => {
    if (req.url?.endsWith("/wait")) return
    let result: any
    if (req.url?.includes("/interrupt")) {
      if (!interrupts.length) activeAtFirstInterrupt = active
      interrupts.push(req.url); result = { interrupted: interrupts.length === 1 }; active = false
    }
    else if (req.url === "/api/session" && req.method === "POST") result = { data: parent }
    else if (req.url?.endsWith("/prompt")) result = {}
    else if (req.url?.endsWith("/run")) result = { output: req.url.includes("observer") ? { admission: { inboxID: "msg_input" }, events: ["observed admission"] } : { events: ["native event"] } }
    else if (req.url?.includes("/message?") && req.url?.includes("cursor=")) { res.writeHead(503); res.end(); return }
    else result = await read(req.url!)
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(result))
  })
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve))
  t.after(() => { http.closeAllConnections(); http.close() })
  const request = privateRequest({ OPENCODE_TEST_SERVER: `http://127.0.0.1:${(http.address() as any).port}`, OPENCODE_PASSWORD: "synthetic" }, host)
  const summary: any = { model: { providerID: "fixture", id: "test" } }
  await assert.rejects(runCase({ root, host, request, writer: evidenceWriter(root), summary, flow: 100 }), /timeout|aborted/i)
  assert.equal(active, false)
  assert.equal(activeAtFirstInterrupt, true, "HTTP wait timeout did not stop execution; explicit interrupt was needed")
  assert.deepEqual(interrupts.sort(), ["/api/session/ses_child/interrupt?resume=false", "/api/session/ses_root/interrupt?resume=false"])
  assert.equal(summary.interruptRequests[0].interrupted, true); assert.equal(summary.interruptRequests[1].interrupted, false)
  assert.equal(summary.check, "failed"); assert.equal(summary.coverage.tree, "partial")
  assert.equal(JSON.parse(await readFile(join(root, "partial-ses_root.json"), "utf8"))[0].id, "msg_first")
  assert.deepEqual(JSON.parse(await readFile(join(root, "events.json"), "utf8")), ["native event"])
  assert.deepEqual(JSON.parse(await readFile(join(root, "states.json"), "utf8")), [])
  assert.match(await readFile(join(root, "driver-events.jsonl"), "utf8"), /wait.error/)
  assert.ok(summary.evidenceErrors.some((e: any) => e.stage === "history"))
  t.diagnostic(`Retained bounded failure evidence: ${root}`)
})

test("S02 supervisor: termina solo árbol propio y preserva evidencia incluso tras bloqueo de cleanup", { timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(temp, "s02-driver-process-")), pids = join(root, "pids.json")
  const script = `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000)`
  await assert.rejects(runBounded(process.execPath, ["-e", script, pids], { cwd: root, timeout: 1000 }), /supervision budget/)
  for (const pid of JSON.parse(await readFile(pids, "utf8"))) assert.throws(() => process.kill(pid, 0), /ESRCH|no such process/i)
  t.diagnostic(`Retained process cleanup evidence: ${root}`)
})

test("S02 motor privado: preparación V2 instalada, Jira sintético y driver completo con proveedor programado, cero modelos", { timeout: 240_000 }, async t => {
  const root = await mkdtemp(join(temp, "s02-driver-native-"))
  let count = 0
  const report = "PROGRAMMED NOT MODEL. APP-3 recuperado porque Marta es responsable. APP-4 recuperado porque Luis es responsable. Ambas investigaciones completas."
  const provider = createServer(async (req, res) => {
    for await (const _ of req) { /* Do not retain provider payloads. */ }
    const index = count++
    const tool = index === 0 ? "execute" : index === 1 ? "write_report_pair" : undefined
    const args = index === 0 ? { code: `return await Promise.all(["APP-1","APP-2","APP-3","APP-4"].map(issueIdOrKey => tools.jira.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey,view:"full"})))` }
      : { slug: "consulta", resumen_ejecutivo: report, informe_detallado: report, operacion_id: "programmed-report" }
    const delta = tool ? { tool_calls: [{ index: 0, id: `programmed-${index}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] } : { content: report }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  t.after(() => { provider.closeAllConnections(); provider.close() })
  const { host, env, config, settings } = await prepareConsumer(root, { providerID: "fixture", id: "test" }, undefined)
  assert.deepEqual(settings.plugins, [new URL("./test-support/delegation", import.meta.url).href,
    new URL("./test-support/evidence-model/fixture", import.meta.url).href], "Without OPENCODE_EVIDENCE_PROVIDER_PLUGIN the installed plugins must be exactly the historical two")
  settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "fixture", effect: "allow" }]
  settings.providers = { fixture: { name: "Programmed; not a model", package: "@opencode/ai/providers/openai-compatible",
    settings: { apiKey: "synthetic", baseURL: `http://127.0.0.1:${(provider.address() as any).port}/v1` }, models: { test: { capabilities: { tools: true } } } } }
  await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
  const summary: any = { scope: "deterministic driver only", model: { providerID: "fixture", id: "test" }, realModelCalls: 0 }
  await evidenceWriter(root).save("case.json", { prompt, descriptions, unavailable, model: summary.model })
  await withServer(host, env, async connected => {
    const request = privateRequest(connected, host)
    const result = await runCase({ root, host, request, writer: evidenceWriter(root, [connected.OPENCODE_PASSWORD]), summary, flow: 30_000 })
    assert.equal(summary.mechanicalCheck, "passed"); assert.equal(summary.check, "review_required"); assert.equal(summary.sufficientFor24, false)
    assert.equal(result.calls.filter((c: any) => c.state === "completed").length, 4)
    assert.equal(summary.coverage.tree, "complete")
    const inputs = JSON.parse(await readFile(join(root, "tool-inputs.json"), "utf8"))
    assert.equal(inputs.length, 2); assert.equal(inputs[0].name, "execute"); assert.equal(inputs[1].name, "write_report_pair")
    assert.equal(count, 3)
    const checklist = JSON.parse(await readFile(join(root, "review-required.json"), "utf8"))
    assert.ok(checklist.conditions.every((c: any) => c.verdict === "pending"))
    assert.equal(checklist.sufficientFor24, false, "Deliberately false recovery claims must never be automatically approved")
  }, ["delegation-test", "evidence-model-fixture", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  await evidenceWriter(root).save("deterministic-verification.json", { providerRequests: count, realModelCalls: 0, serverExited: true,
    mechanicalCheck: summary.mechanicalCheck, check: summary.check, sufficientFor24: false, deliberatelyContradictoryProgrammedOutput: true })
  t.diagnostic(`Private server exited; retained PROGRAMMED-only evidence: ${root}`)
})
