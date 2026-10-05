import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import plugin from "./plugin/agent-session.ts"
import { publishSession } from "./tools/session_store.ts"

test("adaptador OpenCode usa identidades de sesión y bloquea otras escrituras", async () => {
  const client = {
    session: {
      get: async () => ({ data: { id: "s", title: "Consulta", time: { created: Date.now() }, directory: "proyecto" } }),
      messages: async () => ({ data: [{ info: { role: "assistant", mode: "agente-coordinador" } }] }),
      message: async () => ({ data: { info: { role: "assistant", mode: "agente-coordinador" } } }),
    },
  }
  const hooks = await plugin({ client, directory: "proyecto" } as never)
  const before = hooks["tool.execute.before"]!
  await assert.rejects(before({ tool: "write", sessionID: "s", callID: "a" }, { args: {} }), /restringida/)
  await assert.rejects(before({ tool: "bash", sessionID: "s", callID: "b" }, { args: { command: "echo hola > archivo" } }), /no permitido/)
  await before({ tool: "write_report_pair", sessionID: "s", callID: "c" }, { args: {} })
  const dir = await mkdtemp(join(tmpdir(), "planning-adapter-"))
  try {
    const data = await publishSession({ sessionID: "s", messageID: "mensaje", agent: "agente-coordinador", topic: "duda",
      files: { "resumen.md": "ok" } }, { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json") })
    assert.equal(data.guardado, true)
    if (data.guardado) assert.equal(await readFile(data.rutas["resumen.md"], "utf8"), "ok")
    await assert.rejects(publishSession({ sessionID: "s", messageID: "mensaje", agent: "agente-codigo", topic: "duda",
      files: { "resumen.md": "no" } }, { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json") }), /Autor/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
