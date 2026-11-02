import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { opencode } from "./verify-opencode.mjs"

const finite = value => typeof value === "number" && Number.isFinite(value)
const opaque = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) ? value : undefined

// The CLI owns service discovery and authentication. Never read service files or credentials here.
export function apiReader({ cwd = process.cwd(), env = process.env, server } = {}) {
  return async path => {
    const result = opencode(["api", ...(server ? ["--server", server] : []), "get", path], cwd, env)
    // CLI errors can contain request bodies or credentials. Do not forward their output.
    if (result.status !== 0) throw new Error("La lectura de OpenCode falló; comprueba conexión, autorización y versión con su CLI.")
    try { return JSON.parse(result.stdout) } catch { throw new Error("OpenCode no devolvió JSON válido.") }
  }
}

export function inspectContract(spec) {
  const expected = {
    "/api/info": "server.info",
    "/api/session": "session.list",
    "/api/session/{sessionID}": "session.get",
    "/api/session/{sessionID}/message": "session.message.list",
  }
  for (const [path, operationID] of Object.entries(expected)) {
    if (spec.paths?.[path]?.get?.operationId !== operationID)
      throw new Error("Contrato OpenCode V2 no compatible con el adaptador de diagnóstico.")
  }
  for (const path of ["/api/session", "/api/session/{sessionID}/message"]) {
    const names = spec.paths[path].get.parameters?.map(parameter => parameter.name) ?? []
    if (!["limit", "cursor", "order"].every(name => names.includes(name)))
      throw new Error("El contrato no acredita la paginación necesaria.")
  }
  return { pagination: "cursor.next", messages: "projected-history",
    absent: ["internal-operations", "first-provider-event", "delegated-wait", "notification", "integration"],
    consistency: "non-atomic-read" }
}

async function pages(read, path, query, counts) {
  const items = new Map()
  const seen = new Set()
  let cursor
  do {
    const params = new URLSearchParams(cursor ? { limit: query.limit, cursor } : query)
    const page = await read(`${path}?${params}`)
    if (!Array.isArray(page?.data) || !page.cursor || typeof page.cursor !== "object")
      throw new Error("Página de OpenCode incompatible; no se acredita cobertura completa.")
    counts.pages++
    for (const item of page.data) {
      if (!opaque(item.id)) throw new Error("Identificador de historial no válido.")
      if (items.has(item.id)) counts.duplicates++
      items.set(item.id, item)
    }
    // V2 2.1.2 emits null at the end, although its generated schema marks this optional.
    cursor = page.cursor.next ?? undefined
    if (cursor !== undefined && (typeof cursor !== "string" || !cursor.length || seen.has(cursor)))
      throw new Error("Cursor de OpenCode inválido o repetido; lectura incompleta.")
    seen.add(cursor)
  } while (cursor !== undefined)
  return [...items.values()]
}

export async function acquireSessions(read, { rootID, descendants = "all", exclude = [], pageSize = 200, now = Date.now } = {}) {
  if (!opaque(rootID) || exclude.some(id => !opaque(id)) || exclude.includes(rootID))
    throw new Error("Raíz o exclusiones no válidas; la auditoría debe estar fuera de la raíz diagnosticada.")
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new Error("Tamaño de página no válido.")
  const started = now()
  const contract = inspectContract(await read("/openapi.json"))
  const info = await read("/api/info")
  const root = (await read(`/api/session/${encodeURIComponent(rootID)}`)).data
  if (root?.id !== rootID) throw new Error("La raíz solicitada no coincide con la respuesta.")
  const counts = { pages: 0, duplicates: 0 }
  const sessions = [root]
  const seen = new Set([rootID])
  for (let index = 0; index < sessions.length && descendants !== "none"; index++) {
    const children = await pages(read, "/api/session", { parentID: sessions[index].id, order: "asc", limit: pageSize }, counts)
    for (const child of children) {
      if (child.parentID !== sessions[index].id) throw new Error("Relación de descendencia incompatible.")
      if (!exclude.includes(child.id) && !seen.has(child.id)) { sessions.push(child); seen.add(child.id) }
    }
  }
  const selected = selectSessions(sessions, { rootID, descendants, exclude })
  // Retain ancestor headers to verify a sparse selection again during reduction, but read only selected transcripts.
  const acquired = sessions.map(session => ({ ...session, messages: [] }))
  for (const session of selected) acquired.find(item => item.id === session.id).messages = await pages(read,
    `/api/session/${encodeURIComponent(session.id)}/message`, { order: "asc", limit: pageSize }, counts)
  return { schemaVersion: 1, sessions: acquired, acquisition: { source: "original-event", contract,
    version: opaque(info.version), started, completed: now(), pageSize, ...counts } }
}

function selectSessions(sessions, { rootID, descendants = "all", exclude = [] }) {
  const byID = new Map(sessions.map(session => [session.id, session]))
  if (!byID.has(rootID) || exclude.includes(rootID)) throw new Error("Raíz ausente o excluida.")
  const selected = new Set([rootID])
  if (descendants !== "none") {
    let changed = true
    while (changed) {
      changed = false
      for (const session of byID.values()) {
        if (selected.has(session.parentID) && !exclude.includes(session.id) && !selected.has(session.id)) {
          selected.add(session.id); changed = true
        }
      }
    }
  }
  if (Array.isArray(descendants)) {
    if (descendants.some(id => !selected.has(id))) throw new Error("Selección fuera del árbol permitido.")
    return [...byID.values()].filter(session => session.id === rootID || descendants.includes(session.id))
  }
  if (!["all", "none"].includes(descendants)) throw new Error("Selección de descendientes no válida.")
  return [...byID.values()].filter(session => selected.has(session.id))
}

const sources = ["original-event", "history-reconstruction", "agent-declaration"]
const sourceOf = value => sources.includes(value) ? value : "history-reconstruction"
// Export is constructed field by field. No native payload or caller-supplied metric object is copied.
const metric = (value, unit, coverage = "complete", provenance = "history-reconstruction") => ({ value: finite(value) ? value : null, unit, coverage, provenance })
const timeOf = time => Object.fromEntries(["created", "ran", "streamed", "completed"].filter(key => finite(time?.[key])).map(key => [key, time[key]]))
const messageTypes = ["user", "assistant", "synthetic", "system", "skill", "shell", "compaction", "idle", "agent-switched", "model-switched", "location-switched"]
const inRange = (at, from, to) => finite(at) && at >= from && at < to
const overlaps = (time, from, to) => inRange(time?.created, from, to)
  || (finite(time?.created) && time.created < from && (!finite(time.completed) || time.completed > from))
const toolsOf = message => [...new Map((message.content ?? []).filter(part => part.type === "tool").map(tool => [tool.id, tool])).values()]
const operationKey = (sessionID, id) => `${sessionID}/${id}`
const containers = new Set(["execute", "functions.execute", "parallel", "multi_tool_use.parallel"])
const layers = ["internal", "catalog-search", "recovery-request", "orchestration"]
const categories = ["provider", "permission", "invocation", "domain", "unknown"]
const provenanceOf = items => items.length ? [...new Set(items.flatMap(item => [item.provenance, item.expansionProvenance ?? []].flat()))].sort() : ["history-reconstruction"]

function errorCategory(error) {
  if (["permission.denied", "PermissionDeniedError", "ForbiddenError"].includes(error?.type)) return "permission"
  if (["tool.input", "InvalidArgumentsError", "tool.not-found"].includes(error?.type)) return "invocation"
  return "unknown"
}

function operationDiagnostics(sessions, observations = {}, from, to, provenance) {
  const operations = new Map()
  const messages = new Map()
  const incidents = new Map()
  const addIncident = record => {
    const key = operationKey(record.sessionID, record.id)
    const existing = incidents.get(key)
    if (existing && existing.category !== "unknown" && record.category !== "unknown" && existing.category !== record.category)
      throw new Error("Clasificaciones de incidente incompatibles.")
    if (!existing) incidents.set(key, { ...record, references: [] })
    const incident = incidents.get(key)
    if (incident.category === "unknown") incident.category = record.category
    if (incident.retryOf && record.retryOf && incident.retryOf !== record.retryOf) throw new Error("Correlación de reintentos incompatible.")
    incident.retryOf ??= record.retryOf
    incident.status ??= record.status
    incident.provenance = [...new Set([incident.provenance, record.provenance].flat())].sort()
    for (const reference of record.references ?? []) {
      const refKey = JSON.stringify(reference)
      if (!incident.references.some(item => JSON.stringify(item) === refKey)) incident.references.push(reference)
    }
  }
  for (const session of sessions) {
    for (const message of new Map((session.messages ?? []).map(message => [message.id, message])).values()) {
      messages.set(operationKey(session.id, message.id), message)
      if (inRange(message.time?.created, from, to) && (message.error || message.retry?.error)) addIncident({
        id: message.id, sessionID: session.id, category: message.type === "assistant" ? "provider" : "unknown",
        status: statusOf(message.error?.status ?? message.retry?.error?.status),
        attempts: 1, retryAttempt: Number.isInteger(message.retry?.attempt) && message.retry.attempt > 0 ? message.retry.attempt : undefined, provenance,
        references: [{ sessionID: session.id, messageID: message.id }],
      })
      for (const tool of toolsOf(message)) {
        if (!overlaps(tool.time, from, to)) continue
        if (!opaque(tool.id) || !opaque(tool.name)) throw new Error("Operación sin identidad diagnóstica válida.")
        const operation = { id: tool.id, sessionID: session.id, messageID: message.id, name: tool.name,
          layer: ["subagent", "functions.subagent"].includes(tool.name) ? "orchestration" : "registered",
          registered: true, container: containers.has(tool.name), expansion: containers.has(tool.name) ? "unknown" : "complete",
          status: ["streaming", "running", "completed", "error"].includes(tool.state?.status) ? tool.state.status : "unknown",
          time: timeOf(tool.time), provenance }
        const key = operationKey(session.id, tool.id)
        if (operations.has(key) && (operations.get(key).messageID !== message.id || operations.get(key).name !== tool.name))
          throw new Error("ID de operación repetido en mensajes distintos.")
        operations.set(key, operation)
        let domain
        // Recognize only this explicit structured envelope, never prose mentioning an error.
        for (const content of tool.state?.content ?? []) {
          if (content.type !== "text") continue
          try {
            const error = JSON.parse(content.text).error
            if (error?.type === "domain" && statusOf(error.status)) domain = error
          } catch { /* Unknown tool payloads remain opaque. */ }
        }
        if (tool.state?.status === "error" || domain) addIncident({ id: tool.id, sessionID: session.id,
          category: domain ? "domain" : errorCategory(tool.state?.error), status: statusOf(domain?.status ?? tool.state?.error?.status),
          attempts: 1, provenance, references: [{ sessionID: session.id, messageID: message.id, operationID: tool.id }] })
      }
    }
  }
  const sessionIDs = new Set(sessions.map(session => session.id))
  for (const record of observations.operations ?? []) {
    if (!sessionIDs.has(record.sessionID) || !overlaps(record.time, from, to)) continue
    if (!opaque(record.id) || !opaque(record.name) || !opaque(record.messageID) || !messages.has(operationKey(record.sessionID, record.messageID)) || !sources.includes(record.provenance))
      throw new Error("Recibo de operación sin identidad, mensaje o procedencia verificable.")
    const key = operationKey(record.sessionID, record.id)
    const existing = operations.get(key)
    if (existing && (existing.messageID !== record.messageID || existing.name !== record.name)) throw new Error("Recibo incompatible con la operación registrada.")
    const operation = existing ?? { id: record.id, sessionID: record.sessionID, messageID: record.messageID,
      name: record.name, layer: layers.includes(record.layer) ? record.layer : "internal", registered: false,
      status: ["completed", "error", "running"].includes(record.status) ? record.status : "unknown",
      time: timeOf(record.time), provenance: record.provenance }
    if (record.parentID && !opaque(record.parentID)) throw new Error("Contención no válida.")
    operation.parentID = opaque(record.parentID)
    operation.container = record.kind === "container" || containers.has(operation.name)
    operation.expansion = ["complete", "partial", "unknown"].includes(record.expansion) ? record.expansion : operation.container ? "unknown" : "complete"
    operation.expansionProvenance = record.provenance
    operations.set(key, operation)
  }
  const children = new Map()
  for (const operation of operations.values()) {
    if (!operation.parentID) continue
    const parent = operationKey(operation.sessionID, operation.parentID)
    if (!operations.has(parent)) throw new Error("Contenedor ausente en los recibos del intervalo.")
    const list = children.get(parent) ?? []
    list.push(operation); children.set(parent, list)
    operations.get(parent).container = true
  }
  const leaves = new Set()
  const visited = new Set()
  const visiting = new Set()
  const expand = operation => {
    const key = operationKey(operation.sessionID, operation.id)
    if (visiting.has(key)) throw new Error("Ciclo de contención en los recibos.")
    if (visited.has(key)) return
    visiting.add(key)
    const nested = children.get(key) ?? []
    if (!nested.length && (!operation.container || operation.expansion === "complete")) leaves.add(key)
    for (const child of nested) expand(child)
    visiting.delete(key); visited.add(key)
  }
  for (const operation of operations.values()) expand(operation)
  for (const record of observations.incidents ?? []) {
    if (!sessionIDs.has(record.sessionID) || !inRange(record.at, from, to)) continue
    if (!opaque(record.id) || !categories.includes(record.category) || !sources.includes(record.provenance)) throw new Error("Recibo de incidente no válido.")
    const references = (record.references ?? []).filter(reference => sessionIDs.has(reference.sessionID)
      && opaque(reference.messageID) && messages.has(operationKey(reference.sessionID, reference.messageID))
      && inRange(messages.get(operationKey(reference.sessionID, reference.messageID)).time?.created, from, to))
      .map(reference => ({ sessionID: reference.sessionID, messageID: reference.messageID,
        operationID: opaque(reference.operationID) }))
    if (!references.length) throw new Error("Incidente sin referencias en el intervalo.")
    for (const reference of references) {
      if (reference.operationID && operations.get(operationKey(reference.sessionID, reference.operationID))?.messageID !== reference.messageID)
        throw new Error("Referencia a una operación no verificada.")
    }
    addIncident({ id: record.id, sessionID: record.sessionID, category: record.category, status: statusOf(record.status),
      attempts: 1, retryOf: opaque(record.retryOf), provenance: record.provenance, references })
  }
  // Resolve against the unchanged inventory: correlation is independent of receipt order.
  const grouped = new Map()
  for (const [key, incident] of incidents) {
    const seen = new Set([key])
    let target = incident
    while (target.retryOf) {
      const targetKey = operationKey(target.sessionID, target.retryOf)
      if (seen.has(targetKey) || !incidents.has(targetKey)) throw new Error("Correlación de reintentos no válida.")
      seen.add(targetKey); target = incidents.get(targetKey)
    }
    if (target.category !== incident.category) throw new Error("Reintento de categoría distinta.")
    const rootKey = operationKey(target.sessionID, target.id)
    if (!grouped.has(rootKey)) grouped.set(rootKey, { ...target, attempts: 0, references: [], provenance: [] })
    const group = grouped.get(rootKey)
    group.attempts += incident.attempts
    group.provenance = [...new Set([...group.provenance, ...incident.provenance])].sort()
    group.references.push(...incident.references.filter(ref => !group.references.some(item => JSON.stringify(ref) === JSON.stringify(item))))
  }
  const list = [...operations.values()]
  const unknown = list.filter(operation => operation.container && operation.expansion !== "complete")
  const count = (predicate, registered = false) => {
    const items = list.filter(predicate)
    return metric(items.length, "operations", !registered && (unknown.length || items.some(item => item.provenance === "agent-declaration")) ? "partial" : "complete", provenanceOf(items))
  }
  return { operations: list, incidents: [...grouped.values()],
    containment: list.filter(operation => operation.parentID).map(operation => ({ sessionID: operation.sessionID, parentID: operation.parentID, childID: operation.id })),
    counts: { registeredTools: count(operation => operation.registered, true), internalOperations: count(operation => !operation.registered),
      catalogSearches: count(operation => operation.layer === "catalog-search"), recoveryRequests: count(operation => operation.layer === "recovery-request"),
      orchestration: count(operation => operation.layer === "orchestration"),
      finalOperations: metric(leaves.size, "operations", unknown.length || list.some(item => item.provenance === "agent-declaration" || item.expansionProvenance === "agent-declaration") ? "partial" : "complete", provenanceOf(list)),
      unknownExpansions: metric(unknown.length, "containers"),
      httpRequests: metric(null, "requests", "unknown"),
      incidents: metric(grouped.size, "incidents", "partial", provenanceOf([...grouped.values()])),
    } }
}

const statusOf = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined

function intervalStats(intervals) {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let union = 0, end = -Infinity, peak = 0, active = 0
  for (const [start, stop] of sorted) { union += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop) }
  for (const [, delta] of sorted.flatMap(([start, stop]) => [[start, 1], [stop, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    active += delta; peak = Math.max(peak, active)
  }
  return { union, peak, span: sorted.length ? end - sorted[0][0] : null }
}

const publishers = new Set(["publish_agent_deliverable", "write_report_pair", "write_planning_originals", "write_planning_deliverables", "write_review_documents"])

function temporalDiagnostics(sessions, operations, observations = {}, from, to, provenance) {
  const bySession = new Map(sessions.map(session => [session.id, session]))
  const messages = new Map(sessions.flatMap(session => [...new Map((session.messages ?? []).map(message => [message.id, message])).values()]
    .map(message => [operationKey(session.id, message.id), message])))
  const clipped = (start, end) => [Math.max(from, start), Math.min(to, finite(end) ? end : to)]
  const execution = operations.filter(operation => finite(operation.time.ran)).map(operation => clipped(operation.time.ran, operation.time.completed))
  for (const operation of operations) {
    const { created, ran, completed } = operation.time
    if ((finite(ran) && ran < created) || (finite(completed) && completed < (ran ?? created))) throw new Error("Marcas de herramienta invertidas.")
  }
  const executionPartial = operations.some(operation => !finite(operation.time.ran) || !finite(operation.time.completed) || operation.provenance === "agent-declaration")
  const queue = operations.map(operation => ({ sessionID: operation.sessionID, operationID: operation.id,
    elapsed: metric(finite(operation.time.ran) ? Math.max(0, Math.min(to, operation.time.ran) - Math.max(from, operation.time.created)) : null,
      "ms", finite(operation.time.ran) ? "complete" : "unknown", operation.provenance) }))
  const waits = [], deliveries = [], firstEvents = []
  const seen = new Set()
  for (const record of observations.timings ?? []) {
    if (!bySession.has(record.sessionID)) continue
    if (!opaque(record.id) || !sources.includes(record.provenance)) throw new Error("Marca temporal sin identidad o procedencia.")
    const key = operationKey(record.sessionID, record.id)
    if (seen.has(key)) continue
    seen.add(key)
    const partial = record.provenance === "agent-declaration" ? "partial" : "complete"
    if (record.kind === "first-event") {
      const message = messages.get(operationKey(record.sessionID, record.messageID))
      if (!message || !inRange(message.time.created, from, to)) continue
      const valid = inRange(record.firstEventAt, from, to) && record.firstEventAt >= message.time.created
      firstEvents.push({ sessionID: record.sessionID, messageID: opaque(record.messageID),
        elapsed: metric(valid ? record.firstEventAt - message.time.created : null, "ms", valid ? partial : "unknown", record.provenance) })
    } else if (["delegated-wait", "result-delivery"].includes(record.kind)) {
      if (bySession.get(record.childSessionID)?.parentID !== record.sessionID) throw new Error("Marca sin relación de delegación verificada.")
      if (record.kind === "delegated-wait") {
        if (!inRange(record.start, from, to) && !(finite(record.start) && record.start < from && (!finite(record.end) || record.end > from))) continue
        if (finite(record.end) && record.end < record.start) throw new Error("Espera con fechas invertidas.")
        waits.push({ id: record.id, sessionID: record.sessionID, childSessionID: record.childSessionID,
          start: Math.max(from, record.start), end: Math.min(to, finite(record.end) ? record.end : to),
          coverage: !finite(record.end) || record.end > to ? "partial" : partial, provenance: record.provenance })
      } else {
        if (!inRange(record.resultAt, from, to)) continue
        const latency = end => metric(inRange(end, from, to) && end >= record.resultAt ? end - record.resultAt : null,
          "ms", inRange(end, from, to) && end >= record.resultAt ? partial : "unknown", record.provenance)
        deliveries.push({ id: record.id, sessionID: record.sessionID, childSessionID: record.childSessionID,
          resultToNotification: latency(record.notifiedAt), resultToIntegration: latency(record.integratedAt) })
      }
    }
  }
  const steps = [...messages.entries()].filter(([, message]) => message.type === "assistant" && overlaps(message.time, from, to))
  const concurrent = intervalStats(steps.map(([, message]) => clipped(message.time.created, message.time.completed)))
  const all = intervalStats([...execution, ...waits.map(wait => [wait.start, wait.end])])
  const tokenFields = { input: message => message.tokens?.input, output: message => message.tokens?.output,
    reasoning: message => message.tokens?.reasoning, cacheRead: message => message.tokens?.cache?.read,
    cacheWrite: message => message.tokens?.cache?.write }
  const usageMessages = [...messages.values()].filter(message => ["assistant", "compaction"].includes(message.type) && overlaps(message.time, from, to))
  const completeUsage = usageMessages.filter(message => inRange(message.time.created, from, to)
    && finite(message.time.completed) && message.time.completed <= to)
  const sumUsage = (getter, unit) => {
    const values = completeUsage.map(getter).filter(value => finite(value) && value >= 0)
    return metric(values.length ? values.reduce((sum, value) => sum + value, 0) : null, unit,
      values.length === usageMessages.length && values.length ? "complete" : values.length ? "partial" : "unknown", provenance)
  }
  let publisherUnits = 0, publisherCount = 0
  for (const [key, message] of messages) {
    const sessionID = key.split("/")[0]
    for (const tool of toolsOf(message)) {
      if (!publishers.has(tool.name) || !inRange(tool.time?.ran, from, to) || !tool.state?.input || typeof tool.state.input !== "object") continue
      if (operations.some(operation => operation.sessionID === sessionID && operation.id === tool.id)) {
        publisherUnits += JSON.stringify(tool.state.input).length; publisherCount++
      }
    }
  }
  const declarations = (observations.declarations ?? []).filter(record => bySession.has(record.sessionID)
    && inRange(record.at, from, to) && opaque(record.id) && finite(record.value) && record.value >= 0
    && ["reads", "downloads", "sourcesRead", "publisherCharacters"].includes(record.metric))
    .map(record => ({ id: record.id, sessionID: record.sessionID, name: record.metric,
      ...metric(record.value, record.metric === "publisherCharacters" ? "UTF-16-code-units" : record.metric === "sourcesRead" ? "sources" : "operations", "partial", "agent-declaration") }))
  const firstValues = firstEvents.filter(item => item.elapsed.value !== null).map(item => item.elapsed.value)
  const operationOrigins = provenanceOf(operations)
  const combinedOrigins = [...new Set([...operationOrigins, ...provenanceOf(waits)])].sort()
  return { metrics: { windowWall: metric(to - from, "ms"),
    toolExecutionWall: metric(execution.length ? intervalStats(execution).union : null, "ms", executionPartial ? "partial" : execution.length ? "complete" : "unknown", operationOrigins),
    delegatedWaitWall: metric(waits.length ? intervalStats(waits.map(wait => [wait.start, wait.end])).union : null, "ms", waits.length ? "partial" : "unknown", provenanceOf(waits)),
    observedActivityWall: metric(all.span === null ? null : all.union, "ms", "partial", combinedOrigins),
    observedActivitySpan: metric(all.span, "ms", "partial", combinedOrigins),
    peakConcurrentTools: metric(execution.length ? intervalStats(operations.filter(operation => operation.registered && finite(operation.time.ran))
      .map(operation => clipped(operation.time.ran, operation.time.completed))).peak : null, "registered-tools", executionPartial ? "partial" : execution.length ? "complete" : "unknown", operationOrigins),
    peakConcurrentAssistantSteps: metric(steps.length ? concurrent.peak : null, "steps", steps.some(([, message]) => !finite(message.time.completed)) ? "partial" : "complete"),
    firstProviderEvent: metric(firstValues.length ? firstValues.reduce((min, value) => Math.min(min, value)) : null, "ms", firstValues.length ? "partial" : "unknown", provenanceOf(firstEvents.map(item => item.elapsed))),
  }, queue, waits, deliveries, firstEvents,
  usage: { tokens: Object.fromEntries(Object.entries(tokenFields).map(([key, getter]) => [key, sumUsage(getter, "tokens")])),
    providerCost: sumUsage(message => message.cost, "USD"),
    publisherArgumentCodeUnits: metric(publisherCount ? publisherUnits : null, "UTF-16-code-units", publisherCount ? "partial" : "unknown", provenance),
    declarations } }
}

function turnsOf(messages, from, to) {
  const turns = []
  const hasIdle = messages.some(message => message.type === "idle")
  let turn
  const close = (end, closed) => {
    if (!turn) return
    if (turn.start < to && end > from) turns.push({ startMessageID: opaque(turn.startMessageID),
      inputMessageIDs: turn.inputs.filter(message => inRange(message.time?.created, from, to)).map(message => opaque(message.id)),
      assistantMessageIDs: turn.steps.filter(message => inRange(message.time?.created, from, to)).map(message => opaque(message.id)),
      start: Math.max(from, turn.start), end: Math.min(to, end), closedWithinInterval: closed && end < to,
      provenance: "history-reconstruction", coverage: hasIdle ? "complete" : "partial" })
    turn = undefined
  }
  for (const message of messages) {
    if (["user", "synthetic"].includes(message.type)) {
      if (!hasIdle) close(message.time.created, true)
      turn ??= { startMessageID: message.id, start: message.time.created, inputs: [], steps: [] }
      turn.inputs.push(message)
    }
    if (message.type === "assistant") turn?.steps.push(message)
    if (message.type === "idle") close(message.time.created, true)
  }
  close(to, false)
  return turns
}

export function reduceDiagnostics(data, { rootID, descendants = "all", exclude = [], from, to } = {}) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.sessions)) throw new Error("Formato de entrada no compatible.")
  if (!opaque(rootID) || exclude.some(id => !opaque(id)) || !finite(from) || !finite(to) || from >= to) throw new Error("Raíz o intervalo [from,to) no válido.")
  const selected = selectSessions(data.sessions, { rootID, descendants, exclude })
  const provenance = sourceOf(data.acquisition?.source)
  let duplicates = data.sessions.length - new Set(data.sessions.map(session => session.id)).size
  const sessions = selected.map(session => {
    if (!opaque(session.id)) throw new Error("Identificador de sesión no válido.")
    const messages = new Map()
    for (const message of session.messages ?? []) {
      if (!opaque(message.id) || !finite(message.time?.created)) throw new Error("Mensaje sin identidad o fecha verificable.")
      if (messages.has(message.id)) duplicates++
      messages.set(message.id, message)
    }
    const ordered = [...messages.values()].sort((a, b) => a.time.created - b.time.created || a.id.localeCompare(b.id))
    return { id: session.id, parentID: opaque(session.parentID), agent: opaque(session.agent),
      time: timeOf(session.time), turns: turnsOf(ordered, from, to),
      messages: ordered.filter(message => inRange(message.time.created, from, to)).map(message => ({
        id: message.id, type: messageTypes.includes(message.type) ? message.type : "unknown",
        agent: opaque(message.agent), time: timeOf(message.time),
        model: message.model ? { providerID: opaque(message.model.providerID), id: opaque(message.model.id) } : undefined,
      })) }
  })
  const operations = operationDiagnostics(selected, data.observations, from, to, provenance)
  const temporal = temporalDiagnostics(selected, operations.operations, data.observations, from, to, provenance)
  return { schemaVersion: 1, rootID, interval: { from, to, boundary: "[from,to)" },
    acquisition: { version: opaque(data.acquisition?.version), source: provenance,
      started: finite(data.acquisition?.started) ? data.acquisition.started : undefined,
      completed: finite(data.acquisition?.completed) ? data.acquisition.completed : undefined,
      pageSize: finite(data.acquisition?.pageSize) ? data.acquisition.pageSize : undefined,
      pages: metric(data.acquisition?.pages, "pages", finite(data.acquisition?.pages) ? "complete" : "unknown", provenance),
      duplicates: metric(duplicates + (finite(data.acquisition?.duplicates) ? data.acquisition.duplicates : 0), "records"), consistency: "non-atomic-read" },
    exclusions: exclude.map(opaque).filter(Boolean), sessions,
    relationships: { delegation: sessions.filter(session => session.parentID).map(session => ({ parentID: session.parentID, childID: session.id })), containment: operations.containment },
    operations: operations.operations, incidents: operations.incidents,
    timing: { metrics: temporal.metrics, queue: temporal.queue, waits: temporal.waits, deliveries: temporal.deliveries, firstEvents: temporal.firstEvents }, usage: temporal.usage,
    counts: { sessions: metric(sessions.length, "sessions"), messages: metric(sessions.reduce((sum, session) => sum + session.messages.length, 0), "messages"), ...operations.counts },
    limitations: ["projected-history-not-live-events", "native-internal-operations-not-observable", "native-first-provider-event-absent", "native-notification-and-integration-absent", "no-comparable-baseline"],
  }
}

export function formatDiagnostics(report, format = "json") {
  if (format === "json") return JSON.stringify(report, null, 2) + "\n"
  if (format !== "markdown") throw new Error("Formato de salida no válido.")
  return ["# Diagnóstico de ejecución", "", `Raíz: \`${report.rootID}\``,
    `Intervalo: [${report.interval.from}, ${report.interval.to}) ms Unix.`,
    `OpenCode: ${report.acquisition.version ?? "no determinado"}.`, "",
    "## Métricas", "", "| Métrica | Valor | Unidad | Cobertura | Procedencia |", "|---|---:|---|---|---|",
    ...Object.entries(report.counts).map(([name, item]) => `| ${name} | ${item.value ?? "no determinado"} | ${item.unit} | ${item.coverage} | ${item.provenance} |`),
    ...Object.entries(report.timing.metrics).map(([name, item]) => `| ${name} | ${item.value ?? "no determinado"} | ${item.unit} | ${item.coverage} | ${item.provenance} |`),
    ...Object.entries(report.usage.tokens).map(([name, item]) => `| tokens.${name} | ${item.value ?? "no determinado"} | ${item.unit} | ${item.coverage} | ${item.provenance} |`),
    ...["providerCost", "publisherArgumentCodeUnits"].map(name => {
      const item = report.usage[name]
      return `| ${name} | ${item.value ?? "no determinado"} | ${item.unit} | ${item.coverage} | ${item.provenance} |`
    }),
    ...report.usage.declarations.map(item => `| declarado.${item.name} (${item.sessionID}) | ${item.value} | ${item.unit} | ${item.coverage} | ${item.provenance} |`),
    "", "## Sesiones", "", ...report.sessions.map(session => `- \`${session.id}\`; padre: ${session.parentID ?? "—"}; ${session.messages.length} mensajes; ${session.turns.length} turnos reconstruidos.`),
    "", "## Incidentes", "", ...report.incidents.map(incident => `- \`${incident.id}\` (${incident.sessionID}): ${incident.category}; estado ${incident.status ?? "no determinado"}; ${incident.attempts} intentos correlacionados; ${incident.references.length} referencias; ${incident.provenance}.`),
    "", "## Reservas", "", ...report.limitations.map(item => `- ${item}`), ""].join("\n")
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    root: { type: "string" }, from: { type: "string" }, to: { type: "string" },
    descendants: { type: "string", default: "all" }, "audit-session": { type: "string" },
    "exclude-session": { type: "string", multiple: true, default: [] },
    server: { type: "string" }, input: { type: "string" }, format: { type: "string", default: "json" },
    "page-size": { type: "string", default: "200" }, help: { type: "boolean" },
  } })
  if (values.help) return "node scripts/session-diagnostics.mjs --root <id> --from <ms> --to <ms> --audit-session <id> [--descendants all|none|id,id] [--input <fixture.json>] [--server <url>] [--format json|markdown]\n"
  if (!values["audit-session"] || !opaque(values["audit-session"])) throw new Error("Indica la sesión de auditoría separada mediante --audit-session.")
  const options = { rootID: values.root, from: Number(values.from), to: Number(values.to),
    descendants: ["all", "none"].includes(values.descendants) ? values.descendants : values.descendants.split(","),
    exclude: [...new Set([...values["exclude-session"], values["audit-session"]])] }
  // Validate the selection before contacting a server. stdout contains only the sanitized report.
  if (!opaque(options.rootID) || !finite(options.from) || !finite(options.to) || options.from >= options.to || options.exclude.includes(options.rootID)
    || options.exclude.some(id => !opaque(id)) || (Array.isArray(options.descendants) && options.descendants.some(id => !opaque(id)))
    || !["json", "markdown"].includes(values.format))
    throw new Error("Raíz, auditoría o intervalo no válidos.")
  const data = values.input ? JSON.parse(await readFile(values.input, "utf8"))
    : await acquireSessions(apiReader({ server: values.server }), { ...options, pageSize: Number(values["page-size"]) })
  return formatDiagnostics(reduceDiagnostics(data, options), values.format)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(await main()) }
  catch { console.error("Diagnóstico no disponible: comprueba argumentos (--help), archivo, contrato V2 y conexión/autorización con la CLI. No se exportan errores crudos."); process.exitCode = 1 }
}
