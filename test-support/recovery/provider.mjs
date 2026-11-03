import { createServer } from "node:http"

// Programmed HTTP responses, never an LLM. No external requests or real credentials.
export async function recoveryProvider() {
  const requests = []
  const server = createServer(async (req, res) => {
    let body = ""
    for await (const part of req) body += part
    const request = JSON.parse(body)
    requests.push({ model: request.model, at: Date.now() })
    if (request.model === "quota") {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "3600" })
      return res.end(JSON.stringify({ error: { message: "Synthetic quota reset", type: "rate_limit_exceeded" } }))
    }
    if (request.model === "transport") { req.socket.destroy(); return }
    const messages = request.messages ?? [], index = messages.findLastIndex(m => m.role === "user")
    const prompt = JSON.stringify(messages[index]?.content)
    const afterTool = messages.slice(index + 1).some(m => m.role === "tool")
    const workID = prompt.match(/work-[a-zA-Z0-9-]+/)?.[0]
    const publish = prompt.includes("fixture:publish") && !afterTool
    const inventory = prompt.includes("fixture:inventory") && !afterTool
    const delta = publish || inventory ? { tool_calls: [{ index: 0, id: publish ? "recovery-publish" : "recovery-inventory", type: "function",
      function: { name: publish ? "publish_agent_deliverable" : "session_artifacts", arguments: JSON.stringify(publish
        ? { nombre: "conclusion.md", contenido: "CA-1 verificado; CA-2 pendiente", encargo_id: workID, operacion_id: "lost-reply" }
        : { action: "list", encargo_id: workID, corpus: "fixture", referencia: "v1" }) } }] }
      : { content: "Resultado sintético, no decisión de un modelo" }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "recovery-response", object: "chat.completion.chunk", model: request.model,
      choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ id: "recovery-response", object: "chat.completion.chunk", model: request.model,
      choices: [{ index: 0, delta: {}, finish_reason: publish || inventory ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  return { requests, url: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
}
