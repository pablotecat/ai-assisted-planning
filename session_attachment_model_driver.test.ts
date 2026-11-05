import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { authorizedModel, consentS09, runPngCase, verifyDispatches, wireImages } from "./test-support/attachments/verify-model.mjs"
import { hash } from "./test-support/evidence-model/verify-model.mjs"
import { png } from "./test-support/attachments/data.mjs"

test("S09 driver: consentimiento propio, único modelo y límites 360000/600000 antes de cualquier efecto", () => {
  const valid = { OPENCODE_ATTACHMENT_MODEL_CONSENT: "s09-png", OPENCODE_ATTACHMENT_FLOW_MS: "360000", OPENCODE_ATTACHMENT_WINDOW_MS: "600000" }
  assert.deepEqual(consentS09(valid), { flow: 360000, window: 600000 })
  for (const extra of [{ OPENCODE_ATTACHMENT_MODEL_CONSENT: "s08-behavior" }, { OPENCODE_EVIDENCE_MODEL: "openai/gpt-6.1-sol" },
    { OPENCODE_ATTACHMENT_FLOW_MS: "360001" }, { OPENCODE_ATTACHMENT_FLOW_MS: "0" }, { OPENCODE_ATTACHMENT_FLOW_MS: "1.5" },
    { OPENCODE_ATTACHMENT_WINDOW_MS: "600001" }, { OPENCODE_ATTACHMENT_WINDOW_MS: "390000" }])
    assert.throws(() => consentS09({ ...valid, ...extra }))
  const result = spawnSync(process.execPath, ["test-support/attachments/verify-model.mjs"], {
    cwd: import.meta.dirname, env: { ...process.env, OPENCODE_ATTACHMENT_MODEL_CONSENT: "" }, encoding: "utf8", timeout: 5000 })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /opt-in required/)
  assert.ok(!result.stdout.includes("Evidence:"))
})

test("S09 driver: texto base64, URL/nombre y firma sola no acreditan presentación nativa", () => {
  const bytes = png(), url = "data:image/png;base64," + bytes.toString("base64")
  assert.deepEqual(wireImages({ messages: [{ role: "user", content: [{ type: "text", text: url }] }] }), [])
  assert.deepEqual(wireImages({ type: "image_url", image_url: { url: "http://fixture/attachment.png" } }), [])
  assert.deepEqual(wireImages({ metadata: { type: "image_url", image_url: { url } } }), [], "Una imagen fuera del contenido del mensaje no cuenta")
  const real = wireImages({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url } }] }] })
  assert.deepEqual(real, [{ path: "$.messages.0.content.0", mime: "image/png", sha256: hash(bytes), bytes: bytes.length }])
  const signature = wireImages({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] }] })
  assert.notEqual(signature[0].sha256, hash(bytes))
})

test("S09 driver: fallo conserva pendientes, limpia solo su fixture e interrumpe solo su sesión, sin reintentar", async () => {
  const saved = new Map<string, any>(), calls: string[] = []
  const summary: any = { check: "in_progress" }
  const request = async (_method: string, path: string) => {
    calls.push(path)
    if (path === "/api/session") return { data: { id: "ses_own" } }
    if (path.endsWith("/prompt")) throw new Error("Injected admission failure")
    if (path.endsWith("/message")) return { data: [{ id: "msg_own", native: { secret: "native-secret" }, content: [{ type: "reasoning", text: "reasoning-secret" }] }] }
    if (path.endsWith("/interrupt?resume=false")) return { interrupted: true }
    return { output: { events: [] } }
  }
  await assert.rejects(runPngCase({ request, writer: { save: async (name: string, value: any) => saved.set(name, value), record: async () => {} },
    summary, host: "unused", flow: 1000 }), /Injected admission failure/)
  assert.equal(calls.filter(path => path.endsWith("/prompt")).length, 1)
  assert.equal(summary.stages.leer, "pending"); assert.equal(summary.visualRead, false)
  assert.equal(summary.fixtureClosed, true); assert.equal(summary.interrupt.interrupted, true)
  assert.ok(!JSON.stringify(saved.get("partial-messages.json")).includes("secret"))
  assert.equal(calls.filter(path => path.includes("interrupt")).length, 1)
  assert.ok(calls.filter(path => path.includes("interrupt")).every(path => path.includes("ses_own")))
})

test("S09 driver: exige imagen de la sesión y modelo/esfuerzo efectivos, sin aprobar visión", () => {
  const bytes = png(), dispatch = { sessionID: "ses_own", kind: "primary", model: authorizedModel,
    outgoingModel: "glm-5-3", reasoningEffort: "xhigh", images: [{ sha256: hash(bytes), bytes: bytes.length }] }
  verifyDispatches([dispatch], "ses_own", authorizedModel, bytes)
  for (const changed of [{ sessionID: "ses_other" }, { images: [] }, { outgoingModel: "other" }, { reasoningEffort: "high" },
    { images: [{ sha256: hash(bytes), bytes: 8 }] }])
    assert.throws(() => verifyDispatches([{ ...dispatch, ...changed }], "ses_own", authorizedModel, bytes))
})
