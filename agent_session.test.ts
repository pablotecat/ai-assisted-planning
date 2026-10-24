import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import plugin from "./plugin/agent-session.ts"
import utf8 from "./plugin/markitdown-utf8.ts"
import { makeIdentity } from "./tools/identity.ts"
import { publishSession, type Identity } from "./tools/session_store.ts"

async function adapter(nodes: Record<string, Identity>) {
  const hooks: Record<string, (event: any) => Promise<void>> = {}
  const tools: Record<string, any> = {}
  const permissions: any[] = []
  const investigator = { permissions: [] as any[] }
  const ctx = {
    agent: { transform: async (fn: any) => fn({ update: (_id: string, update: any) => update(investigator) }) },
    session: {
      get: async ({ sessionID }: any) => {
        const node = nodes[sessionID]
        if (!node) throw new Error("Sesión desconocida")
        return { ...node, time: { created: node.created }, location: { directory: node.directory } }
      },
      context: async ({ sessionID }: any) => [
        { id: "mensaje", type: "assistant", agent: nodes[sessionID].agent },
        { id: "compactacion", type: "compaction", summary: "otro-agente" },
      ],
      hook: async (name: string, fn: any) => { hooks[name] = fn },
    },
    permission: { assert: async (input: any) => { permissions.push(input) },
      hook: async (name: string, fn: any) => { hooks[`permission.${name}`] = fn } },
    tool: { transform: async (fn: any) => fn({ add: (tool: any) => { tools[tool.name] = tool } }),
      hook: async (name: string, fn: any) => { hooks[name] = fn } },
  }
  await plugin.setup(ctx as never)
  return {
    investigator, resolver: makeIdentity(ctx as never),
    tools, permissions,
    evaluate: (event: any) => hooks["permission.evaluate"](event),
    context: (sessionID: string) => hooks.context({ sessionID, agent: nodes[sessionID].agent }),
    before: (sessionID: string, tool: string, input = {}) => hooks["execute.before"]({
      sessionID, tool, input, agent: nodes[sessionID].agent, messageID: "mensaje", id: "call",
    }),
  }
}

const base = { title: "Consulta", created: 1, directory: "proyecto" }

test("las diez herramientas se registran en V2 y validan permisos e inputs", async () => {
  const { tools, permissions } = await adapter({})
  assert.equal(Object.keys(tools).length, 10)
  const context = { sessionID: "s", messageID: "mensaje", id: "call", agent: "planificador" }
  const result = await tools.planning_settings.execute({}, context)
  assert.equal(typeof JSON.parse(result.content).MAX_REFINADORES_PARALELOS, "number")
  assert.deepEqual(permissions[0], { sessionID: "s", agent: "planificador",
    source: { type: "tool", messageID: "mensaje", id: "call" },
    action: "planning_settings", resources: ["*"], save: ["*"] })
  await assert.rejects(tools.planning_settings.execute({ proyectoJira: " " }, context))
  await assert.rejects(tools.planning_settings.execute({}, { ...context, agent: "build" }), /Solo planificador/)
})

test("la política dinámica de delegación no se relaja por transformaciones de configuración posteriores", async () => {
  const { evaluate } = await adapter({})
  for (const [agent, action, resources, expected] of [
    ["investigador", "subagent", ["general"], "deny"],
    ["investigador", "subagent", ["revisor"], "allow"],
    ["investigador", "subagent", ["revisor", "general"], "deny"],
    ["build", "subagent", ["general"], "allow"],
    ["investigador", "read", ["general"], "allow"],
  ]) {
    const event = { agent, action, resources, effect: "allow" }
    await evaluate(event)
    assert.equal(event.effect, expected)
  }
})

test("adaptador V2 verifica la autoría del mensaje, publica y bloquea escrituras alternativas", async () => {
  const nodes = { s: { ...base, id: "s", agent: "investigador" } }
  const { before, investigator, resolver } = await adapter(nodes)
  assert.equal(plugin.id, "ai-assisted-planning.agent-session")
  assert.ok(investigator.permissions.some(rule => rule.action === "subagent" && rule.resource === "revisor" && rule.effect === "allow"))
  for (const tool of ["write", "edit", "patch"])
    await assert.rejects(before("s", tool), /restringida/)
  await assert.rejects(before("s", "shell", { command: "echo hola > archivo" }), /no permitido/)
  await before("s", "write_report_pair")
  const dir = await mkdtemp(join(tmpdir(), "planning-adapter-"))
  try {
    const input = { sessionID: "s", messageID: "mensaje", agent: "investigador", topic: "duda", files: { "resumen.md": "ok" } }
    const options = { get: resolver, root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json") }
    await assert.rejects(publishSession(input, { ...options, get: undefined } as never), /Adaptador de sesión no disponible/)
    const data = await publishSession(input, options)
    assert.equal(data.guardado, true)
    if (data.guardado) assert.equal(await readFile(data.rutas["resumen.md"], "utf8"), "ok")
    await assert.rejects(publishSession({ ...input, agent: "lector-codigo" }, options), /Autor/)
    await assert.rejects(publishSession({ ...input, messageID: "compactacion" }, options), /atribuible/)
    await assert.rejects(publishSession({ ...input, messageID: "inexistente" }, options), /atribuible/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("V2 no permite eludir las delegaciones al reanudar una sesión", async () => {
  const nodes: Record<string, Identity> = {}
  for (const agent of ["planificador", "arquitecto", "investigador", "lector-documentacion", "revisor"])
    nodes[agent] = { ...base, id: agent, agent }
  const { before } = await adapter(nodes)
  for (const agent of ["planificador", "arquitecto"]) {
    await assert.rejects(before(agent, "subagent", { agent: "lector-documentacion" }), /no pueden delegar/)
    await assert.rejects(before(agent, "subagent", { agent: "revisor", sessionID: "lector-documentacion" }), /no pueden delegar/)
    await before(agent, "subagent", { agent: "revisor" })
    for (const alias of ["jira", "atlassian"]) await before(agent, `${alias}_getJiraIssue`)
  }
})

test("Test solo trabaja por encargo del arquitecto del mismo proyecto", async () => {
  const nodes: Record<string, Identity> = {
    architect: { ...base, id: "architect", agent: "arquitecto" },
    test: { ...base, id: "test", parentID: "architect", agent: "arquitecto-test" },
    review: { ...base, id: "review", parentID: "test", agent: "revisor" },
    direct: { ...base, id: "direct", agent: "arquitecto-test" },
    build: { ...base, id: "build", agent: "build" },
    wrongParent: { ...base, id: "wrongParent", parentID: "build", agent: "arquitecto-test" },
    foreign: { ...base, id: "foreign", parentID: "architect", agent: "arquitecto-test", directory: "otro" },
  }
  const { context, before } = await adapter(nodes)
  await context("test")
  for (const id of ["direct", "wrongParent", "foreign"]) {
    await assert.rejects(context(id), /requiere delegación/)
    await assert.rejects(before(id, "read", { path: "tests/caso.ts" }), /requiere delegación/)
  }
  await before("architect", "subagent", { agent: "arquitecto-test" })
  await before("architect", "subagent", { agent: "arquitecto-test", sessionID: "test" })
  await assert.rejects(before("build", "subagent", { agent: "arquitecto-test" }), /Solo arquitecto/)
  await assert.rejects(before("build", "subagent", { agent: "general", sessionID: "test" }), /Solo arquitecto/)
  await before("test", "subagent", { agent: "revisor" })
  await before("test", "subagent", { agent: "revisor", sessionID: "review" })
  await assert.rejects(before("test", "subagent", { agent: "lector-codigo" }), /solo delega/)
})

test("los ocho agentes conservan sus límites de edición y shell; no se restringen agentes ajenos", async () => {
  const nodes: Record<string, Identity> = { parent: { ...base, id: "parent", agent: "arquitecto" } }
  const own = ["investigador", "lector-codigo", "lector-documentacion", "planificador", "refinador", "arquitecto", "arquitecto-test", "revisor"]
  const others = ["build", "general", "agente-personalizado", "investigador-extra"]
  for (const agent of [...own, ...others]) nodes[agent] = { ...base, id: agent, agent,
    parentID: agent === "arquitecto-test" ? "parent" : undefined }
  const { before } = await adapter(nodes)
  for (const agent of own) {
    for (const tool of ["edit", "write", "patch"]) await assert.rejects(before(agent, tool), /restringida/)
    await assert.rejects(before(agent, "shell", { command: "npm test" }), /no permitido/)
    await assert.rejects(before(agent, "shell"), /no permitido/)
  }
  for (const agent of others) {
    await before(agent, "write")
    await before(agent, "shell", { command: "npm test" })
  }
  for (const [agent, command] of [["lector-codigo", "codegraph status proyecto --json"],
    ["lector-documentacion", 'markitdown "documento.pdf"'], ["arquitecto-test", "git status --short"]]) {
    await before(agent, "shell", { command })
    await assert.rejects(before(agent, "shell", { command: command + "; npm test" }), /no permitido/)
  }
})

test("MarkItDown configura UTF-8 mediante el hook de shell V2", async () => {
  const event = { env: { EXISTING: "ok" } as Record<string, string> }
  await utf8.setup({ shell: { hook: async (name: string, fn: any) => {
    assert.equal(name, "create.before")
    fn(event)
  } } } as never)
  assert.deepEqual(event.env, { EXISTING: "ok", PYTHONIOENCODING: "utf-8" })
})
