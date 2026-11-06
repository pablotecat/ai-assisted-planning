import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { saveEvidence } from "../test-support/opencode.mjs"

test("los diagnósticos de consumidores privados omiten credenciales y razonamiento", async t => {
  const root = await mkdtemp(join(tmpdir(), "opencode-evidence-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await saveEvidence(root, "result.json", { native: "private", reasoning: "private", headers: { authorization: "private" },
    nested: [{ apiKey: "private", content: "Dato sintético Basic c2VjcmV0 Bearer token https://fixture.invalid/?secret=private" }] })
  const text = await readFile(join(root, "result.json"), "utf8")
  assert.ok(!/private|c2VjcmV0|token|reasoning|native|authorization/.test(text))
  assert.ok(text.includes("Dato sintético"))
})
