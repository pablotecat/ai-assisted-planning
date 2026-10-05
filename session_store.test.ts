import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { publishReview, publishSession, type Identity } from "./tools/session_store.ts"

test("originales y revisión pertenecen a la misma sesión y no se sobrescriben", async () => {
  const dir = await mkdtemp(join(tmpdir(), "planning-session-"))
  const nodes: Record<string, Identity> = {
    plan: { id: "plan", agent: "agente-planificador", title: "Planificación de pagos", created: Date.UTC(2026, 8, 30), directory: dir },
    review: { id: "review", parentID: "plan", agent: "agente-revisor", title: "Revisión", created: 1, directory: dir },
    other: { id: "other", agent: "agente-codigo", title: "Consulta", created: 1, directory: dir },
  }
  const opts = { root: join(dir, "sesiones"), settingsPath: join(dir, "settings.json"),
    get: async (id: string) => nodes[id] ?? Promise.reject(new Error("Sesión desconocida")) }
  try {
    const originals = await publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Requisito recibido" } }, opts)
    assert.equal(originals.guardado, true)
    if (!originals.guardado) return
    await assert.rejects(publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Modificado" } }, opts), /ya están publicados/)
    await assert.rejects(publishSession({ sessionID: "other", agent: "agente-codigo", topic: "Pagos",
      group: "Originales", files: { "PAGO-1.md": "Ajeno" } }, opts), /Solo el planificador/)
    const first = await publishSession({ sessionID: "plan", agent: "agente-planificador", topic: "Pagos",
      group: "entrega", files: { "PAGO-1.md": "Historia refinada" } }, opts)
    assert.equal(first.guardado, true)
    if (!first.guardado) return
    const delivery = dirname(first.rutas["PAGO-1.md"])
    const sanity = await publishReview({ sessionID: "review", delivery, sanity: "Cobertura revisada" }, opts)
    assert.equal(sanity.guardado, true)
    if (!sanity.guardado) return
    assert.equal(await readFile(sanity.rutas["sanity-check.md"], "utf8"), "Cobertura revisada")
    await assert.rejects(publishReview({ sessionID: "review", delivery, sanity: "Reemplazo" }, opts), { code: "EEXIST" })
    await assert.rejects(publishReview({ sessionID: "other", delivery, sanity: "Ajeno" }, opts), /Revisor delegado/)
    assert.equal(await readFile(originals.rutas["PAGO-1.md"], "utf8"), "Requisito recibido")
  } finally { await rm(dir, { recursive: true, force: true }) }
})
