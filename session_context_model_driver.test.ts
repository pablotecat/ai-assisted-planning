import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { setImmediate } from "node:timers/promises"
import test from "node:test"
import { answerAfter, classifyPreentrega, consentS13, runContextCase, rulesAccessed } from "./test-support/context-model/verify-model.mjs"

const message = (type, extra = {}) => ({ type, time: { created: extra.at ?? 1 }, ...extra })

test("S13 driver: consentimiento propio, único modelo y límites 360000/600000 antes de cualquier efecto", () => {
  const valid = { OPENCODE_CONTEXT_MODEL_CONSENT: "s13-context", OPENCODE_CONTEXT_MODEL_FLOW_MS: "360000", OPENCODE_CONTEXT_MODEL_WINDOW_MS: "600000" }
  assert.deepEqual(consentS13(valid), { flow: 360000, window: 600000 })
  assert.deepEqual(consentS13({ ...valid, OPENCODE_CONTEXT_MODEL_CASE: "active-child",
    OPENCODE_CONTEXT_MODEL_FLOW_MS: "900000", OPENCODE_CONTEXT_MODEL_WINDOW_MS: "1200000" }), { flow: 900000, window: 1200000 })
  assert.throws(() => consentS13({ ...valid, OPENCODE_CONTEXT_MODEL_CASE: "active-child", OPENCODE_CONTEXT_MODEL_FLOW_MS: "900001" }))
  for (const extra of [{ OPENCODE_CONTEXT_MODEL_CONSENT: "s08-behavior" }, { OPENCODE_EVIDENCE_MODEL: "openai/gpt-6.1-sol" },
    { OPENCODE_CONTEXT_MODEL_FLOW_MS: "360001" }, { OPENCODE_CONTEXT_MODEL_FLOW_MS: "0" }, { OPENCODE_CONTEXT_MODEL_FLOW_MS: "1.5" },
    { OPENCODE_CONTEXT_MODEL_WINDOW_MS: "600001" }, { OPENCODE_CONTEXT_MODEL_WINDOW_MS: "390000" },
    { OPENCODE_CONTEXT_MODEL_CASE: "unknown" }])
    assert.throws(() => consentS13({ ...valid, ...extra }))
  const result = spawnSync(process.execPath, ["test-support/context-model/verify-model.mjs"], {
    cwd: import.meta.dirname, env: { ...process.env, OPENCODE_CONTEXT_MODEL_CONSENT: "" }, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
})

test("S13 reglas de la delegación: solo cuenta una skill completada en los mensajes de la sesión nueva", () => {
  const withSkill = { id: "ses_child", messages: [
    message("user"), message("assistant", { content: [{ type: "tool", name: "skill",
      state: { status: "completed", input: { id: "operativa-comun" } } }] }),
    message("assistant", { finish: "stop", content: [{ type: "text", text: "apliqué operativa-comun" }] })] }
  assert.deepEqual(rulesAccessed(withSkill), { skillCalls: 1, completed: 1, accessed: true, loaded: [{ id: "operativa-comun" }] })
  const nameOnly = { id: "ses_child2", messages: [
    message("assistant", { finish: "stop", content: [{ type: "text", text: "según operativa-comun que ya me pasaron" }] })] }
  assert.equal(rulesAccessed(nameOnly).accessed, false, "Un nombre o identificador compartido no acredita lectura íntegra vigente")
  const failed = { id: "ses_child3", messages: [
    message("assistant", { content: [{ type: "tool", name: "skill", state: { status: "error" } }] })] }
  assert.equal(rulesAccessed(failed).accessed, false, "Una skill fallida no acredita reglas recibidas")
})

test("S13 preentrega: exige solapamiento nativo, no una continuación posterior; los marcadores no aprueban", () => {
  const answer = message("assistant", { at: 100, time: { created: 100, completed: 120 }, finish: "stop",
    content: [{ type: "text", text: "Avance: lo consolidado es Q-ABONO con acta; Q-CANCELACION sigue pendiente del anexo, con efecto en el plazo; siguiente acción: esperar la lectura del investigador." }] })
  const activeChild = { id: "ses_child", time: { updated: 250 }, messages: [message("tool", { at: 300 })] }
  const events = [{ type: "session.execution.started", sessionID: "ses_child", at: 50 },
    { type: "session.execution.succeeded", sessionID: "ses_child", at: 250 }]
  const honest = classifyPreentrega({ answer, children: [activeChild], events })
  assert.equal(honest.observed, true); assert.deepEqual(honest.activeChildren, ["ses_child"])
  assert.equal(honest.marks.pendiente, true); assert.equal(honest.marks.siguienteAccion, true)
  assert.equal(honest.marks.candidataCompleta, false)
  const claim = classifyPreentrega({ answer: message("assistant", { at: 100, time: { created: 100, completed: 120 },
    content: [{ type: "text", text: "Avance: la candidata completa está lista para copiar." }] }),
    children: [activeChild], events })
  assert.equal(claim.observed, true); assert.equal(claim.marks.candidataCompleta, true,
    "El marcador expone la afirmación de candidata completa; la revisión independiente decide")
  const idle = { id: "ses_child", time: { updated: 50 }, messages: [message("tool", { at: 40 })] }
  assert.equal(classifyPreentrega({ answer, children: [idle] }).observed, false, "Sin hijo activo el caso no se observa")
  const later = [{ type: "session.execution.started", sessionID: "ses_child", at: 150 }]
  assert.equal(classifyPreentrega({ answer, children: [activeChild], events: later }).observed, false,
    "Actividad futura no prueba que el hijo estuviera activo durante el avance")
  const second = message("assistant", { id: "later", time: { created: 200, completed: 220 }, finish: "tool-calls",
    content: [{ type: "text", text: "Los investigadores siguen trabajando; continúo con las fuentes." }] })
  const actual = answerAfter([message("user", { id: "u", at: 1 }), answer, second], "u", {
    interim: true, accepts: candidate => classifyPreentrega({ answer: candidate, children: [activeChild], events: later }).observed })
  assert.equal(actual.id, "later", "Selecciona evidencia emitida durante la ejecución, no el primer texto ni un marcador")
  const ordered = [message("user", { id: "u1", at: 1 }), message("assistant", { id: "a1", finish: "stop", at: 2 }),
    message("user", { id: "u2", at: 50 }), message("assistant", { id: "a2", finish: "stop", at: 100 })]
  assert.equal(answerAfter(ordered, "u2").id, "a2")
  assert.equal(answerAfter([...ordered].reverse(), "u2").id, "a2", "El orden de la página no afecta la búsqueda")
  assert.equal(answerAfter([message("user", { id: "u2" })], "u2"), null, "Sin respuesta stop tras el turno de avance no hay caso")
  const interim = message("assistant", { at: 100, finish: "tool-calls", time: { created: 100, completed: 200 },
    content: [{ type: "text", text: "Avance parcial, evidencia pendiente; siguiente acción: esperar al hijo." }] })
  const partial = [message("user", { id: "u2", at: 50 }), interim]
  assert.equal(answerAfter(partial, "u2"), null, "El caso de admisión conserva su frontera final")
  assert.equal(answerAfter(partial, "u2", { interim: true }), interim, "El dedicado conserva texto ya emitido sin exigir fin de investigación")
  assert.throws(() => answerAfter([], "u2"), /debe existir/)
})

test("S13 driver: fallo conserva pendientes, limpia su fixture e interrumpe solo su árbol, sin reintentar", async () => {
  const saved = new Map(), calls: string[] = []
  const request = async (method: string, path: string, _input?: unknown) => {
    calls.push(`${method} ${path}`)
    if (method === "POST" && path === "/api/session") return { data: { id: "ses_own" } }
    if (path.endsWith("/prompt") || path.endsWith("/message")) throw new Error("Injected admission failure")
    return { data: [] }
  }
  const summary: any = { check: "in_progress" }
  await runContextCase({ request, writer: {
    save: async (name: string, value: unknown) => saved.set(name, value), record: async () => {} },
    summary, host: "unused", flow: 1000 })
  assert.equal(summary.check, "failed"); assert.equal(summary.error, "Injected admission failure")
  assert.equal(calls.filter(call => call.includes("/prompt")).length, 1, "Sin reintentos del prompt fallido")
  assert.equal(summary.fixtureClosed, true)
  assert.ok(Array.isArray(summary.evidenceErrors) && summary.evidenceErrors.length >= 1,
    "Los fallos de captura parcial se conservan, no se ocultan")
  assert.ok(calls.filter(call => call.includes("/interrupt")).every(call => call.includes("ses_own")),
    "Solo interrumpe su propio árbol")
  assert.ok([...saved.values()].some(value => JSON.stringify(value).includes("Injected admission failure")),
    "El error del driver queda conservado en la evidencia")
})

test("S13 driver: el avance tiene plazo propio, independiente de hijo o respuesta al objetivo", async t => {
  for (const state of ["sin-hijo-activo", "hijo-visible", "padre-idle"]) await t.test(state, async t => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 })
    const prompts: { text: string, at: number }[] = [], events: any[] = [], saved = new Map()
    const request = async (method: string, path: string, input?: any) => {
      if (method === "POST" && path === "/api/session") return { data: { id: "ses_own" } }
      if (path.endsWith("/prompt")) {
        prompts.push({ text: input.text, at: Date.now() })
        return { data: { id: prompts.length === 1 ? "u1" : "u2" } }
      }
      if (path === "/api/session") return { data: [
        { id: "ses_own", time: state === "padre-idle" ? { idle: 1000 } : {} },
        ...(state === "hijo-visible" ? [{ id: "ses_child", parentID: "ses_own", time: {} }] : []),
      ] }
      if (path.endsWith("/message")) return { data: state === "padre-idle"
        ? [message("assistant", { finish: "stop" })] : [] }
      throw new Error("Injected stop after avance admission")
    }
    const summary: any = { check: "in_progress" }
    let done = false
    const running = runContextCase({ request, writer: {
      save: async (name: string, value: any) => saved.set(name, structuredClone(value)),
      record: async (value: any) => { events.push(value) },
    }, summary, host: "unused", flow: 360_000, interrupt: false }).finally(() => { done = true })
    for (let elapsed = 0; !done && elapsed <= 370_000; elapsed += 1000) {
      await setImmediate()
      if (!done) t.mock.timers.tick(1000)
    }
    assert.equal(done, true, "El fixture debe finalizar sin espera de reloj real")
    await running
    assert.equal(prompts.length, 2, "Un objetivo y un avance, sin reintentos")
    assert.equal(prompts[1].at - prompts[0].at, 10_000,
      "El avance se encola a los 10 s del objetivo, no tras observar un hijo ni al final del flujo")
    assert.equal(summary.avance.inboxID, "u2")
    assert.equal(summary.avance.childSeen, state === "hijo-visible" ? "ses_child" : null)
    assert.equal(events.filter(event => event.type === "avance.sent").length, 1)
    assert.equal(saved.get("summary.json").avance.sentAt, prompts[1].at)
    assert.equal(summary.check, "failed", "Admisión y reloj no acreditan los casos de 13.4")
    assert.match(summary.error, /Injected stop after avance admission/)
  })
})

test("S13 driver: una ventana agotada no encola un avance tardío", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 })
  let prompts = 0, done = false
  const request = async (method: string, path: string) => {
    if (method === "POST" && path === "/api/session") return { data: { id: "ses_own" } }
    if (path.endsWith("/prompt")) { prompts++; return { data: { id: "u1" } } }
    if (path === "/api/session") return { data: [{ id: "ses_own", time: {} }] }
    throw new Error("Injected capture failure")
  }
  const summary: any = { check: "in_progress" }
  const running = runContextCase({ request, writer: { save: async () => {}, record: async () => {} },
    summary, host: "unused", flow: 5000, interrupt: false }).finally(() => { done = true })
  for (let elapsed = 0; !done && elapsed <= 10_000; elapsed += 1000) {
    await setImmediate()
    if (!done) t.mock.timers.tick(1000)
  }
  assert.equal(done, true)
  await running
  assert.equal(prompts, 1, "El corte conserva el objetivo único y no envía fuera de presupuesto")
  assert.equal(summary.avance, undefined)
  assert.equal(summary.check, "failed")
  assert.match(summary.error, /Ventana de avance agotada/)
})

test("S13 driver: espera nativa conserva el plazo del flujo y la captura parcial no exporta razonamiento", async () => {
  const saved = new Map<string, any>(), waits: number[] = [], captures: number[] = []
  const request = async (method: string, path: string, _input?: any, timeout?: number) => {
    if (method === "POST" && path === "/api/session") return { data: { id: "ses_own" } }
    if (path.endsWith("/prompt")) return { data: { id: "u1" } }
    if (path.endsWith("/wait")) { waits.push(timeout!); throw new Error("Injected wait failure") }
    if (path === "/api/session") return { data: [{ id: "ses_own", time: {} }] }
    if (path.endsWith("/message")) return { data: [{ native: { secret: "native-secret" }, content: [
      { type: "reasoning", text: "reasoning-secret" }, { type: "text", text: "partial answer" }] }] }
    if (_input?.input?.action === "events") captures.push(timeout!)
    return { output: { events: [] } }
  }
  const summary: any = {}
  await runContextCase({ request, writer: {
    save: async (name: string, value: any) => saved.set(name, value), record: async () => {},
  }, summary, host: "unused", flow: 360_000, avanceDelay: 0, interrupt: false })
  assert.equal(waits.length, 1, "No se repite automáticamente una espera fallida")
  assert.ok(waits[0] > 100_000 && waits[0] <= 120_000, "Observación acotada por debajo de los 300 s del cliente, no aborto a los 20 s")
  assert.equal(summary.error, "Injected wait failure")
  assert.deepEqual(captures, [10_000], "La captura diagnóstica conserva su plazo propio")
  const partial = JSON.stringify(saved.get("partial-messages.json"))
  assert.ok(partial.includes("partial answer"))
  assert.ok(!partial.includes("secret") && !partial.includes("reasoning"))
})

test("S13 dedicado: solo admite avance después de comprobar un hijo nativo aún activo", async () => {
  const calls: string[] = [], summary: any = {}
  const request = async (method: string, path: string, input?: any) => {
    calls.push(input?.input?.action ?? path)
    if (method === "POST" && path === "/api/session") return { data: { id: "ses_own" } }
    if (path.endsWith("/prompt")) return { data: { id: "u1" } }
    if (input?.input?.action === "active-child") return { output: { childID: "ses_child", startedAt: Date.now() } }
    if (path === "/api/session") return { data: [{ id: "ses_own" }, { id: "ses_child", parentID: "ses_own", time: { idle: null } }] }
    if (path.endsWith("/wait")) throw new Error("Injected stop after dedicated advance")
    throw new Error("Injected capture failure")
  }
  await runContextCase({ request, writer: { save: async () => {}, record: async () => {} }, summary,
    host: "unused", flow: 1000, avanceTrigger: "active-child", interrupt: false })
  assert.equal(summary.avance.childSeen, "ses_child")
  assert.equal(calls.filter(path => path.endsWith("/prompt")).length, 2)
  assert.ok(calls.indexOf("active-child") < calls.lastIndexOf("/api/session/ses_own/prompt"))
  assert.equal(summary.error, "Injected stop after dedicated advance")
})
