import { createHash, randomUUID } from "node:crypto"
import type { Artifact, Resolver, Work } from "./session_store.ts"
import type { WorkRequest } from "./work_contract.ts"

export type NativeMessage = { id: string; type: string; text?: string; agent?: string; finish?: string;
  completed?: number; active?: boolean }
type Receipt = { sessionID: string; messageID: string; source: "declaracion_coordinador"; efecto: string; siguiente_accion: string }
export type Execution = { id: string; sessionID: string; preparationMessageID: string;
  confirmation: Receipt; inputMessageID?: string; startMessageID?: string;
  state: "en_cola" | "en_curso" | "resultado_disponible" | "integrado" | "impedimento_concreto";
  result?: { messageID: string; sha256: string; artifactID?: string; manifestHash?: string };
  integration?: Receipt; impediment?: Receipt & { motivo: string };
  provenance: "mensajes_nativos" }
export type Closure = { estado: "completo" | "parcial"; cobertura: "registrada" | "limitada";
  dependencias: { encargo_id: string; ejecucion_id?: string; estado: string; resultado_hash?: string }[];
  proposito?: string; efecto?: string; siguiente_accion?: string }
const digest = (text: string) => createHash("sha256").update(text).digest("hex")
async function messages(get: Resolver, id: string) {
  if (!get.messages) throw new Error("Fronteras de mensajes nativos no disponibles")
  return get.messages(id)
}
function boundary(list: NativeMessage[], id: string) {
  const index = list.findIndex(m => m.id === id)
  if (index < 0) throw new Error("Mensaje nativo no verificable")
  return list.slice(0, index + 1).findLast(m => m.type === "user")
}
function inactive(list: NativeMessage[]) {
  const user = list.findLastIndex(m => m.type === "user")
  const idle = list.findLastIndex(m => m.type === "idle")
  const activity = list.findLastIndex(m => ["user", "assistant", "synthetic"].includes(m.type))
  return idle > activity && !list.slice(user + 1).some(m => m.active)
}
function resultHash(execution: Execution, result: NativeMessage, artifactID?: string, manifestHash?: string) {
  return digest(JSON.stringify([execution.sessionID, execution.inputMessageID, result.id, result.text,
    artifactID ?? null, manifestHash ?? null]))
}
function verifyResult(execution: Execution, list: NativeMessage[]) {
  const receipt = execution.result
  const result = list.find(m => m.id === receipt?.messageID)
  if (!receipt || !result || result.type !== "assistant" || !result.completed || result.finish !== "stop" ||
      boundary(list, result.id)?.id !== execution.inputMessageID ||
      resultHash(execution, result, receipt.artifactID, receipt.manifestHash) !== receipt.sha256)
    throw new Error("Resultado exacto registrado distinto de los mensajes nativos")
}

export function workMessages(work: Work, list: NativeMessage[], canPrepare: boolean) {
  const executions = work.executions ?? []
  const preparationIDs = new Set(executions.map(e => e.preparationMessageID))
  const inputIDs = new Set(executions.flatMap(e => e.inputMessageID ? [e.inputMessageID] : []))
  const lastUser = list.findLast(m => m.type === "user")?.id
  return list.filter(message => {
    if (message.type !== "assistant" || !message.text || !message.completed || message.finish !== "stop") return false
    if (preparationIDs.has(message.id) || inputIDs.has(boundary(list, message.id)?.id ?? "")) return true
    // Before confirmation only the direct owner can inspect the current matching preparation.
    // Shared session/root and textual similarity never grant access to other completed work.
    return canPrepare && inactive(list) && boundary(list, message.id)?.id === lastUser &&
      message.text.includes("PENDIENTE_CONFIRMACION") && [work.pregunta, work.corpus, work.referencia].every(value => message.text!.includes(value))
  }).map(message => ({ id: message.id, texto: message.text!, final: true }))
}

export async function changeExecution(work: Work, input: WorkRequest,
  actor: { sessionID: string; messageID?: string }, get: Resolver, artifact?: Artifact) {
  const owner = actor.sessionID === work.ownerSessionID
  if (!actor.messageID) throw new Error("La transición requiere un mensaje de autor real")
  const receipt = (efecto: string, siguiente_accion: string): Receipt => ({ sessionID: actor.sessionID,
    messageID: actor.messageID!, source: "declaracion_coordinador", efecto, siguiente_accion })
  work.executions ??= []
  if (input.action === "confirm") {
    if (!owner) throw new Error("Solo el coordinador propietario confirma")
    if (input.pregunta !== work.pregunta || input.corpus !== work.corpus || input.referencia !== work.referencia)
      throw new Error("Confirmación de otra pregunta/corpus/referencia")
    const list = await messages(get, work.responsibleSessionID)
    const preparation = list.find(m => m.id === input.preparacion_message_id)
    if (!preparation || preparation.type !== "assistant" || preparation.agent !== work.agents[work.responsibleSessionID] ||
        !preparation.completed || preparation.finish !== "stop" || !preparation.text?.includes("PENDIENTE_CONFIRMACION") ||
        ![work.pregunta, work.corpus, work.referencia].every(value => preparation.text!.includes(value)))
      throw new Error("Preparación nativa no verificable para pregunta/corpus/referencia")
    const previous = work.executions.find(e => e.sessionID === work.responsibleSessionID && e.preparationMessageID === preparation.id)
    if (previous) {
      if (previous !== work.executions.at(-1)) throw new Error("Confirmación tardía de otra ejecución")
      return previous
    }
    if (work.executions.some(e => ["en_cola", "en_curso", "resultado_disponible"].includes(e.state)))
      throw new Error("Ejecución anterior todavía abierta")
    const last = list.findLast(m => m.type === "user")
    if (!last || boundary(list, preparation.id)?.id !== last.id || !inactive(list)) throw new Error("Preparación tardía o sesión activa")
    // The ID is local. Only actual message IDs are native evidence; no turnID/executionID is invented.
    const execution: Execution = { id: `exec-${randomUUID()}`, sessionID: work.responsibleSessionID,
      preparationMessageID: preparation.id, confirmation: receipt("Pregunta/corpus/referencia contrastados", "Enviar CONFIRMAR a la misma sesión"),
      state: "en_cola", provenance: "mensajes_nativos" }
    work.executions.push(execution)
    return execution
  }
  if (!["start", "result", "integrate", "block"].includes(input.action)) throw new Error("Transición no admitida")
  const request = input as Extract<WorkRequest, { ejecucion_id: string }>
  const execution = work.executions.find(e => e.id === request.ejecucion_id)
  if (!execution) throw new Error("Ejecución local no registrada en este encargo")
  if (execution !== work.executions.at(-1) || execution.sessionID !== work.responsibleSessionID)
    throw new Error("Notificación tardía: ejecución sustituida")
  const list = await messages(get, execution.sessionID)
  if (input.action === "start") {
    if (actor.sessionID !== execution.sessionID) throw new Error("Solo el responsable inicia su ejecución")
    const user = boundary(list, actor.messageID)
    if (!user?.text?.includes("CONFIRMAR") || !user.text.includes(work.id) || !user.text.includes(execution.id) ||
        list.findIndex(m => m.id === user.id) <= list.findIndex(m => m.id === execution.preparationMessageID))
      throw new Error("Continuación sin CONFIRMAR y vínculo nativo al encargo/ejecución")
    if (execution.inputMessageID && execution.inputMessageID !== user.id) throw new Error("Otra continuación no es la misma ejecución")
    if (execution.inputMessageID) return execution
    if (execution.state !== "en_cola") throw new Error("Transición de inicio inválida")
    execution.inputMessageID = user.id
    execution.startMessageID = actor.messageID
    execution.state = "en_curso"
  } else {
    if (!owner) throw new Error("Solo el coordinador propietario recibe, integra o declara impedimento")
    if (input.action === "block") {
      if (!inactive(list) || ["resultado_disponible", "integrado"].includes(execution.state)) throw new Error("No se cierra una ejecución activa o con resultado como impedimento")
      const expected = execution.inputMessageID ?? boundary(list, execution.preparationMessageID)?.id
      if (list.findLast(m => m.type === "user")?.id !== expected) throw new Error("Impedimento de otra continuación nativa")
      const impediment = { ...receipt(input.efecto, input.siguiente_accion), motivo: input.motivo }
      if (execution.impediment && JSON.stringify(execution.impediment) !== JSON.stringify(impediment)) throw new Error("Impedimento ya registrado")
      execution.impediment = impediment
      execution.state = "impedimento_concreto"
    } else {
      if (!execution.inputMessageID || list.findLast(m => m.type === "user")?.id !== execution.inputMessageID)
        throw new Error("Resultado tardío o continuación nativa distinta")
      if (!inactive(list)) throw new Error("La ejecución nativa sigue activa")
      if (input.action === "result") {
        const result = list.find(m => m.id === input.resultado_message_id)
        if (!result || result.type !== "assistant" || result.agent !== work.agents[execution.sessionID] ||
            !result.completed || result.finish !== "stop" || !result.text?.trim() || result.text.includes("PENDIENTE_CONFIRMACION") ||
            boundary(list, result.id)?.id !== execution.inputMessageID)
          throw new Error("Resultado nativo no final, preparación o mensaje de otra ejecución")
        if (artifact && (artifact.producerSessionID !== execution.sessionID || !artifact.producerMessageID ||
            boundary(list, artifact.producerMessageID)?.id !== execution.inputMessageID)) throw new Error("Artefacto de otra ejecución")
        const value = { messageID: result.id, sha256: resultHash(execution, result, artifact?.id, artifact?.manifestHash),
          ...(artifact ? { artifactID: artifact.id, manifestHash: artifact.manifestHash } : {}) }
        if (execution.result) {
          if (JSON.stringify(execution.result) !== JSON.stringify(value)) throw new Error("Resultado duplicado con identidad distinta")
          return execution
        }
        if (execution.state !== "en_curso") throw new Error("Transición de resultado inválida")
        execution.result = value
        execution.state = "resultado_disponible"
      } else if (input.action === "integrate") {
        if (!execution.result || execution.result.sha256 !== input.resultado_hash) throw new Error("Recibo de otro resultado exacto")
        verifyResult(execution, list)
        if (execution.integration) {
          if (execution.integration.efecto !== input.efecto || execution.integration.siguiente_accion !== input.siguiente_accion)
            throw new Error("Integración duplicada con contenido distinto")
          return execution
        }
        execution.integration = receipt(input.efecto, input.siguiente_accion)
        execution.state = "integrado"
      }
    }
  }
  return execution
}

export async function checkWorkClosure(work: Work, all: Work[], get: Resolver, partial?:
  { proposito: string; efecto: string; siguiente_accion: string }): Promise<Closure> {
  const descendants = (parent: Work): Work[] => all.filter(w => w.parentID === parent.id).flatMap(w => [w, ...descendants(w)])
  const required = descendants(work).filter(w => w.required === true || w.required !== false && !!w.executions?.length)
  const dependencias: Closure["dependencias"] = []
  for (const child of required) {
    const execution = child.executions?.at(-1)
    let state = execution?.state ?? "sin_confirmar"
    if (execution) {
      const list = await messages(get, child.responsibleSessionID)
      if (execution.sessionID !== child.responsibleSessionID) state = "sin_confirmar"
      else if (!inactive(list)) state = "en_curso"
      else if (execution.inputMessageID && list.findLast(m => m.type === "user")?.id !== execution.inputMessageID)
        state = "sin_confirmar"
      if (state === "integrado") verifyResult(execution, list)
    }
    dependencias.push({ encargo_id: child.id, ...(execution ? { ejecucion_id: execution.id } : {}), estado: state,
      ...(execution?.result ? { resultado_hash: execution.result.sha256 } : {}) })
  }
  if (!partial && dependencias.some(d => !["integrado", "impedimento_concreto"].includes(d.estado)))
    throw new Error("Cierre completo bloqueado: trabajos requeridos activos, sin confirmar o sin integrar; usa parcial explícito con propósito, efecto y siguiente acción")
  return { estado: partial ? "parcial" : "completo", cobertura: required.length ? "registrada" : "limitada", dependencias, ...partial }
}
