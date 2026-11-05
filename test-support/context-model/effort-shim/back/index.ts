// S13 trial-only reasoning-effort shim (user-authorized 2026-11-04); never
// installed in a consumer package and inert unless OPENCODE_S13_EFFORT is set.
// Runs as the LAST plugin: its sdk hook runs after the provider plugin already
// installed its sdk factory, and the last assignment wins (observed). The
// factory structure is preserved — languageModel/chatModel keep returning
// real models — but every produced model injects providerOptions with the
// provider-admitted reasoning effort (xhigh; see the S09 contract: the default
// high is rejected with 400 by this model). Only reasoningEffort is touched:
// no model, plugin, variant or base URL change, no other option.
import { Plugin } from "@opencode/plugin"
import { appendFile } from "node:fs/promises"

const EFFORT = process.env.OPENCODE_S13_EFFORT === "xhigh" ? "xhigh" : undefined
const RECORDS = process.env.OPENCODE_S13_RECORDS
const log = (value: unknown) => { if (RECORDS) void appendFile(RECORDS, JSON.stringify(value) + "\n").catch(() => {}) }

const inject = (options: any) => ({
  ...options,
  providerOptions: {
    ...(options?.providerOptions ?? {}),
    openaiCompatible: { ...(options?.providerOptions?.openaiCompatible ?? {}), reasoningEffort: EFFORT },
    plainconcepts: { ...(options?.providerOptions?.plainconcepts ?? {}), reasoningEffort: EFFORT },
  },
})

export default Plugin.define({ id: "s13-effort-shim-back", async setup(ctx) {
  if (!EFFORT) return
  await ctx.aisdk.hook("sdk", input => {
    if (input.model?.providerID !== "plainconcepts") return
    const wrapped: any = (input as any).sdk
    if (!wrapped || typeof wrapped !== "object" && typeof wrapped !== "function") return
    log({ kind: "hook-back", model: input.model.id, effort: EFFORT,
      factories: ["languageModel", "chatModel"].filter(key => typeof wrapped[key] === "function") })
    const wrapModel = (model: any) => {
      if (!model || typeof model !== "object" || typeof model.doStream !== "function" || model.__s13EffortShim) return model
      return {
        ...model,
        __s13EffortShim: true,
        doGenerate: (options: any) => model.doGenerate(inject(options)),
        doStream: (options: any) => model.doStream(inject(options)),
      }
    }
    const proxy: any = Object.assign(
      (...args: unknown[]) => typeof wrapped === "function" ? wrapModel(wrapped(...(args as []))) : undefined,
      wrapped)
    for (const key of ["languageModel", "chatModel"])
      if (typeof wrapped[key] === "function")
        proxy[key] = (id: string, settings?: unknown) => wrapModel(wrapped[key](id, settings))
    ; (input as any).sdk = proxy
  })
} })
