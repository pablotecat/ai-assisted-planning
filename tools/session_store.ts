import { createHash, randomUUID } from "node:crypto"
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { hostname } from "node:os"
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path"
import { readAgentSettings, sessionRoot, type AgentName } from "./agent_settings.ts"

export type Identity = { id: string; parentID?: string; agent: string; title: string; created: number; directory: string }
export type Resolver = (id: string, messageID?: string) => Promise<Identity>

const agentNames: Record<string, AgentName> = {
  arquitecto: "arquitecto",
  "arquitecto-test": "arquitecto-test",
  planificador: "planificador", refinador: "refinador",
  investigador: "investigador", "lector-codigo": "lector-codigo", "lector-documentacion": "lector-documentacion",
  revisor: "revisor",
}
const childOf: Record<AgentName, AgentName[]> = {
  arquitecto: [],
  "arquitecto-test": ["arquitecto"],
  planificador: [], refinador: ["planificador"], investigador: ["refinador"],
  "lector-codigo": ["investigador"], "lector-documentacion": ["investigador", "lector-documentacion"],
  revisor: Object.values(agentNames).filter((name) => name !== "revisor"),
}
type Entry = { parent?: string; agent: AgentName; folder: string }
export type ManifestFile = { path: string; sha256: string; bytes: number }
export type Artifact = {
  id: string; rootSessionID: string; producerSessionID: string; agent: string; type: string;
  files: ManifestFile[]; manifestHash: string; deliveries: string[]; directory?: string;
  previous?: string; origin: { type: "literal"; delivery?: string }
}
type Saved = { guardado: true; rutas: Record<string, string>; sesion: string;
  artefacto_id: string; hash_manifiesto: string; operacion_id: string }
type Operation = {
  id: string; logicalID: string; type: string; producerSessionID: string; agent: string; digest: string;
  phase: "prepared" | "materialized" | "confirmed"; artifact: Artifact;
  paths: Record<string, string>; stage: string; directoryIdentity?: { dev: string; ino: string };
  sources: string[]; decisions: string[]; keys: string[]; result?: Saved
}
type State = { root: string; entries: Record<string, Entry>; deliveries: string[]; sources: string[];
  decisions: string[]; keys: string[]; schemaVersion: 1;
  artifacts: Record<string, Artifact>; operations: Record<string, Operation> }
type Options = { get: Resolver; root?: string; settingsPath?: string;
  // Internal fault seam, never exposed in a tool's schema.
  checkpoint?: (phase: string) => void | Promise<void> }

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const portable = (path: string) => path.replace(/\\/g, "/")

export function manifest(files: Record<string, string | Uint8Array>) {
  const entries = Object.keys(files).sort().map(path => ({ path, sha256: hash(files[path]),
    bytes: Buffer.byteLength(files[path]) }))
  return { files: entries, hash: hash(JSON.stringify(entries)) }
}

export function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/g, "") || "consulta"
}
function safeName(name: string) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_.-]*\.md$/u.test(name) || name.includes("..") || basename(name) !== name)
    throw new Error("Nombre de archivo no permitido")
  return name
}
async function directory(path: string) {
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Carpeta de sesión no segura")
}
async function checkExistingAncestors(path: string) {
  let current = resolve(path)
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error("Ruta de sesiones enlazada fuera de la ubicación prevista")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const parent = resolve(current, "..")
    if (parent === current) break
    current = parent
  }
}
function within(root: string, path: string) {
  const rel = relative(root, path)
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Carpeta asignada fuera de la sesión")
}
function rootName(created: number, agent: AgentName, title: string) {
  const date = new Date(created)
  if (!Number.isFinite(date.getTime())) throw new Error("Fecha de sesión inválida")
  const stamp = date.toISOString().slice(0, 16).replace("T", "_").replace(":", "")
  const kind = agent === "planificador" ? "planificacion" : agent === "arquitecto" ? "arquitectura" : "consulta"
  return `${stamp}__${kind}__${slug(title)}`
}
async function chain(id: string, messageID: string | undefined, get: Resolver) {
  if (typeof get !== "function") throw new Error("Adaptador de sesión no disponible")
  const nodes: Identity[] = []
  const visited = new Set<string>()
  for (let current: string | undefined = id; current; ) {
    if (visited.has(current) || nodes.length > 12) throw new Error("Delegación cíclica o demasiado profunda")
    visited.add(current)
    const node = await get(current, current === id ? messageID : undefined)
    if (node.id !== current) throw new Error("No se pudo verificar la sesión")
    // An externally invoked specialist starts a new managed encargo at the first known agent.
    if (!agentNames[node.agent] && nodes.length) break
    if (!agentNames[node.agent]) throw new Error("No se pudo verificar el agente")
    if (nodes.length && nodes[0].directory !== node.directory) throw new Error("Proyecto de sesión distinto")
    nodes.push(node)
    current = node.parentID
  }
  nodes.reverse()
  if (nodes[0].agent === "arquitecto-test") throw new Error("Test requiere delegación de arquitecto")
  for (let i = 1; i < nodes.length; i++) {
    if (!childOf[agentNames[nodes[i].agent]].includes(agentNames[nodes[i - 1].agent]))
      throw new Error("Delegación no autorizada")
  }
  return nodes
}

type LockOwner = { pid: number; host: string; token: string }
async function lockOwner(path: string): Promise<LockOwner> {
  await directory(path)
  const file = join(path, "owner.json")
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Propietario de bloqueo no verificable")
  const owner = JSON.parse(await readFile(file, "utf8"))
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.host !== "string" ||
      !/^[a-f0-9-]{36}$/.test(owner.token)) throw new Error("Propietario de bloqueo no verificable")
  return owner
}
function demonstrablyDead(owner: LockOwner) {
  if (owner.host !== hostname()) return false
  try { process.kill(owner.pid, 0); return false } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH"
  }
}
async function locked<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const owner: LockOwner = { pid: process.pid, host: hostname(), token: randomUUID() }
  let acquired = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(path)
      try { await writeFile(join(path, "owner.json"), JSON.stringify(owner), { flag: "wx" }) }
      catch (error) { await rm(path, { recursive: true, force: true }); throw error }
      acquired = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const previous = await lockOwner(path).catch(() => undefined)
      if (previous && demonstrablyDead(previous)) {
        // The claim travels with the abandoned directory. Only one reaper can move it;
        // a delayed contender must recheck the token before touching a newer lock.
        try {
          await writeFile(join(path, "recovery.json"), JSON.stringify(owner), { flag: "wx" })
          const current = await lockOwner(path)
          if (current.token === previous.token && demonstrablyDead(current))
            await rename(path, `${path}.abandoned-${previous.token}`)
        } catch (error) {
          if (!["EEXIST", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
        }
      }
      await new Promise((done) => setTimeout(done, 50))
    }
  }
  if (!acquired) throw new Error("Bloqueo ocupado o no verificable: no se pudo demostrar que su propietario dejó de estar activo; no se retira por antigüedad")
  try { return await fn() } finally {
    if ((await lockOwner(path)).token !== owner.token) throw new Error("Propietario de bloqueo cambiado")
    await rm(path, { recursive: true, force: true })
  }
}

function folderFor(state: State, nodes: Identity[], index: number) {
  const node = nodes[index]
  const existing = state.entries[node.id]
  if (existing) {
    if (existing.parent !== node.parentID || existing.agent !== agentNames[node.agent]) throw new Error("Propietario de carpeta diferente")
    return existing.folder
  }
  const parent = index ? state.entries[nodes[index - 1].id].folder : ""
  const count = Object.values(state.entries).filter((entry) => entry.parent === node.parentID).length + 1
  const label = `${String(count).padStart(2, "0")}-${agentNames[node.agent]}${index ? `__${slug(node.title)}` : ""}`
  const folder = parent ? join(parent, label) : label
  state.entries[node.id] = { parent: node.parentID, agent: agentNames[node.agent], folder }
  return folder
}

async function saveJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx" })
    await replaceFile(temp, path)
  } finally { await rm(temp, { force: true }) }
}
async function replaceFile(source: string, destination: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error
        return undefined
      })
      if (existing && !existing.isFile()) throw new Error("Destino no es un archivo regular")
      await rename(source, destination)
      return
    } catch (error) {
      if (!(["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) || attempt === 4) throw error
      await new Promise((done) => setTimeout(done, 20 * (attempt + 1)))
    }
  }
}

async function loadState(stateDir: string): Promise<State> {
  const path = join(stateDir, "state.json")
  if ((await lstat(path)).isSymbolicLink()) throw new Error("Estado de sesión enlazado")
  const raw = await readFile(path)
  const state = JSON.parse(raw.toString("utf8"))
  if (state.schemaVersion !== undefined && state.schemaVersion !== 1)
    throw new Error(`Versión de control no soportada: ${state.schemaVersion}; conserva el control y usa una versión compatible`)
  if (state.schemaVersion === undefined) {
    const backup = join(stateDir, "state.v0.json")
    try { await writeFile(backup, raw, { flag: "wx" }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if ((await lstat(backup)).isSymbolicLink() || !(await readFile(backup)).equals(raw))
        throw new Error("La copia del control anterior no coincide; requiere recuperación manual")
    }
  }
  if (typeof state.root !== "string" || basename(state.root) !== state.root || ["", ".", ".."].includes(state.root) ||
      !state.entries || !Array.isArray(state.deliveries)) throw new Error("Raíz de sesión inválida")
  return { ...state, schemaVersion: 1, sources: state.sources ?? [], decisions: state.decisions ?? [], keys: state.keys ?? [],
    artifacts: state.artifacts ?? {}, operations: state.operations ?? {} }
}

async function sessionDirectory(root: string, state: State) {
  const path = join(root, state.root)
  within(root, path)
  await checkExistingAncestors(path)
  await directory(path)
  return path
}

async function checkedFile(root: string, path: string) {
  within(root, path)
  await checkExistingAncestors(path)
  const stat = await lstat(path, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Archivo de publicación no seguro")
  return stat
}

// Verification never silently recomputes the registered identity after an external edit.
async function verifyArtifact(sessionDir: string, artifact: Artifact, state: State, pending?: Artifact) {
  for (const file of artifact.files) {
    const path = join(sessionDir, file.path)
    await checkedFile(sessionDir, path)
    if (hash(await readFile(path)) !== file.sha256) throw new Error("Contenido del artefacto modificado externamente")
  }
  if (artifact.directory) {
    const folder = join(sessionDir, artifact.directory)
    await checkExistingAncestors(folder)
    await directory(folder)
    const registered = new Set(artifact.files.map(file => basename(file.path)))
    // Only confirmed review records may add files to a producer's directory.
    for (const review of Object.values(state.artifacts))
      if (review.origin.delivery === artifact.directory)
        for (const file of review.files) registered.add(basename(file.path))
    const actual = await readdir(folder)
    const allowed = new Set(registered)
    if (pending?.origin.delivery === artifact.directory) for (const file of pending.files) allowed.add(basename(file.path))
    if ([...registered].some(name => !actual.includes(name)) || actual.some(name => !allowed.has(name)))
      throw new Error("Archivos no registrados en la entrega")
  }
}

async function projectIndex(state: State, sessionDir: string, stateDir: string, topic: string, options: Options) {
  const index = ["# Encargo", "", `**Tema:** ${topic.replace(/[\r\n]+/g, " ")}`, `**Claves:** ${state.keys.join(", ") || "No indicadas"}`,
    "**Estado:** entregables publicados", "", "## Fuentes consultadas", ...state.sources.map(s => `- ${s}`),
    "", "## Decisiones relevantes", ...state.decisions.map(d => `- ${d}`),
    "", "## Entregas", ...state.deliveries.map(d => `- [${d}](./${d})`), ""].join("\n")
  await options.checkpoint?.("index")
  const path = join(sessionDir, "indice.md")
  await checkExistingAncestors(path)
  const temp = join(stateDir, `indice-${randomUUID()}.tmp`)
  try { await writeFile(temp, index, { flag: "wx" }); await replaceFile(temp, path) }
  finally { await rm(temp, { force: true }) }
}

function operationKey(sessionID: string, type: string, logicalID: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(logicalID))
    throw new Error("Identidad lógica de operación no válida")
  return hash(JSON.stringify([sessionID, type, logicalID]))
}

type Request = { sessionID: string; operationID: string; type: string; agent: string; topic: string;
  files: Record<string, string>; sources?: string[]; decisions?: string[]; keys?: string[]; group?: string; delivery?: string }
function requestDigest(input: Request) {
  return hash(JSON.stringify({ type: input.type, topic: input.topic, group: input.group ?? null, delivery: input.delivery ?? null,
    files: Object.keys(input.files).sort().map(name => [name, input.files[name]]),
    sources: input.sources ?? [], decisions: input.decisions ?? [], keys: input.keys ?? [] }))
}

async function prepare(state: State, stateDir: string, sessionDir: string, nodes: Identity[], input: Request, key: string,
  paths: Record<string, string>, deliveries: string[], targetDirectory?: string) {
  const id = randomUUID()
  const stage = join(stateDir, id)
  await mkdir(stage)
  const content = Object.fromEntries(Object.entries(paths).map(([name, path]) => [portable(relative(sessionDir, path)), input.files[name]]))
  const identity = manifest(content)
  const previous = Object.values(state.artifacts).findLast(a => a.producerSessionID === input.sessionID && a.type === input.type)
  const artifact: Artifact = { id: randomUUID(), rootSessionID: nodes[0].id, producerSessionID: input.sessionID,
    agent: input.agent, type: input.type, files: identity.files, manifestHash: identity.hash, deliveries,
    ...(targetDirectory ? { directory: portable(relative(sessionDir, targetDirectory)) } : {}),
    ...(previous ? { previous: previous.id } : {}), origin: { type: "literal", ...(input.delivery ? { delivery: input.delivery } : {}) } }
  const operation: Operation = { id, logicalID: input.operationID, type: input.type, producerSessionID: input.sessionID,
    agent: input.agent, digest: requestDigest(input), phase: "prepared", artifact, paths, stage: id,
    sources: input.sources ?? [], decisions: input.decisions ?? [], keys: input.keys ?? [] }
  for (const [name, content] of Object.entries(input.files)) await writeFile(join(stage, name), content, { flag: "wx" })
  state.operations[key] = operation
  await saveJson(join(stateDir, "state.json"), state)
  return operation
}

async function materialize(state: State, operation: Operation, stateDir: string, sessionDir: string, options: Options) {
  if (operation.stage !== operation.id || !/^[a-f0-9-]{36}$/.test(operation.id)) throw new Error("Preparación no verificable")
  const stage = join(stateDir, operation.stage)
  await checkExistingAncestors(stage)
  await directory(stage)
  for (const [name, path] of Object.entries(operation.paths)) {
    safeName(name)
    const file = operation.artifact.files.find(file => file.path === portable(relative(sessionDir, path)))
    await checkedFile(stateDir, join(stage, name))
    if (!file || hash(await readFile(join(stage, name))) !== file.sha256) throw new Error("Preparación alterada")
    within(sessionDir, path)
    await checkExistingAncestors(path)
  }
  if (operation.artifact.directory) {
    const target = join(sessionDir, operation.artifact.directory)
    const existing = await lstat(target, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return undefined
    })
    if (existing) {
      if (existing.ino === 0n || existing.dev.toString() !== operation.directoryIdentity?.dev || existing.ino.toString() !== operation.directoryIdentity.ino)
        throw new Error("Destino reservado ajeno; no se adopta ni sobrescribe")
    } else {
      if (operation.directoryIdentity) throw new Error("Carpeta materializada desaparecida; recuperación manual requerida")
      await mkdir(target)
      await options.checkpoint?.("directory-created")
      const { dev, ino } = await lstat(target, { bigint: true })
      if (ino === 0n) throw new Error("Identidad de carpeta no verificable en este filesystem")
      operation.directoryIdentity = { dev: dev.toString(), ino: ino.toString() }
      await saveJson(join(stateDir, "state.json"), state)
    }
  }
  for (const [name, path] of Object.entries(operation.paths)) {
    try { await link(join(stage, name), path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const source = await lstat(join(stage, name), { bigint: true })
      const target = await checkedFile(sessionDir, path)
      if (source.ino === 0n || target.dev !== source.dev || target.ino !== source.ino) throw new Error("Destino reservado ajeno; no se adopta ni sobrescribe")
    }
    await options.checkpoint?.(`file:${name}`)
  }
  // Includes inventory verification before confirmation, not merely byte equality.
  await verifyArtifact(sessionDir, operation.artifact, { artifacts: {} } as State)
}

async function commit(state: State, stateDir: string, sessionDir: string, operation: Operation, options: Options): Promise<Saved> {
  if (operation.phase !== "confirmed") {
    await options.checkpoint?.("prepared")
    await materialize(state, operation, stateDir, sessionDir, options)
    operation.phase = "materialized"
    await saveJson(join(stateDir, "state.json"), state)
    await options.checkpoint?.("materialized")
    for (const delivery of operation.artifact.deliveries) if (!state.deliveries.includes(delivery)) state.deliveries.push(delivery)
    for (const field of ["sources", "decisions", "keys"] as const) for (const item of operation[field]) {
      const text = item.replace(/[\r\n]+/g, " ").trim().slice(0, 300)
      if (text && !state[field].includes(text)) state[field].push(text)
    }
    operation.result = { guardado: true, rutas: operation.paths, sesion: sessionDir,
      artefacto_id: operation.artifact.id, hash_manifiesto: operation.artifact.manifestHash,
      operacion_id: operation.logicalID }
    state.artifacts[operation.artifact.id] = operation.artifact
    operation.phase = "confirmed"
    await saveJson(join(stateDir, "state.json"), state)
    await options.checkpoint?.("confirmed")
  }
  await verifyArtifact(sessionDir, operation.artifact, state)
  return operation.result!
}

async function finish(state: State, stateDir: string, sessionDir: string, operation: Operation, topic: string, options: Options): Promise<Publication> {
  const result = await commit(state, stateDir, sessionDir, operation, options)
  try { await projectIndex(state, sessionDir, stateDir, topic, options) }
  catch { return { ...result, indice: { actualizado: false, aviso: "Publicación confirmada; índice pendiente de reparación. Reintenta con la misma operacion_id y petición." } } }
  return result
}

export type Publication = { guardado: false } | (Saved & { indice?: { actualizado: false; aviso: string } })

// This contract has no model-supplied directory: only a trusted harness resolver assigns ownership.
export async function publishSession(input: {
  sessionID: string; messageID?: string; agent: string; topic: string;
  files: Record<string, string>; group?: string; sources?: string[]; decisions?: string[]; keys?: string[];
  operationID?: string; publicationType?: string
}, options: Options): Promise<Publication> {
  const names = Object.keys(input.files)
  if (!names.length || names.some((name) => !input.files[name]?.trim())) throw new Error("Entregables vacíos")
  names.forEach(safeName)
  if (input.group && input.group !== "Originales" && !/^[a-z][a-z0-9-]*$/.test(input.group)) throw new Error("Grupo no permitido")
  if (input.group === "Originales" && input.agent !== "planificador") throw new Error("Solo el planificador puede publicar originales")
  const nodes = await chain(input.sessionID, input.messageID, options.get)
  if (nodes.at(-1)!.agent !== input.agent) throw new Error("Autor de publicación diferente")
  const request: Request = { ...input, operationID: input.operationID ?? randomUUID(),
    type: input.publicationType ?? `session:${input.agent}:${input.group ?? "file"}` }
  const key = operationKey(input.sessionID, request.type, request.operationID)
  const settings = await readAgentSettings(options.settingsPath)
  if (!settings.agentes[agentNames[input.agent]].guardarEntregablesEnSesion) return { guardado: false }
  if (input.agent === "lector-codigo" && !settings.agentes.investigador.especialistasPermitidos.includes("lector-codigo") && nodes.length > 1)
    throw new Error("Especialista deshabilitado")
  if (input.agent === "lector-documentacion" && !settings.agentes.investigador.especialistasPermitidos.includes("lector-documentacion") && nodes.some((n) => n.agent === "investigador"))
    throw new Error("Especialista deshabilitado")

  const root = options.root ?? sessionRoot(settings)
  await checkExistingAncestors(root)
  await mkdir(root, { recursive: true })
  await directory(root)
  if ((await realpath(root)).toLowerCase() !== resolve(root).toLowerCase()) throw new Error("Ruta de sesiones enlazada fuera de la ubicación prevista")
  const control = join(root, ".control")
  await mkdir(control, { recursive: true })
  await directory(control)
  const id = createHash("sha256").update(nodes[0].directory + "\0" + nodes[0].id).digest("hex")
  const stateDir = join(control, id)
  await mkdir(stateDir, { recursive: true })
  await directory(stateDir)
  return locked(join(stateDir, ".lock"), async () => {
    const stateFile = join(stateDir, "state.json")
    let state: State
    try {
      state = await loadState(stateDir)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      let rootFolder = rootName(nodes[0].created, agentNames[nodes[0].agent], nodes[0].title || input.topic)
      for (let n = 1; ; n++) {
        try { await mkdir(join(root, rootFolder)); break }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
          rootFolder = `${rootName(nodes[0].created, agentNames[nodes[0].agent], nodes[0].title || input.topic)}-${String(n + 1).padStart(2, "0")}`
        }
      }
      state = { root: rootFolder, entries: {}, deliveries: [], sources: [], decisions: [], keys: [], schemaVersion: 1, artifacts: {}, operations: {} }
      await saveJson(stateFile, state)
    }
    const sessionDir = await sessionDirectory(root, state)
    for (const node of nodes) {
      const entry = state.entries[node.id]
      if (entry && (entry.parent !== node.parentID || entry.agent !== agentNames[node.agent]))
        throw new Error("Propietario de carpeta diferente")
    }
    const existing = state.operations[key]
    if (existing) {
      if (existing.digest !== requestDigest(request)) throw new Error("Identidad de operación reutilizada con contenido distinto")
      return finish(state, stateDir, sessionDir, existing, nodes[0].title || input.topic, options)
    }
    // A different operation cannot step over an interrupted reservation.
    if (Object.values(state.operations).some(operation => operation.phase !== "confirmed"))
      throw new Error("Publicación interrumpida pendiente; recupera la misma operacion_id antes de iniciar otra")
    for (let i = 0; i < nodes.length; i++) {
      const folder = folderFor(state, nodes, i)
      within(sessionDir, join(sessionDir, folder))
      await checkExistingAncestors(join(sessionDir, folder))
      await mkdir(join(sessionDir, folder), { recursive: true })
      await directory(join(sessionDir, folder))
    }
    const owner = join(sessionDir, state.entries[input.sessionID].folder)
    const relativeOwner = state.entries[input.sessionID].folder.replace(/\\/g, "/")
    const groupNumber = state.deliveries.filter((d) => d.startsWith(`${relativeOwner}/${input.group}`)).length + 1
    if (input.group === "Originales" && groupNumber !== 1) throw new Error("Los originales de este encargo ya están publicados")
    const target = input.group ? join(owner, `${input.group}${groupNumber === 1 ? "" : `-${String(groupNumber).padStart(2, "0")}`}`) : owner
    const paths: Record<string, string> = {}
    if (input.group) for (const name of names) paths[name] = join(target, name)
    else {
      const count = state.deliveries.filter(d => d.startsWith(`${relativeOwner}/`)).length
      names.forEach((name, index) => { paths[name] = join(owner, `${String(count + index + 1).padStart(2, "0")}-${name}`) })
    }
    // Reject occupied destinations before preparing a descriptor; never adopt equal bytes.
    for (const path of input.group ? [target] : Object.values(paths)) {
      try { await lstat(path); throw Object.assign(new Error("La entrega ya existe"), { code: "EEXIST" }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    const deliveries = (input.group ? [target] : Object.values(paths)).map(path => portable(relative(sessionDir, path)))
    const operation = await prepare(state, stateDir, sessionDir, nodes, request, key, paths, deliveries, input.group ? target : undefined)
    return finish(state, stateDir, sessionDir, operation, nodes[0].title || input.topic, options)
  })
}

// Append reviewer-authored reports to an existing, indexed delivery of its direct parent.
export async function publishReview(input: {
  sessionID: string; messageID?: string; delivery: string; sanity?: string; dispute?: string; operationID?: string
}, options: Options): Promise<Publication> {
  if (!input.sanity?.trim() && !input.dispute?.trim()) throw new Error("Documento de revisión vacío")
  const nodes = await chain(input.sessionID, input.messageID, options.get)
  const reviewer = nodes.at(-1)!
  const producer = nodes.at(-2)
  if (reviewer.agent !== "revisor" || !producer) throw new Error("Revisor delegado por un productor requerido")
  const logicalID = input.operationID ?? randomUUID()
  const key = operationKey(input.sessionID, "write_review_documents", logicalID)
  const settings = await readAgentSettings(options.settingsPath)
  if (!settings.agentes.revisor.guardarEntregablesEnSesion) return { guardado: false }
  const root = options.root ?? sessionRoot(settings)
  await checkExistingAncestors(root)
  await directory(root)
  if ((await realpath(root)).toLowerCase() !== resolve(root).toLowerCase()) throw new Error("Ruta de sesiones enlazada fuera de la ubicación prevista")
  const id = createHash("sha256").update(nodes[0].directory + "\0" + nodes[0].id).digest("hex")
  const stateDir = join(root, ".control", id)
  await checkExistingAncestors(stateDir)
  await directory(stateDir)
  return locked(join(stateDir, ".lock"), async () => {
    const state = await loadState(stateDir)
    const existing = state.operations[key]
    const sessionDir = await sessionDirectory(root, state)
    const entry = state.entries[producer.id]
    if (!entry || entry.parent !== producer.parentID || entry.agent !== agentNames[producer.agent]) throw new Error("Productor sin carpeta verificada")
    const owner = join(sessionDir, entry.folder)
    within(sessionDir, owner)
    await checkExistingAncestors(owner)
    await directory(owner)
    if (!isAbsolute(input.delivery)) throw new Error("Ruta de entrega absoluta requerida")
    const target = resolve(input.delivery)
    within(owner, target)
    if (resolve(target, "..") !== owner) throw new Error("La entrega no pertenece al productor")
    const reference = relative(sessionDir, target).replace(/\\/g, "/")
    if (!state.deliveries.includes(reference)) throw new Error("Entrega no registrada")
    const artifact = Object.values(state.artifacts).find(a => a.deliveries.includes(reference))
    if (artifact) await verifyArtifact(sessionDir, artifact, state, existing?.phase !== "confirmed" ? existing?.artifact : undefined)
    await checkExistingAncestors(target)
    const stat = await lstat(target)
    if (!stat.isFile() && !stat.isDirectory()) throw new Error("Entrega no válida")
    const folder = stat.isDirectory() ? target : owner
    const prefix = stat.isDirectory() ? "" : `${basename(target, ".md")}-`
    const sanityName = `${prefix}sanity-check.md`
    const disputeName = `${prefix}disputa.md`
    if (input.dispute?.trim() && !input.sanity?.trim()) {
      const existing = await lstat(join(folder, sanityName))
      if (!existing.isFile() || existing.isSymbolicLink()) throw new Error("Sanidad previa no válida")
    }
    const files = Object.entries({ [sanityName]: input.sanity, [disputeName]: input.dispute })
      .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    const paths: Record<string, string> = {}
    for (const [name] of files) paths[name] = join(folder, safeName(name))
    const request: Request = { sessionID: input.sessionID, operationID: logicalID, agent: reviewer.agent,
      type: "write_review_documents", topic: reference, delivery: reference, files: Object.fromEntries(files) }
    if (existing) {
      if (existing.digest !== requestDigest(request)) throw new Error("Identidad de operación reutilizada con contenido distinto")
      return finish(state, stateDir, sessionDir, existing, nodes[0].title, options)
    }
    if (Object.values(state.operations).some(operation => operation.phase !== "confirmed"))
      throw new Error("Publicación interrumpida pendiente; recupera la misma operacion_id antes de iniciar otra")
    for (const path of Object.values(paths)) {
      try { await lstat(path); throw Object.assign(new Error("El informe ya existe"), { code: "EEXIST" }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    const operation = await prepare(state, stateDir, sessionDir, nodes, request, key, paths, [])
    return finish(state, stateDir, sessionDir, operation, nodes[0].title, options)
  })
}
