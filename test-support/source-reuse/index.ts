// Private reuse-flow fixture. Not distributed with the planning package.
// Programmed provider (a plain HTTP stand-in, NOT a model) that drives one
// investigator session through the 8.4 reuse contract: two questions with a
// common traversal of APP-1, one single remote read, one capture, one search
// of the snapshot inventory, and one read of the snapshot for the second
// question — with no additional remote source read.
import { createServer } from "node:http"
import { appendFile } from "node:fs/promises"
import { join } from "node:path"

export const corpus = "fixture"
export const referencia = "acta-reutilizacion-2026-11-03"
export const preguntaA = "Pregunta A: ¿qué condiciones exactas exige el original completo de APP-1?"
export const preguntaB = "Pregunta B: ¿qué anexos cita APP-1 en ese mismo original?"

const textOf = (message: any) => typeof message.content === "string" ? message.content
  : Array.isArray(message.content) ? message.content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("")
  : JSON.stringify(message.content ?? "")
const toolCall = (name: string, args: unknown) => ({ tool_calls: [{ index: 0, id: `programmed`, type: "function",
  function: { name, arguments: JSON.stringify(args) } }] })

export async function startReuseFlow(root: string) {
  // Turn memory: work IDs and snapshot coordinates are extracted from the real
  // tool results the session produced, never hardcoded outside the contract.
  const seen: { work1?: string; work2?: string; snap?: string; archivo?: string } = {}
  let count = 0
  const provider = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
    const results = (body.messages ?? []).filter((message: any) => message.role === "tool").map(textOf)
    const tools = results.join("\n")
    const workIds = [...new Set(Array.from(tools.matchAll(/"id"\s*:\s*"(work-[a-f0-9-]+)"/g), match => match[1]))]
    const index = count++
    let delta
    if (index === 0 || index === 4) {
      const pregunta = index === 0 ? preguntaA : preguntaB
      delta = toolCall("session_work", { action: "create", pregunta, criterios: [], corpus, referencia })
    } else if (index === 1) {
      seen.work1 = workIds[0]
      const code = `const issue = await tools.jira.getJiraIssue({cloudId:"fixture.atlassian.net",issueIdOrKey:"APP-1",view:"full"});
        const cap = await tools.sesion.capture_agent_source({encargo_id:${JSON.stringify(seen.work1)},corpus:${JSON.stringify(corpus)},referencia:${JSON.stringify(referencia)},fuente:"APP-1",operacion_id:"cap-app1-reutilizacion",resultado:issue});
        return typeof cap === "string" ? cap : JSON.stringify(cap)`
      delta = toolCall("execute", { code })
    } else if (index === 2 || index === 6) {
      const second = index === 6
      if (second) seen.work2 = workIds.find(id => id !== seen.work1)!
      delta = toolCall("session_work", { action: "record", encargo_id: second ? seen.work2 : seen.work1,
        resultado: second
          ? "Pregunta B respondida reutilizando la instantánea íntegra de APP-1, sin recuperarla de nuevo"
          : "Pregunta A respondida con el original capturado de APP-1",
        pendientes: second ? ["APP-5"] : ["APP-2"],
        siguiente_accion: second ? "Resolver el pendiente de APP-5" : "Resolver el pendiente de APP-2",
        fuentes: ["APP-1"],
        decisiones: [second
          ? "Se reutilizó la instantánea vigente de APP-1: cero lecturas remotas adicionales"
          : "Se conservó el original completo de APP-1 como instantánea"],
        suficiencia: "parcial" })
    } else if (index === 3) {
      delta = toolCall("session_artifacts", { action: "list", encargo_id: seen.work1, corpus, referencia })
    } else if (index === 5) {
      seen.snap = /"id"\s*:\s*"(snap-[a-f0-9-]+)"/.exec(tools)?.[1]
      seen.archivo = /"archivo"\s*:\s*"(fuentes\/[^"]+)"/.exec(tools)?.[1]
      delta = toolCall("session_artifacts", { action: "read", encargo_id: seen.work1, corpus, referencia,
        artefacto_id: seen.snap, archivo: seen.archivo, limite: 16000 })
    } else {
      delta = { content: "REUTILIZACION_COMPLETADA" }
    }
    await appendFile(join(root, "provider-requests.jsonl"), JSON.stringify({ index, url: req.url,
      workIds: workIds.length, hasSnapshot: Boolean(seen.snap) }) + "\n").catch(() => {})
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "programmed", object: "chat.completion.chunk", model: "test",
      choices: [{ index: 0, delta: {}, finish_reason: delta.content ? "stop" : "tool_calls" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve))
  const port = (provider.address() as { port: number }).port
  return {
    provider, port,
    close: () => { provider.closeAllConnections(); provider.close() },
    requests: () => count,
    seen,
  }
}
