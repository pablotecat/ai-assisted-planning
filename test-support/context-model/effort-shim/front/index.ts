// S13 trial-only gateway containment for the pre-trial cotejo; never installed
// in a consumer package and inert unless OPENCODE_S13_SINK is set. Runs as the
// FIRST plugin: the provider plugin's own sdk hook runs later and wraps the
// fetch installed here, so no request of this private consumer can reach the
// real gateway while this shim is active. The intercepted wire body is
// recorded to OPENCODE_S13_RECORDS (JSONL, no secrets in this file).
import { Plugin } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"

const SINK = process.env.OPENCODE_S13_SINK && /^http:\/\/127\.0\.0\.1:\d+/.test(process.env.OPENCODE_S13_SINK)
  ? process.env.OPENCODE_S13_SINK : undefined
const RECORDS = process.env.OPENCODE_S13_RECORDS

const log = (value: unknown) => { if (RECORDS) void appendFile(RECORDS, JSON.stringify(value) + "\n").catch(() => {}) }
const canned = () => new Response(
  "data: " + JSON.stringify({ id: "sink", object: "chat.completion.chunk", model: "glm-5-3",
    choices: [{ index: 0, delta: { content: "PROGRAMMED: sink answer, no model" }, finish_reason: null }] }) + "\n\n" +
  "data: " + JSON.stringify({ id: "sink", object: "chat.completion.chunk", model: "glm-5-3",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) + "\n\ndata: [DONE]\n\n",
  { status: 200, headers: { "content-type": "text/event-stream" } })

export default Plugin.define({ id: "s13-effort-shim-front", async setup(ctx) {
  if (!SINK) return
  await ctx.aisdk.hook("sdk", input => {
    if (input.model?.providerID !== "plainconcepts") return
    log({ kind: "hook-front", model: input.model.id, options: Object.keys(input.options ?? {}).sort() })
    input.options.baseURL = SINK
    input.options.fetch = async (url: any, init: any) => {
      log({ kind: "wire", url: String(url), body: typeof init?.body === "string" ? init.body : null })
      return canned()
    }
  })
} })
