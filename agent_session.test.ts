import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import plugin from "./plugin/agent-session.ts"
import { publishSession, type Identity } from "./tools/session_store.ts"

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

test("Planificador y Arquitecto no invocan Documentación, tampoco al reanudar una sesión", async () => {
  const base = { title: "Consulta", created: Date.now(), directory: "proyecto" }
  const nodes: Record<string, Identity> = {
    plan: { ...base, id: "plan", agent: "agente-planificador" },
    architect: { ...base, id: "architect", agent: "agente-arquitecto" },
    "plan-docs": { ...base, id: "plan-docs", parentID: "plan", agent: "agente-documentacion" },
    "architect-docs": { ...base, id: "architect-docs", parentID: "architect", agent: "agente-documentacion" },
  }
  const client = {
    session: {
      get: async ({ path }: { path: { id: string } }) => {
        const node = nodes[path.id]
        return { data: { ...node, time: { created: node.created } } }
      },
      messages: async ({ path }: { path: { id: string } }) => ({ data: [
        { info: { role: "assistant", agent: nodes[path.id].agent } },
      ] }),
    },
  }
  const hooks = await plugin({ client, directory: "proyecto" } as never)
  const before = hooks["tool.execute.before"]!
  for (const sessionID of ["plan", "architect"]) {
    await assert.rejects(before({ tool: "task", sessionID, callID: "delegate" },
      { args: { subagent_type: "agente-documentacion" } }), /no pueden delegar/)
    await assert.rejects(before({ tool: "task", sessionID, callID: "resume" },
      { args: { subagent_type: "agente-revisor", task_id: `${sessionID}-docs` } }), /no pueden delegar/)
    await before({ tool: "task", sessionID, callID: "review" }, { args: { subagent_type: "agente-revisor" } })
    for (const tool of ["atlassian_searchJiraIssuesUsingJql", "atlassian_getJiraIssue", "atlassian_executeRead"])
      await before({ tool, sessionID, callID: tool }, { args: {} })
  }
})

test("Test solo trabaja por encargo del arquitecto, también al reanudar sesiones", async () => {
  const base = { title: "Tests UI", created: Date.now(), directory: "proyecto" }
  const nodes: Record<string, Identity> = {
    architect: { ...base, id: "architect", agent: "agente-arquitecto" },
    test: { ...base, id: "test", parentID: "architect", agent: "agente-arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "agente-revisor" },
    direct: { ...base, id: "direct", agent: "agente-arquitecto-test" },
    build: { ...base, id: "build", agent: "build" },
    wrongParent: { ...base, id: "wrongParent", parentID: "build", agent: "agente-arquitecto-test" },
    foreign: { ...base, id: "foreign", parentID: "architect", agent: "agente-arquitecto-test", directory: "otro-proyecto" },
    coordinator: { ...base, id: "coordinator", agent: "agente-coordinador" },
  }
  const client = {
    session: {
      get: async ({ path }: { path: { id: string } }) => {
        const node = nodes[path.id]
        return { data: { ...node, time: { created: node.created } } }
      },
      messages: async ({ path }: { path: { id: string } }) => ({ data: [
        { info: { role: "assistant", mode: "build", agent: nodes[path.id].agent } },
        { info: { role: "assistant", agent: "otro-agente", summary: true } },
      ] }),
    },
  }
  const hooks = await plugin({ client, directory: "proyecto" } as never)
  const params = hooks["chat.params"]!
  const before = hooks["tool.execute.before"]!
  await params({ sessionID: "test", agent: "agente-arquitecto-test" } as never, {} as never)
  for (const sessionID of ["direct", "wrongParent", "foreign"]) {
    await assert.rejects(params({ sessionID, agent: "agente-arquitecto-test" } as never, {} as never), /requiere delegación/)
    await assert.rejects(before({ tool: "read", sessionID, callID: "read" }, { args: { filePath: "tests/caso.ts" } }), /requiere delegación/)
  }
  await before({ tool: "task", sessionID: "architect", callID: "delegate" }, { args: { subagent_type: "agente-arquitecto-test" } })
  await before({ tool: "task", sessionID: "architect", callID: "resume" }, { args: { subagent_type: "agente-arquitecto-test", task_id: "test" } })
  await assert.rejects(before({ tool: "task", sessionID: "build", callID: "delegate" }, { args: { subagent_type: "agente-arquitecto-test" } }), /Solo agente-arquitecto/)
  await assert.rejects(before({ tool: "task", sessionID: "build", callID: "resume" }, { args: { subagent_type: "general", task_id: "test" } }), /Solo agente-arquitecto/)
  await before({ tool: "task", sessionID: "test", callID: "review" }, { args: { subagent_type: "agente-revisor" } })
  await before({ tool: "task", sessionID: "test", callID: "resume-review" }, { args: { subagent_type: "agente-revisor", task_id: "review" } })
  await before({ tool: "task", sessionID: "coordinator", callID: "review" }, { args: { subagent_type: "agente-revisor" } })
  await assert.rejects(before({ tool: "task", sessionID: "test", callID: "other" }, { args: { subagent_type: "agente-codigo" } }), /solo delega/)
  await before({ tool: "read", sessionID: "test", callID: "read" }, { args: { filePath: "tests/caso.ts" } })
  await before({ tool: "bash", sessionID: "test", callID: "metadata" }, { args: { command: "git status --short --branch" } })
  for (const command of ["npm test", "git checkout main", "git status; npm test"]) {
    await assert.rejects(before({ tool: "bash", sessionID: "test", callID: "shell" }, { args: { command } }), /no permitido/)
  }
  await assert.rejects(before({ tool: "apply_patch", sessionID: "test", callID: "edit" }, { args: {} }), /restringida/)
})
