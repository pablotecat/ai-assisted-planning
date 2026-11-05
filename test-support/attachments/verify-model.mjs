// One S09 visual trial only. Inert import; no model/credential path without CLI consent.
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { evidenceWriter, hash, prepareConsumer, textOf } from "../evidence-model/verify-model.mjs"
import { nativeWait, privateRequest, runBounded } from "../delegation/verify-model.mjs"
import { withServer } from "../opencode.mjs"
import { opencode } from "../../scripts/verify-opencode.mjs"
import { expected, png, question } from "./data.mjs"

export const authorizedModel = { providerID: "plainconcepts", id: "glm-5-3" }
const source = fileURLToPath(new URL("../..", import.meta.url))
export function consentS09(env) {
  assert.equal(env.OPENCODE_ATTACHMENT_MODEL_CONSENT, "s09-png", "Explicit S09 opt-in required; no credentials accessed")
  assert.ok(!env.OPENCODE_EVIDENCE_MODEL || env.OPENCODE_EVIDENCE_MODEL === "plainconcepts/glm-5-3", "Only plainconcepts/glm-5-3 authorized; no fallback")
  const flow = Number(env.OPENCODE_ATTACHMENT_FLOW_MS), window = Number(env.OPENCODE_ATTACHMENT_WINDOW_MS)
  assert.ok(Number.isSafeInteger(flow) && flow > 0 && flow <= 360_000, "flow <= 360000 required")
  assert.ok(Number.isSafeInteger(window) && window > flow + 30_000 && window <= 600_000, "flow + 30000 < window <= 600000 required")
  return { flow, window }
}

// Only structurally typed image parts count; a base64 string in text is not an image.
export function wireImages(value, path = "$", found = []) {
  if (!value || typeof value !== "object") return found
  const uri = value.type === "image_url" ? value.image_url?.url
    : value.type === "input_image" ? value.image_url : undefined
  if (/^\$\.(messages|input)\.\d+\.content\.\d+$/.test(path) && typeof uri === "string" && uri.startsWith("data:image/png;base64,")) {
    const bytes = Buffer.from(uri.slice("data:image/png;base64,".length), "base64")
    found.push({ path, mime: "image/png", sha256: hash(bytes), bytes: bytes.length })
  }
  for (const [key, child] of Object.entries(value)) wireImages(child, path + "." + key, found)
  return found
}

export async function readDispatches(host) {
  const text = await readFile(join(host, "image-dispatches.jsonl"), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error })
  return text.trim() ? text.trim().split("\n").map(JSON.parse) : []
}

export function verifyDispatches(dispatches, sessionID, model, bytes) {
  const own = dispatches.filter(d => d.sessionID === sessionID && d.kind === "primary")
  assert.ok(own.some(d => d.model.providerID === model.providerID && d.model.id === model.id &&
    d.images.some(image => image.sha256 === hash(bytes) && image.bytes === bytes.length)),
  "PNG must be a typed image in the native outgoing request, not a filename/base64 text")
  if (model.providerID === authorizedModel.providerID && model.id === authorizedModel.id)
    for (const dispatch of own) {
      assert.equal(dispatch.outgoingModel, authorizedModel.id, "Exact authorized outgoing model")
      assert.equal(dispatch.reasoningEffort, "xhigh", "Provider-admitted effort required for S09")
    }
}

// Five-stage harness test, NOT an autonomous remote attachment/batch test.
// The harness locates/obtains/downloads a known original; the native client
// presents it and the real model (only in the consented CLI) must read its pixels.
export async function runPngCase({ request, writer, summary, host, flow, model = authorizedModel }) {
  const deadline = Date.now() + flow, bytes = png(), downloads = []
  const server = createServer((req, res) => {
    downloads.push({ path: req.url, at: Date.now() })
    if (req.url !== "/attachment.png") { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "image/png" }); res.end(bytes)
  })
  let session
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
    const locator = `http://127.0.0.1:${server.address().port}/attachment.png`
    const response = await fetch(locator, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })
    assert.equal(response.status, 200)
    const received = Buffer.from(await response.arrayBuffer()) // Node harness, not Code Mode.
    assert.deepEqual(received, bytes)
    summary.stages = { localizar: "fixture locator", obtener: "authorized loopback fixture", descargar: { sha256: hash(received), bytes: received.length }, presentar: "pending", leer: "pending" }
    // Keep the answer out of every file available during the model turn.
    await writer.save("case.json", { question, pngSha256: hash(bytes), provenance: "synthetic PNG; no real Jira", harnessDownloads: downloads })
    session = (await request("POST", "/api/session", { agent: "lector-documentacion", title: "S09 PNG", model })).data
    summary.sessionID = session.id
    const admitted = (await request("POST", `/api/session/${session.id}/prompt`, { text: question,
      files: [{ uri: "data:image/png;base64," + received.toString("base64"), name: "attachment.png" }] }, deadline - Date.now())).data
    await writer.save("admission.json", { sessionID: session.id, inboxID: admitted.id })
    await nativeWait(request, session.id, deadline, writer.record, "png")
    const observation = (await request("POST", "/api/rpc/attachment-observer/run", { input: { action: "wait", sessionID: session.id, inboxID: admitted.id } }, deadline - Date.now())).output
    assert.equal(observation.succeeded, true, "Exact admitted turn must finish successfully")
    await writer.save("events.json", observation.events)
    let cursor, messages = []
    do {
      const page = await request("GET", `/api/session/${session.id}/message?limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`, undefined, deadline - Date.now())
      messages.push(...page.data); cursor = page.cursor?.next
    } while (cursor)
    const safe = messages.map(({ native, ...m }) => ({ ...m, content: m.content?.filter(p => p.type !== "reasoning") }))
    await writer.save("messages.json", safe)
    const finals = messages.filter(m => m.type === "assistant" && m.finish === "stop")
    assert.equal(finals.length, 1, "A final visual answer is required, not idle alone")
    assert.ok(textOf(finals[0]).trim())
    assert.ok(messages.filter(m => m.type === "assistant").every(m => m.model.providerID === model.providerID && m.model.id === model.id), "Exact authorized model only")
    const dispatches = await readDispatches(host)
    await writer.save("dispatches.json", dispatches)
    verifyDispatches(dispatches, session.id, model, bytes)
    summary.stages.presentar = "typed PNG in native outgoing request"
    summary.final = { messageID: finals[0].id, text: textOf(finals[0]) }
    summary.check = "review_required"; summary.visualRead = false
    await writer.save("review-required.json", { expected, final: summary.final, visualRead: false,
      requirement: "Independent semantic review of all four quadrants against the original PNG; never approve from signature/dimensions or dispatch alone. This case does not prove autonomous remote retrieval or a batch barrier." })
    return summary
  } catch (error) {
    summary.check = "failed"; summary.visualRead = false; summary.error = error.message
    if (session) {
      for (const [name, run] of [["partial-messages.json", async () => {
        const page = await request("GET", `/api/session/${session.id}/message`)
        return page.data.map(({ native, ...m }) => ({ ...m, content: m.content?.filter(p => p.type !== "reasoning") }))
      }],
        ["partial-events.json", () => request("POST", "/api/rpc/attachment-observer/run", { input: { action: "events" } })]]) {
        try { await writer.save(name, await run()) } catch (failure) { (summary.evidenceErrors ??= []).push(failure.message) }
      }
    }
    throw error
  } finally {
    if (session) try { summary.interrupt = await request("POST", `/api/session/${session.id}/interrupt?resume=false`, undefined, 5000) }
    catch (error) { summary.cleanupError = error.message }
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
    summary.fixtureClosed = true
    await writer.save("summary.json", summary)
  }
}

function credential() {
  const status = opencode(["service", "status"], source)
  assert.ok(status.status === 0 && /http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(status.stdout), "Existing shared service required; will not start it")
  const result = opencode(["api", "get", "/api/credential"], source)
  assert.equal(result.status, 0)
  const auth = JSON.parse(result.stdout).data.find(entry => entry.integrationID === authorizedModel.providerID && entry.active)
  assert.equal(auth?.value.type, "oauth")
  return auth
}

async function main(root, budgets) {
  const writer = evidenceWriter(root), summary = { scope: "S09 native PNG visual only; harness download, not autonomous batch", model: authorizedModel,
    check: "in_progress", visualRead: false, activeCredentialUnchanged: "unknown", started: Date.now() }
  let original, failure
  try {
    original = credential(); writer.secrets.push(original.value.access, original.value.refresh)
    assert.ok(original.value.expires > Date.now() + budgets.window, "Insufficient token lifetime; no refresh")
    const { host, config, settings, env } = await prepareConsumer(root, authorizedModel)
    // Reuse the already verified trial-only S13 shim, last after the provider.
    // This does not modify the shared provider, model, variant or credentials.
    settings.plugins = [new URL("./observer", import.meta.url).href, ...settings.plugins.filter(p => p.includes("provider-plugin")),
      new URL("../context-model/effort-shim/back", import.meta.url).href]
    settings.policies = [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "plainconcepts", effect: "allow" }]
    await writeFile(join(config, "opencode.json"), JSON.stringify(settings))
    await withServer(host, { ...env, OPENCODE_S13_EFFORT: "xhigh",
      OPENCODE_S13_RECORDS: join(root, "sdk-records.jsonl").replaceAll("\\", "/") }, async connected => {
      const request = privateRequest(connected, host)
      writer.secrets.push(connected.OPENCODE_PASSWORD)
      await request("POST", "/api/credential", { integrationID: authorizedModel.providerID, value: { ...original.value, refresh: "" } })
      await runPngCase({ request, writer, summary, host, flow: budgets.flow })
    }, ["attachment-observer", "s13-effort-shim-back", "plainconcepts", "ai-assisted-planning.agent-session", "ai-assisted-planning.markitdown-utf8"])
  } catch (error) { failure = error; summary.check = "failed"; summary.error = error.message }
  finally {
    if (original) try {
      summary.activeCredentialUnchanged = hash(JSON.stringify(credential())) === hash(JSON.stringify(original))
      assert.equal(summary.activeCredentialUnchanged, true, "Shared credential changed")
    } catch (error) { summary.credentialCheckError = error.message; summary.check = "failed"; failure ??= error }
    summary.finished = Date.now(); await writer.save("summary.json", summary)
  }
  if (failure) throw new Error("S09 trial failed; inspect sanitized summary.json")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const budgets = consentS09(process.env)
  if (process.argv[2] === "--worker") await main(process.argv[3], budgets)
  else {
    assert.equal(process.argv.length, 2)
    const root = await mkdtemp(join(process.env.LOCALAPPDATA, "Temp/opencode/s09-model-"))
    console.log("Evidence: " + root)
    try { await runBounded(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], { cwd: source, env: process.env, timeout: budgets.window - 6000 }) }
    catch (error) {
      await evidenceWriter(root).save("supervision-failure.json", { check: "failed", visualRead: false, error: error.message,
        activeCredentialUnchanged: "unknown", ...(error.cleanupError ? { cleanupError: error.cleanupError } : {}) })
      throw error
    }
  }
}
