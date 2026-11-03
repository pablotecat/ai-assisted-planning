import { createHash, randomUUID } from "node:crypto"
import { link, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises"
import { hostname } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { readAgentSettings, sessionRoot, type AgentName } from "./agent_settings.ts"
import { artifactRequest, workRequest, type ArtifactRequest, type WorkRequest } from "./work_contract.ts"
import { changeExecution, checkWorkClosure, workMessages, type Execution, type NativeMessage, type Closure } from "./work_execution.ts"

export type Identity = { id: string; parentID?: string; agent: string; title: string; created: number; directory: string }
export type Resolver = ((id: string, messageID?: string) => Promise<Identity>) & {
  messages?: (id: string) => Promise<NativeMessage[]>
}

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
export type FileOrigin = { artefacto_id: string; archivo: string; sha256: string }
type FileInput = string | FileOrigin
export type Verdict = { artefacto_id: string; hash_manifiesto: string; resultado: "favorable" | "parcial" | "con_hallazgos";
  alcance: string[]; aprobados: string[]; pendientes: string[]; bloqueados: string[] }
type Review = { artifactID: string; manifestHash: string; reviewerSessionID: string; reportArtifactID: string;
  reports: string[]; verdict: Verdict }
type Version = { producerSessionID: string; type: string; published: string; reviewed?: string; approved?: string; workID?: string }
export type Artifact = {
  id: string; rootSessionID: string; producerSessionID: string; agent: string; type: string;
  files: ManifestFile[]; manifestHash: string; deliveries: string[]; directory?: string;
  workID?: string; producerMessageID?: string; closure?: Closure;
  previous?: string; origin: { type: "literal" | "promotion"; delivery?: string; files?: Record<string, FileOrigin> }
}
// D08: la captura conserva la respuesta original de una fuente, ya obtenida
// dentro del mismo código de Code Mode. El registro solo guarda blobs por hash;
// el original nunca se reescribe y un cambio de versión durante la recuperación
// añade instantáneas sin sobrescribir la anterior.
export type SourceCoveragePages = { recuperadas: number[]; pendientes: number[]; total: number }
export type SourceCoverageFields = { recuperados: string[]; pendientes: string[] }
export type SnapshotInput = {
  encargo_id: string; corpus: string; referencia: string; fuente: string; operacion_id: string
  representacion?: "texto_literal" | "objeto_serializado"
  version?: { tipo: "hash" | "fecha" | "referencia" | "otro"; valor: string }
  paginas?: SourceCoveragePages; campos?: SourceCoverageFields; pendientes?: string[]
  resultado?: string | Record<string, unknown>
}
export type Snapshot = {
  id: string; operacionKey: string; operacion_id: string; digest: string
  rootSessionID: string; workID: string; producerSessionID: string; agent: string; producerMessageID?: string
  fuente: string; corpus: string; referencia: string; archivo: string
  contentSha256: string; bytes: number; representacion: "texto_literal" | "objeto_serializado"; formato: string; created: number
  version?: { tipo: "hash" | "fecha" | "referencia" | "otro"; valor: string }
  cobertura_paginas?: SourceCoveragePages; cobertura_campos?: SourceCoverageFields; pendientes?: string[]
  // 8.4 minimum explicit link: workIDs authorized to read a snapshot produced by
  // another encargo. Established only by whoever manages both encargos (share).
  compartida_con?: string[]
}
type WorkEvent = { sessionID: string; messageID?: string; action: string; responsibleSessionID?: string;
  suficiencia?: "parcial" | "completo";
  resultado?: string; pendientes?: string[]; siguiente_accion?: string; fuentes?: string[]; decisiones?: string[];
  artefacto_id?: string; historial_revision?: { intentos_consumidos: number; limite: number; referencias: string[] } }
export type Work = { id: string; rootSessionID: string; ownerSessionID: string; responsibleSessionID: string;
  parentID?: string; pregunta: string; criterios: string[]; corpus: string; referencia: string;
  assignments: string[]; agents: Record<string, string>; events: WorkEvent[]; reviews: { sessionID: string; artifactID: string }[];
  required?: boolean; executions?: Execution[] }
type Saved = { guardado: true; rutas: Record<string, string>; sesion: string;
  artefacto_id: string; hash_manifiesto: string; operacion_id: string; archivos?: ManifestFile[]; cierre?: Closure }
type Operation = {
  id: string; logicalID: string; type: string; producerSessionID: string; agent: string; digest: string;
  phase: "prepared" | "materialized" | "confirmed"; artifact: Artifact;
  paths: Record<string, string>; stage: string; directoryIdentity?: { dev: string; ino: string };
  sources: string[]; decisions: string[]; keys: string[]; result?: Saved; review?: Review
}
type State = { root: string; entries: Record<string, Entry>; deliveries: string[]; sources: string[];
  decisions: string[]; keys: string[]; schemaVersion: 1;
  artifacts: Record<string, Artifact>; operations: Record<string, Operation>;
  reviews: Record<string, Review>; versions: Record<string, Version>; work: Record<string, Work>;
  snapshots: Record<string, Snapshot> }
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

async function loadState(stateDir: string, migrate = true): Promise<State> {
  const path = join(stateDir, "state.json")
  if ((await lstat(path)).isSymbolicLink()) throw new Error("Estado de sesión enlazado")
  const raw = await readFile(path)
  const state = JSON.parse(raw.toString("utf8"))
  if (state.schemaVersion !== undefined && state.schemaVersion !== 1)
    throw new Error(`Versión de control no soportada: ${state.schemaVersion}; conserva el control y usa una versión compatible`)
  if (state.schemaVersion === undefined && migrate) {
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
    artifacts: state.artifacts ?? {}, operations: state.operations ?? {}, reviews: state.reviews ?? {}, versions: state.versions ?? {}, work: state.work ?? {},
    snapshots: state.snapshots ?? {} }
}

async function sessionDirectory(root: string, state: State) {
  const path = join(root, state.root)
  within(root, path)
  await checkExistingAncestors(path)
  await directory(path)
  return path
}

async function stateLocation(nodes: Identity[], options: Options, create: boolean) {
  const settings = await readAgentSettings(options.settingsPath)
  const root = options.root ?? sessionRoot(settings)
  const id = hash(nodes[0].directory + "\0" + nodes[0].id)
  const stateDir = join(root, ".control", id)
  await checkExistingAncestors(stateDir)
  if (create) await mkdir(stateDir, { recursive: true })
  await directory(stateDir)
  return { root, stateDir }
}

async function loadOrCreateState(root: string, stateDir: string, node: Identity, topic: string) {
  try { return await loadState(stateDir) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const name = rootName(node.created, agentNames[node.agent], node.title || topic)
  let rootFolder = name
  for (let n = 1; ; n++) {
    try { await mkdir(join(root, rootFolder)); break } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      rootFolder = `${name}-${String(n + 1).padStart(2, "0")}`
    }
  }
  const state: State = { root: rootFolder, entries: {}, deliveries: [], sources: [], decisions: [], keys: [], schemaVersion: 1,
    artifacts: {}, operations: {}, reviews: {}, versions: {}, work: {}, snapshots: {} }
  await saveJson(join(stateDir, "state.json"), state)
  return state
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
  if (hash(JSON.stringify(artifact.files)) !== artifact.manifestHash) throw new Error("Manifiesto del artefacto no verificable")
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

function checkedVerdict(value: Verdict): Verdict {
  if (!["favorable", "parcial", "con_hallazgos"].includes(value.resultado) || typeof value.artefacto_id !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.hash_manifiesto)) throw new Error("Dictamen estructurado inválido")
  for (const field of ["alcance", "aprobados", "pendientes", "bloqueados"] as const)
    if (!Array.isArray(value[field]) || value[field].some(item => typeof item !== "string" || !item.trim()) || new Set(value[field]).size !== value[field].length)
      throw new Error("Alcance y resultados del dictamen inválidos")
  const results = [...value.aprobados, ...value.pendientes, ...value.bloqueados]
  if (!value.alcance.length || new Set(results).size !== results.length || results.length !== value.alcance.length ||
      results.some(item => !value.alcance.includes(item))) throw new Error("Cada elemento del alcance necesita un resultado único")
  if (value.resultado === "favorable" && (value.pendientes.length || value.bloqueados.length || value.aprobados.length !== value.alcance.length))
    throw new Error("Un dictamen favorable requiere aprobación completa del alcance")
  if (value.resultado === "parcial" && (!value.aprobados.length || value.aprobados.length === value.alcance.length))
    throw new Error("Un dictamen parcial requiere aprobados y elementos pendientes o bloqueados")
  return { artefacto_id: value.artefacto_id, hash_manifiesto: value.hash_manifiesto, resultado: value.resultado,
    alcance: value.alcance, aprobados: value.aprobados, pendientes: value.pendientes, bloqueados: value.bloqueados }
}

// D04: última publicada/revisada/aprobada are pointers per producer AND encargo. Two encargos of the
// same producer session keep independent records; a legacy artifact without an encargo keeps its own
// session/type record, so it never mixes with — or migrates into — a work-scoped record.
function versionKey(artifact: Artifact) {
  return hash(JSON.stringify(artifact.workID
    ? [artifact.producerSessionID, artifact.type, artifact.workID]
    : [artifact.producerSessionID, artifact.type]))
}

function versionRecords(state: State) {
  const versions: Record<string, Version> = {}
  for (const artifact of Object.values(state.artifacts)) {
    if (artifact.agent !== "revisor") {
      const key = versionKey(artifact)
      versions[key] = { ...versions[key], producerSessionID: artifact.producerSessionID, type: artifact.type,
        published: artifact.id, ...(artifact.workID ? { workID: artifact.workID } : {}) }
    } else {
      const target = Object.values(state.artifacts).find(a => a.deliveries.includes(artifact.origin.delivery ?? ""))
      if (!target) continue // Narrative legacy reviews do not invent an artifact identity.
      const key = versionKey(target)
      versions[key].reviewed = target.id
      if (state.reviews[artifact.id]?.verdict.resultado === "favorable") versions[key].approved = target.id
    }
  }
  return versions
}

async function projectIndex(state: State, sessionDir: string, stateDir: string, topic: string, options: Options) {
  const linkTo = (path: string) => `[${path}](./${encodeURI(path)})`
  for (const artifact of Object.values(state.artifacts)) await verifyArtifact(sessionDir, artifact, state)
  const legacy: string[] = []
  for (const delivery of state.deliveries) {
    const path = join(sessionDir, delivery)
    within(sessionDir, path)
    await checkExistingAncestors(path)
    const stat = await lstat(path)
    if (!stat.isDirectory() && !stat.isFile()) throw new Error("Entrega indexada no verificable")
    if (!Object.values(state.artifacts).some(artifact => artifact.deliveries.includes(delivery))) {
      legacy.push(`- ${linkTo(delivery)}: historial anterior; sin aprobación estructurada.`)
      const prefix = stat.isDirectory() ? "" : `${basename(path, ".md")}-`
      const folder = stat.isDirectory() ? path : dirname(path)
      for (const name of [`${prefix}sanity-check.md`, `${prefix}disputa.md`]) {
        const report = join(folder, name)
        try {
          await checkedFile(sessionDir, report)
          legacy.push(`  - Informe narrativo: ${linkTo(portable(relative(sessionDir, report)))}`)
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
      }
    }
  }
  const versions = Object.values(versionRecords(state)).flatMap(version => [
    `- ${version.producerSessionID}${version.workID ? ` / encargo ${version.workID}` : ""} / ${version.type}: última publicada \`${version.published}\`; última revisada \`${version.reviewed ?? "ninguna"}\`; última aprobada completa \`${version.approved ?? "ninguna"}\`.`,
  ])
  const details = Object.values(state.artifacts).filter(a => a.agent !== "revisor").flatMap(artifact => {
    const reports = Object.values(state.artifacts).filter(a => artifact.deliveries.includes(a.origin.delivery ?? ""))
    const review = reports.map(report => state.reviews[report.id]).findLast(Boolean)
    const status = review ? review.verdict.resultado === "favorable" ? "aprobada completa (publicación)" : review.verdict.resultado === "parcial" ? "aprobación parcial; sin aprobación completa" : "revisada con hallazgos; sin aprobación completa"
      : reports.length ? "revisión narrativa; sin aprobación estructurada" : "pendiente de revisión"
    return [`### ${artifact.id}`, `- Productor: ${artifact.agent} / ${artifact.producerSessionID}; estado: **${status}**.`,
      `- Hash del productor: \`${artifact.manifestHash}\`; versión anterior: \`${artifact.previous ?? "ninguna"}\`.`,
      ...artifact.files.map(file => `- Archivo: ${linkTo(file.path)}`),
      ...reports.flatMap(report => report.files.map(file => `- Informe: ${linkTo(file.path)}`)),
      ...(review ? [`- Alcance: ${review.verdict.alcance.join(", ")}`, `- Aprobados: ${review.verdict.aprobados.join(", ") || "ninguno"}`,
        `- Pendientes: ${review.verdict.pendientes.join(", ") || "ninguno"}`, `- Bloqueados: ${review.verdict.bloqueados.join(", ") || "ninguno"}`] : []), ""]
  })
  const index = ["# Encargo", "", `**Tema:** ${topic.replace(/[\r\n]+/g, " ")}`, `**Claves:** ${state.keys.join(", ") || "No indicadas"}`,
    "**Estado:** entregables publicados", "", "## Fuentes consultadas", ...state.sources.map(s => `- ${s}`),
    "", "## Decisiones relevantes", ...state.decisions.map(d => `- ${d}`),
    "", "## Entregas", ...state.deliveries.map(d => `- ${linkTo(d)}`),
    "", "## Versiones y revisiones", "La aprobación de publicación no acredita integración global de arquitectura.",
    ...versions, "", ...details, ...(legacy.length ? ["## Historial anterior", ...legacy] : []), ""].join("\n")
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

type Request = { sessionID: string; messageID?: string; operationID: string; type: string; agent: string; topic: string;
  files: Record<string, FileInput>; sources?: string[]; decisions?: string[]; keys?: string[]; group?: string; delivery?: string; verdict?: Verdict; workID?: string;
  closure?: Closure; partial?: { proposito: string; efecto: string; siguiente_accion: string } }

async function resolveFiles(input: Request, state: State, sessionDir: string, nodes: Identity[], options: Options) {
  const files: Record<string, string | Uint8Array> = {}
  for (const [name, origin] of Object.entries(input.files)) {
    if (typeof origin === "string") { files[name] = origin; continue }
    const artifact = state.artifacts[origin.artefacto_id]
    if (!artifact || artifact.rootSessionID !== nodes[0].id || artifact.agent === "revisor")
      throw new Error("Artefacto de origen ajeno o no autorizado")
    if (input.workID || artifact.workID) {
      const work = state.work[input.workID ?? ""]
      if (!work || artifact.workID !== work.id || !await canReadArtifact(artifact, work, nodes, state, options))
        throw new Error("Origen de otro encargo/corpus o no asignado")
    }
    const sourceNodes = await chain(artifact.producerSessionID, undefined, options.get)
    const source = sourceNodes.at(-1)!
    if (sourceNodes[0].id !== nodes[0].id || source.directory !== nodes[0].directory || source.agent !== artifact.agent ||
        sourceNodes.some(node => !state.entries[node.id] || state.entries[node.id].parent !== node.parentID || state.entries[node.id].agent !== node.agent))
      throw new Error("Productor del origen distinto del registro verificado")
    if (source.id !== input.sessionID && !(input.agent === "planificador" && source.agent === "refinador" && source.parentID === input.sessionID))
      throw new Error("Productor de origen no autorizado para esta delegación")
    const operation = Object.values(state.operations).find(op => op.phase === "confirmed" && op.artifact.id === artifact.id)
    const file = artifact.files.find(file => file.path === origin.archivo)
    if (!operation || !file) throw new Error("Archivo de origen no registrado")
    if (file.sha256 !== origin.sha256) throw new Error("Hash de origen incorrecto")
    await verifyArtifact(sessionDir, artifact, state)
    const path = join(sessionDir, file.path)
    const sourceName = Object.keys(operation.paths).find(key => portable(relative(sessionDir, operation.paths[key])) === file.path)
    if (input.type === "write_planning_deliverables" && sourceName !== name)
      throw new Error("La promoción de historias requiere archivos finales separados con su nombre; borrador.md no es una historia final")
    if (artifact.type === "write_planning_deliverables" && Object.keys(operation.paths).some(key => !(key in input.files)))
      throw new Error("La promoción debe conservar todos los archivos de la entrega del Planificador")
    const bytes = await readFile(path)
    if (hash(bytes) !== origin.sha256 || bytes.length !== file.bytes) throw new Error("Hash de origen incorrecto")
    if (!bytes.toString("utf8").trim()) throw new Error("Entregables vacíos")
    files[name] = bytes
  }
  return files
}

function requestDigest(input: Request) {
  return hash(JSON.stringify({ type: input.type, topic: input.topic, group: input.group ?? null, delivery: input.delivery ?? null,
    files: Object.keys(input.files).sort().map(name => { const file = input.files[name]; return [name,
      typeof file === "string" ? file : { artefacto_id: file.artefacto_id, archivo: file.archivo, sha256: file.sha256 }] }),
    sources: input.sources ?? [], decisions: input.decisions ?? [], keys: input.keys ?? [],
    ...(input.verdict ? { verdict: input.verdict } : {}), ...(input.workID ? { workID: input.workID } : {}),
    ...(input.partial ? { partial: input.partial } : {}) }))
}

async function prepare(state: State, stateDir: string, sessionDir: string, nodes: Identity[], input: Request, key: string,
  paths: Record<string, string>, deliveries: string[], targetDirectory?: string,
  files: Record<string, string | Uint8Array> = input.files as Record<string, string>) {
  const id = randomUUID()
  const stage = join(stateDir, id)
  await mkdir(stage)
  const content = Object.fromEntries(Object.entries(paths).map(([name, path]) => [portable(relative(sessionDir, path)), files[name]]))
  const identity = manifest(content)
  const previous = Object.values(state.artifacts).findLast(a => a.producerSessionID === input.sessionID && a.type === input.type && a.workID === input.workID)
  const origins = Object.fromEntries(Object.entries(input.files).filter((entry): entry is [string, FileOrigin] => typeof entry[1] !== "string"))
  const artifact: Artifact = { id: randomUUID(), rootSessionID: nodes[0].id, producerSessionID: input.sessionID,
    agent: input.agent, type: input.type, files: identity.files, manifestHash: identity.hash, deliveries,
    ...(input.workID ? { workID: input.workID } : {}),
    ...(input.messageID ? { producerMessageID: input.messageID } : {}), ...(input.closure ? { closure: input.closure } : {}),
    ...(targetDirectory ? { directory: portable(relative(sessionDir, targetDirectory)) } : {}),
    ...(previous ? { previous: previous.id } : {}), origin: { type: Object.keys(origins).length ? "promotion" : "literal",
      ...(Object.keys(origins).length ? { files: origins } : {}), ...(input.delivery ? { delivery: input.delivery } : {}) } }
  const operation: Operation = { id, logicalID: input.operationID, type: input.type, producerSessionID: input.sessionID,
    agent: input.agent, digest: requestDigest(input), phase: "prepared", artifact, paths, stage: id,
    sources: input.sources ?? [], decisions: input.decisions ?? [], keys: input.keys ?? [],
    ...(input.verdict ? { review: { artifactID: input.verdict.artefacto_id, manifestHash: input.verdict.hash_manifiesto,
      reviewerSessionID: input.sessionID, reportArtifactID: artifact.id, reports: identity.files.map(file => file.path), verdict: input.verdict } } : {}) }
  for (const [name, content] of Object.entries(files)) await writeFile(join(stage, name), content, { flag: "wx" })
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
      operacion_id: operation.logicalID, archivos: operation.artifact.files,
      ...(operation.artifact.closure ? { cierre: operation.artifact.closure } : {}) }
    state.artifacts[operation.artifact.id] = operation.artifact
    if (operation.review) state.reviews[operation.artifact.id] = operation.review
    state.versions = versionRecords(state)
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
  files: Record<string, FileInput>; group?: string; sources?: string[]; decisions?: string[]; keys?: string[];
  operationID?: string; publicationType?: string; workID?: string;
  partial?: { proposito: string; efecto: string; siguiente_accion: string }
}, options: Options): Promise<Publication> {
  const names = Object.keys(input.files)
  if (input.partial && (!input.workID || Object.values(input.partial).length !== 3 ||
      [input.partial.proposito, input.partial.efecto, input.partial.siguiente_accion].some(value => typeof value !== "string" || !value.trim())))
    throw new Error("Un parcial requiere encargo, propósito, efecto y siguiente acción")
  if (!names.length || names.some(name => typeof input.files[name] === "string" && !input.files[name].trim())) throw new Error("Entregables vacíos")
  for (const file of Object.values(input.files)) if (typeof file !== "string" &&
    (!file || typeof file.artefacto_id !== "string" || typeof file.archivo !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)))
    throw new Error("Origen de archivo inválido")
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
    const state = await loadOrCreateState(root, stateDir, nodes[0], input.topic)
    const sessionDir = await sessionDirectory(root, state)
    if (input.workID) {
      const work = await authorizedWork(state, input.workID, nodes, options)
      if (work.responsibleSessionID !== input.sessionID) throw new Error("Solo el responsable actual publica para el encargo")
    }
    for (const node of nodes) {
      const entry = state.entries[node.id]
      if (entry && (entry.parent !== node.parentID || entry.agent !== agentNames[node.agent]))
        throw new Error("Propietario de carpeta diferente")
    }
    const existing = state.operations[key]
    if (existing) {
      if (existing.digest !== requestDigest(request)) throw new Error("Identidad de operación reutilizada con contenido distinto")
      if (existing.phase !== "confirmed" && input.workID && input.group !== "Originales")
        await workClosure(state, state.work[input.workID], nodes, options, sessionDir, input.partial)
      return finish(state, stateDir, sessionDir, existing, nodes[0].title || input.topic, options)
    }
    if (input.workID && input.group !== "Originales")
      request.closure = await workClosure(state, state.work[input.workID], nodes, options, sessionDir, input.partial)
    // A different operation cannot step over an interrupted reservation.
    if (Object.values(state.operations).some(operation => operation.phase !== "confirmed"))
      throw new Error("Publicación interrumpida pendiente; recupera la misma operacion_id antes de iniciar otra")
    const files = await resolveFiles(request, state, sessionDir, nodes, options)
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
    const operation = await prepare(state, stateDir, sessionDir, nodes, request, key, paths, deliveries, input.group ? target : undefined, files)
    return finish(state, stateDir, sessionDir, operation, nodes[0].title || input.topic, options)
  })
}

type Actor = { sessionID: string; messageID?: string; agent: string }

function checkReader(current: Identity, nodes: Identity[], allowed: string[]) {
  if ((current.agent === "lector-codigo" && nodes.length > 1 || current.agent === "lector-documentacion" && nodes.some(n => n.agent === "investigador")) &&
      !allowed.includes(current.agent)) throw new Error("Especialista deshabilitado")
}

async function workIdentity(id: string, nodes: Identity[], options: Options) {
  const other = await chain(id, undefined, options.get)
  if (other[0].id !== nodes[0].id || other[0].directory !== nodes[0].directory)
    throw new Error("Sesión de otra raíz o proyecto")
  return other.at(-1)!
}

function manages(work: Work, sessionID: string, state: State): boolean {
  const visited = new Set<string>()
  for (let current: Work | undefined = work; current; current = current.parentID ? state.work[current.parentID] : undefined) {
    if (visited.has(current.id)) throw new Error("Árbol de encargos inválido")
    visited.add(current.id)
    if (current.ownerSessionID === sessionID || current.responsibleSessionID === sessionID) return true
  }
  return false
}

async function authorizedWork(state: State, id: string, nodes: Identity[], options: Options) {
  const work = state.work[id]
  const actor = nodes.at(-1)!
  if (!work || work.rootSessionID !== nodes[0].id || !(manages(work, actor.id, state) ||
      work.assignments.includes(actor.id) || work.reviews.some(r => r.sessionID === actor.id)))
    throw new Error("Encargo no asignado o de otra raíz/corpus")
  if (actor.agent === "revisor" && !work.reviews.some(r => r.sessionID === actor.id && state.artifacts[r.artifactID]?.producerSessionID === actor.parentID))
    throw new Error("Revisor fuera del árbol de la entrega asignada")
  // Revalidate both ends against the current runtime, not model-supplied recipient labels.
  const owner = await workIdentity(work.ownerSessionID, nodes, options)
  if (work.agents[owner.id] !== owner.agent) throw new Error("Propietario del encargo distinto del registro")
  for (const id of new Set([...work.assignments, work.responsibleSessionID])) {
    const assigned = await workIdentity(id, nodes, options)
    if (id !== owner.id && assigned.parentID !== owner.id || work.agents[id] !== assigned.agent)
      throw new Error("Responsable fuera del árbol autorizado")
  }
  if (work.parentID) {
    const parent = state.work[work.parentID]
    if (!parent || parent.corpus !== work.corpus || parent.referencia !== work.referencia ||
        !parent.assignments.includes(owner.id)) throw new Error("Encargo padre/corpus no verificable")
  }
  return work
}

async function canReadArtifact(artifact: Artifact, work: Work, nodes: Identity[], state: State, options: Options) {
  if (artifact.workID !== work.id || artifact.rootSessionID !== nodes[0].id) return false
  const actor = nodes.at(-1)!
  const producer = await workIdentity(artifact.producerSessionID, nodes, options)
  if (producer.agent !== artifact.agent) throw new Error("Productor distinto del registro")
  const owner = producer.agent === "revisor" ? await workIdentity(producer.parentID!, nodes, options) : producer
  const entry = state.entries[owner.id]
  if (!entry || entry.parent !== owner.parentID || entry.agent !== owner.agent) throw new Error("Productor sin carpeta verificada")
  for (const file of artifact.files) within(join("/", entry.folder), join("/", file.path))
  if (!Object.values(state.operations).some(op => op.phase === "confirmed" && op.artifact.id === artifact.id))
    throw new Error("Artefacto sin publicación confirmada")
  if (actor.agent === "revisor") return work.reviews.some(r => r.sessionID === actor.id &&
    (r.artifactID === artifact.id && producer.id === actor.parentID || producer.id === actor.id &&
      state.artifacts[r.artifactID]?.deliveries.includes(artifact.origin.delivery ?? "")))
  if (actor.id !== work.responsibleSessionID && !manages(work, actor.id, state) && producer.id !== actor.id) return false
  if (!(work.assignments.includes(producer.id) || artifact.agent === "revisor" && work.reviews.some(r => r.sessionID === producer.id))) return false
  // Only known producer reports are conclusions. Unknown registered sources and planner
  // originals cannot acquire Jira/raw-source permissions through a caller-supplied label.
  const report = artifact.type === "publish_agent_deliverable" || artifact.type === "write_report_pair" && artifact.agent === "investigador" ||
    artifact.type === `session:${artifact.agent}:file`
  if (actor.agent === "investigador" && !report) return false
  if (actor.agent === "lector-codigo" && artifact.agent !== "lector-codigo" && artifact.agent !== "investigador") return false
  if (actor.agent === "lector-documentacion" && ["lector-codigo", "arquitecto-test"].includes(artifact.agent)) return false
  if (actor.agent === "arquitecto-test" && !["arquitecto", "arquitecto-test", "revisor"].includes(artifact.agent)) return false
  return true
}

async function workClosure(state: State, work: Work, nodes: Identity[], options: Options, sessionDir: string,
  partial?: { proposito: string; efecto: string; siguiente_accion: string }) {
  const closure = await checkWorkClosure(work, Object.values(state.work), options.get, partial)
  for (const dependency of closure.dependencias) {
    const child = await authorizedWork(state, dependency.encargo_id, nodes, options)
    const execution = child.executions?.at(-1), result = execution?.result
    if (!result?.artifactID) continue
    const artifact = state.artifacts[result.artifactID]
    if (!artifact || artifact.manifestHash !== result.manifestHash || artifact.producerSessionID !== execution!.sessionID ||
        !await canReadArtifact(artifact, child, nodes, state, options)) throw new Error("Artefacto del resultado integrado no verificable")
    await verifyArtifact(sessionDir, artifact, state)
  }
  return closure
}

export async function sessionWork(raw: WorkRequest, actor: Actor, options: Options): Promise<unknown> {
  const input = workRequest.parse(raw)
  const nodes = await chain(actor.sessionID, actor.messageID, options.get)
  const current = nodes.at(-1)!
  if (current.agent !== actor.agent) throw new Error("Autor del registro diferente")
  const writing = !["list", "get"].includes(input.action)
  if (writing && current.agent === "revisor") throw new Error("Revisor solo consulta el registro; publica su dictamen por write_review_documents")
  const settings = await readAgentSettings(options.settingsPath)
  checkReader(current, nodes, settings.agentes.investigador.especialistasPermitidos)
  if (writing && !settings.agentes[agentNames[current.agent]].guardarEntregablesEnSesion) return { guardado: false }
  const location = await stateLocation(nodes, options, writing).catch(error => {
    if (!writing && error.code === "ENOENT") return undefined
    throw error
  })
  if (!location) {
    if (input.action === "list") return { encargos: [] }
    throw new Error("Encargo no registrado; sin historial persistido verificable")
  }
  const { root, stateDir } = location
  const run = async () => {
    const state = writing ? await loadOrCreateState(root, stateDir, nodes[0], "encargo") : await loadState(stateDir, false)
    if (input.action === "list") {
      const works = []
      for (const work of Object.values(state.work)) {
        if (!(manages(work, current.id, state) || work.assignments.includes(current.id) || work.reviews.some(r => r.sessionID === current.id))) continue
        works.push(await authorizedWork(state, work.id, nodes, options))
      }
      return { encargos: works }
    }
    let work: Work
    if (input.action === "create") {
      if (input.padre_id) {
        const parent = await authorizedWork(state, input.padre_id, nodes, options)
        if (parent.responsibleSessionID !== current.id || parent.corpus !== input.corpus || parent.referencia !== input.referencia)
          throw new Error("El subencargo requiere responsable actual y mismo corpus/referencia")
      }
      const responsible = await workIdentity(input.responsable_session_id ?? current.id, nodes, options)
      if (responsible.id !== current.id && responsible.parentID !== current.id) throw new Error("Responsable no es hijo directo autorizado")
      if (responsible.agent === "revisor") throw new Error("Asigna al Revisor una entrega exacta, no la responsabilidad del encargo")
      work = { id: `work-${randomUUID()}`, rootSessionID: nodes[0].id, ownerSessionID: current.id,
        responsibleSessionID: responsible.id, assignments: [responsible.id],
        agents: { [current.id]: current.agent, [responsible.id]: responsible.agent },
        ...(input.padre_id ? { parentID: input.padre_id } : {}), pregunta: input.pregunta, criterios: input.criterios,
        corpus: input.corpus, referencia: input.referencia, events: [], reviews: [],
        ...(input.requerido !== undefined ? { required: input.requerido } : {}) }
      state.work[work.id] = work
    } else {
      work = await authorizedWork(state, input.encargo_id, nodes, options)
      if (input.action === "get") {
        const messages = options.get.messages && current.agent !== "revisor" ? await options.get.messages(work.responsibleSessionID) : undefined
        return { encargo: work, ...(messages ? { mensajes: workMessages(work, messages, current.id === work.ownerSessionID) } : {}) }
      }
      if (input.action === "assign") {
        if (current.id !== work.ownerSessionID) throw new Error("Solo el coordinador propietario asigna sustituto")
        if (work.executions?.some(e => ["en_cola", "en_curso", "resultado_disponible"].includes(e.state)))
          throw new Error("Recupera e integra el resultado o registra el impedimento inactivo antes de sustituir la ejecución abierta")
        const responsible = await workIdentity(input.responsable_session_id, nodes, options)
        const previous = await workIdentity(work.responsibleSessionID, nodes, options)
        if (responsible.id !== current.id && responsible.parentID !== current.id || responsible.agent === "revisor" ||
            previous.id !== current.id && responsible.agent !== previous.agent) throw new Error("Sustituto fuera del árbol o especialidad autorizados")
        work.responsibleSessionID = responsible.id
        work.agents[responsible.id] = responsible.agent
        if (!work.assignments.includes(responsible.id)) work.assignments.push(responsible.id)
      } else if (input.action === "record") {
        if (![work.ownerSessionID, work.responsibleSessionID].includes(current.id)) throw new Error("Solo propietario o responsable actual registra resultados")
        if (input.suficiencia === "completo" && input.pendientes.length) throw new Error("Un resultado con pendientes sigue siendo parcial")
        if (input.suficiencia === "completo" && work.executions?.some(e => ["en_cola", "en_curso"].includes(e.state)))
          throw new Error("No se completa un encargo con ejecución activa")
        if (input.suficiencia === "completo") await workClosure(state, work, nodes, options, await sessionDirectory(root, state))
        if (input.artefacto_id) {
          const artifact = state.artifacts[input.artefacto_id]
          if (!artifact || !await canReadArtifact(artifact, work, nodes, state, options)) throw new Error("Resultado de otro encargo/corpus o no verificable")
          await verifyArtifact(await sessionDirectory(root, state), artifact, state)
        }
        const history = input.historial_revision
        const previous = work.events.findLast(e => e.historial_revision)?.historial_revision
        if (history && (history.intentos_consumidos > history.limite || previous &&
            (history.intentos_consumidos < previous.intentos_consumidos || history.limite !== previous.limite)))
          throw new Error("Historial de intentos incompatible; no se reinicia el encargo")
      } else if (input.action === "review") {
        const artifact = state.artifacts[input.artefacto_id]
        const reviewer = await workIdentity(input.revisor_session_id, nodes, options)
        if (!artifact || artifact.producerSessionID !== current.id || !await canReadArtifact(artifact, work, nodes, state, options) ||
            reviewer.agent !== "revisor" || reviewer.parentID !== current.id) throw new Error("Revisor o entrega fuera de la delegación autorizada")
        if (!work.reviews.some(r => r.sessionID === reviewer.id && r.artifactID === artifact.id))
          work.reviews.push({ sessionID: reviewer.id, artifactID: artifact.id })
      } else {
        if (input.action === "confirm" && current.agent === "refinador") {
          const active = Object.values(state.work).filter(w => w.ownerSessionID === current.id)
            .flatMap(w => w.executions ?? []).filter(e => ["en_cola", "en_curso"].includes(e.state))
          const repeated = work.executions?.some(e => e.preparationMessageID === input.preparacion_message_id)
          if (!repeated && active.length >= settings.agentes.refinador.maxConsultasParalelas)
            throw new Error("Límite configurado de consultas activas alcanzado")
        }
        let artifact: Artifact | undefined
        if (input.action === "result" && input.artefacto_id) {
          artifact = state.artifacts[input.artefacto_id]
          if (!artifact || !await canReadArtifact(artifact, work, nodes, state, options)) throw new Error("Resultado de otro encargo/corpus o no verificable")
          await verifyArtifact(await sessionDirectory(root, state), artifact, state)
        }
        const execution = await changeExecution(work, input, actor, options.get, artifact)
        await saveJson(join(stateDir, "state.json"), state)
        return { guardado: true, encargo: work, ejecucion: execution }
      }
    }
    // These are authored declarations. Only session/message identity is runtime evidence;
    // Native execution boundaries, when used, are stored separately from declarations.
    const { action, ...data } = input.action === "record" ? input : { action: input.action }
    const event: WorkEvent = { ...data, action, sessionID: current.id, ...(actor.messageID ? { messageID: actor.messageID } : {}),
      ...(input.action === "assign" || input.action === "create" ? { responsibleSessionID: work.responsibleSessionID } : {}) }
    work.events.push(event)
    await saveJson(join(stateDir, "state.json"), state)
    return { guardado: true, encargo: work }
  }
  return writing ? locked(join(stateDir, ".lock"), run) : run()
}

function pageOffset(cursor: string | undefined, binding: string, length: number) {
  if (!cursor) return 0
  let data: { binding: string; offset: number }
  try { data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) } catch { throw new Error("Cursor inválido") }
  if (!data || typeof data !== "object" || data.binding !== binding || !Number.isSafeInteger(data.offset) || data.offset < 0 || data.offset >= length)
    throw new Error("Cursor de otro solicitante, encargo, archivo o versión")
  return data.offset
}
const nextCursor = (binding: string, offset: number, length: number) => offset < length
  ? Buffer.from(JSON.stringify({ binding, offset })).toString("base64url") : null

// Serialization is deterministic by structure; the received values stay literal.
function stableStringify(value: unknown): string {
  if (value === undefined) return "null"
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`
  return JSON.stringify(value)
}
function parsedJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}
// Only wrappers covered by known read contracts classify as a known format; an
// unexpected one is preserved and diagnosed, never read as absence or undefined.
function classifyWrapper(value: unknown): string {
  if (Array.isArray(value)) return "lista"
  if (!value || typeof value !== "object") return "desconocido"
  const keys = Object.keys(value)
  if (keys.includes("error")) return "error_de_fuente"
  if (keys.includes("data") || keys.includes("output")) return "envoltorio_datos"
  if (keys.includes("key") && keys.includes("fields")) return "jira_issue"
  if (keys.includes("comments") && keys.includes("total")) return "jira_comentarios"
  if (keys.includes("fields")) return "objeto_campos"
  return "desconocido"
}
// Preserves the received representation and identifies which one was obtained.
// D08 fix: a received STRING keeps its exact bytes even when it contains JSON —
// the wrapper is classified over the parsed value only to diagnose or enable a
// known derived view; the original is never re-serialized. A real object is
// serialized deterministically; literal text stays untouched.
function normalizeSourceResult(declared: SnapshotInput["representacion"], resultado: SnapshotInput["resultado"]):
  { representacion: "texto_literal" | "objeto_serializado"; content: string; formato: string } {
  if (typeof resultado === "string") {
    const parsed = parsedJson(resultado)
    const object = parsed !== null && typeof parsed === "object"
    if (declared === "objeto_serializado") {
      // The declared label is kept, but what was received is this string: it is
      // stored exactly as received after validating it is a serialized object.
      if (!object) throw new Error("La representación declarada no es un objeto serializado válido")
      return { representacion: "objeto_serializado", content: resultado, formato: classifyWrapper(parsed) }
    }
    return { representacion: "texto_literal", content: resultado, formato: object ? classifyWrapper(parsed) : "texto" }
  }
  if (declared === "texto_literal") throw new Error("Un objeto capturado no se declara como texto literal")
  try {
    return { representacion: "objeto_serializado", content: stableStringify(resultado), formato: classifyWrapper(resultado) }
  } catch {
    throw new Error("El resultado contiene valores no serializables de forma determinista")
  }
}

function snapshotResult(snapshot: Snapshot, state: State) {
  // A version change observed during recovery is reported, never an overwrite.
  const previous = Object.values(state.snapshots).filter(other => other.id !== snapshot.id &&
    other.workID === snapshot.workID && other.fuente === snapshot.fuente && other.corpus === snapshot.corpus &&
    other.referencia === snapshot.referencia && other.version && snapshot.version &&
    other.version.valor !== snapshot.version.valor)
  return { guardado: true, instantanea_id: snapshot.id, operacion_id: snapshot.operacion_id,
    fuente: snapshot.fuente, corpus: snapshot.corpus, referencia: snapshot.referencia, archivo: snapshot.archivo,
    representacion: snapshot.representacion, formato: snapshot.formato,
    contenido: { sha256: snapshot.contentSha256, bytes: snapshot.bytes },
    ...(snapshot.version ? { version: snapshot.version } : {}),
    ...(snapshot.cobertura_paginas ? { cobertura_paginas: snapshot.cobertura_paginas } : {}),
    ...(snapshot.cobertura_campos ? { cobertura_campos: snapshot.cobertura_campos } : {}),
    ...(snapshot.pendientes ? { pendientes: snapshot.pendientes } : {}),
    ...(snapshot.formato === "desconocido" ? { diagnostico: { tipo: "envoltorio_desconocido",
      detalle: "La respuesta se conservó íntegra; su formato no coincide los contratos conocidos, no se genera vista derivada y no se interpreta como ausencia" } } : {}),
    ...(previous.length ? { aviso_version: previous.map(other =>
      ({ instantanea_anterior_id: other.id, version_anterior: other.version })) } : {}) }
}

// D05 for snapshots: access derives from the verified tree and assignment, not
// from knowing an ID, a hash or a blob path. A shared snapshot keeps the same
// per-role matrix: the producer must belong to the snapshot's own encargo, so
// raw reader sources never reach an investigator through a shared link.
async function canReadSource(snapshot: Snapshot, work: Work, nodes: Identity[], state: State, options: Options) {
  const shared = snapshot.compartida_con?.includes(work.id) ?? false
  if (snapshot.workID !== work.id && !shared) return false
  if (snapshot.rootSessionID !== nodes[0].id) return false
  const actor = nodes.at(-1)!
  const producer = await workIdentity(snapshot.producerSessionID, nodes, options)
  if (producer.agent !== snapshot.agent) throw new Error("Productor de la fuente distinto del registro")
  if (actor.agent === "revisor") return work.reviews.some(review => review.sessionID === actor.id)
  if (actor.id !== work.responsibleSessionID && !manages(work, actor.id, state) && actor.id !== producer.id) return false
  const originWork = shared ? state.work[snapshot.workID] : work
  if (!originWork) return false
  // H-1: the owner is part of the encargo's authority (manages), so a snapshot
  // produced by the owner counts like one by the responsible.
  if (!originWork.assignments.includes(producer.id) && producer.id !== originWork.ownerSessionID) return false
  // Raw sources captured by a reader keep their narrow audience: an investigator
  // does not acquire raw code/local-document access through a caller-supplied label.
  if (actor.agent === "investigador" && !["investigador", "refinador", "planificador", "arquitecto"].includes(producer.agent)) return false
  if (actor.agent === "lector-codigo" && !["lector-codigo", "investigador"].includes(producer.agent)) return false
  if (actor.agent === "lector-documentacion" && ["lector-codigo", "arquitecto-test"].includes(producer.agent)) return false
  if (actor.agent === "arquitecto-test" && !["arquitecto", "arquitecto-test", "revisor"].includes(producer.agent)) return false
  return true
}

async function sourceBlob(stateDir: string, snapshot: Snapshot) {
  const blobs = join(stateDir, "snapshots")
  await checkExistingAncestors(blobs)
  await directory(blobs)
  const path = join(blobs, snapshot.contentSha256)
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Original de fuente no verificable")
  const bytes = await readFile(path)
  if (hash(bytes) !== snapshot.contentSha256 || bytes.length !== snapshot.bytes)
    throw new Error("Contenido de la fuente modificado externamente")
  return bytes
}

// D08 capture entry: the read result is transferred within the same Code Mode
// code, never re-transcribed by the model; no destination path is accepted and
// the runtime resolves producer/encargo/corpus without declared authorship.
export async function captureSource(input: SnapshotInput, actor: Actor, options: Options): Promise<unknown> {
  if (input.resultado === undefined || input.resultado === null || input.resultado === "")
    throw new Error("Resultado requerido: una respuesta ausente no se interpreta como contenido vacío ni como ausencia de la fuente")
  const nodes = await chain(actor.sessionID, actor.messageID, options.get)
  const current = nodes.at(-1)!
  if (current.agent !== actor.agent) throw new Error("Autor de captura diferente")
  if (current.agent === "revisor") throw new Error("El Revisor consulta instantáneas; no captura fuentes")
  const settings = await readAgentSettings(options.settingsPath)
  checkReader(current, nodes, settings.agentes.investigador.especialistasPermitidos)
  if (!settings.agentes[agentNames[current.agent]].guardarEntregablesEnSesion) return { guardado: false }
  const { root, stateDir } = await stateLocation(nodes, options, true)
  return locked(join(stateDir, ".lock"), async () => {
    const state = await loadOrCreateState(root, stateDir, nodes[0], "encargo")
    const work = await authorizedWork(state, input.encargo_id, nodes, options)
    if (input.corpus !== work.corpus || input.referencia !== work.referencia)
      throw new Error("Corpus/referencia del encargo distintos")
    if (current.id !== work.responsibleSessionID && current.id !== work.ownerSessionID)
      throw new Error("Solo el responsable actual o el coordinador propietario capturan fuentes del encargo")
    const normalized = normalizeSourceResult(input.representacion, input.resultado)
    const digest = hash(JSON.stringify([input.encargo_id, input.fuente, input.operacion_id, normalized.representacion,
      normalized.content, input.version ?? null, input.paginas ?? null, input.campos ?? null, input.pendientes ?? []]))
    const operacionKey = hash(JSON.stringify([current.id, "capture_agent_source", input.operacion_id]))
    const existing = Object.values(state.snapshots).find(snapshot => snapshot.operacionKey === operacionKey)
    if (existing) {
      if (existing.digest !== digest) throw new Error("Identidad de captura reutilizada con contenido distinto")
      return snapshotResult(existing, state)
    }
    const contentSha256 = hash(normalized.content)
    const blobs = join(stateDir, "snapshots")
    await checkExistingAncestors(blobs)
    await mkdir(blobs, { recursive: true })
    await directory(blobs)
    const blobPath = join(blobs, contentSha256)
    const previousFile = await lstat(blobPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return undefined
    })
    if (previousFile) {
      if (!previousFile.isFile() || previousFile.isSymbolicLink()) throw new Error("Original de fuente no verificable")
      if (hash(await readFile(blobPath)) !== contentSha256) throw new Error("Original de fuente alterado")
    } else await writeFile(blobPath, normalized.content, { flag: "wx" })
    const snapshot: Snapshot = {
      id: `snap-${randomUUID()}`, operacionKey, operacion_id: input.operacion_id, digest,
      rootSessionID: nodes[0].id, workID: work.id, producerSessionID: current.id, agent: current.agent,
      ...(actor.messageID ? { producerMessageID: actor.messageID } : {}),
      fuente: input.fuente, corpus: work.corpus, referencia: work.referencia,
      archivo: `fuentes/${slug(input.fuente)}.txt`, contentSha256, bytes: Buffer.byteLength(normalized.content),
      representacion: normalized.representacion, formato: normalized.formato, created: Date.now(),
      ...(input.version ? { version: input.version } : {}),
      ...(input.paginas ? { cobertura_paginas: input.paginas } : {}),
      ...(input.campos ? { cobertura_campos: input.campos } : {}),
      ...(input.pendientes?.length ? { pendientes: input.pendientes } : {}),
    }
    state.snapshots[snapshot.id] = snapshot
    await saveJson(join(stateDir, "state.json"), state)
    return snapshotResult(snapshot, state)
  })
}

//// Derived views: stable line locators over an intact original. ////

function lineIndex(text: string) {
  const lines: string[] = [], starts: number[] = []
  let offset = 0
  for (const match of text.matchAll(/\r?\n/g)) {
    lines.push(text.slice(offset, match.index))
    starts.push(offset)
    offset = match.index + match[0].length
  }
  lines.push(text.slice(offset))
  starts.push(offset)
  return { lines, starts }
}
function locatorLine(localizador: string, totalLines: number) {
  const match = /^L([1-9][0-9]{0,9})$/.exec(localizador)
  if (!match) throw new Error("Localizador inválido: usa L<número de línea 1-based>")
  const line = Number(match[1]) - 1
  if (line >= totalLines) throw new Error("Localizador fuera del original")
  return line
}
function viewOffset(cursor: string | undefined, binding: string, totalLines: number) {
  if (!cursor) return 0
  let data: { binding: string; line: number }
  try { data = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) } catch { throw new Error("Cursor inválido") }
  if (!data || typeof data !== "object" || data.binding !== binding || !Number.isSafeInteger(data.line) ||
      data.line < 0 || data.line >= totalLines) throw new Error("Cursor de otro solicitante, encargo, archivo o versión")
  return data.line
}
const nextViewCursor = (binding: string, line: number, totalLines: number) => line < totalLines
  ? Buffer.from(JSON.stringify({ binding, line })).toString("base64url") : null
// A line is never split across pages: a single line longer than the limit is
// returned whole on its own page so long HTML stays fully recoverable.
function linePage(lines: string[], from: number, limit: number) {
  const page: { numero: number; contenido: string }[] = []
  let units = 0, excede = false, index = from
  while (index < lines.length) {
    const length = lines[index].length + (page.length ? 1 : 0)
    if (units + length > limit && page.length) break
    if (length > limit) excede = true
    page.push({ numero: index + 1, contenido: lines[index] })
    units += length
    index++
  }
  return { page, units, excede, next: index }
}
function sourceView(meta: {
  id: string; archivo: string; sha256: string; bytes: number; formato: string; instantanea: boolean
  fuente?: string; corpus?: string; referencia?: string; representacion?: string
  version?: Snapshot["version"]; cobertura_paginas?: SourceCoveragePages; cobertura_campos?: SourceCoverageFields; pendientes?: string[]
}, text: string, binding: string, input: { cursor?: string; limite?: number; localizador?: string }) {
  if (meta.formato === "desconocido")
    return { artefacto_id: meta.id, archivo: meta.archivo, vista: "linea",
      diagnostico: { tipo: "envoltorio_no_reconocido",
        detalle: "El formato conservado no coincide los contratos conocidos: no se genera vista derivada ni se interpreta undefined como ausencia; el original sigue disponible por lectura cruda paginada" },
      original: { disponible: true, lectura: "cruda", sha256: meta.sha256, bytes: meta.bytes,
        total_unidades: text.length } }
  const { lines } = lineIndex(text)
  if (input.localizador && input.cursor) throw new Error("Indica cursor o localizador, no ambos")
  const viewBinding = hash(JSON.stringify([binding, "linea"]))
  const from = input.localizador ? locatorLine(input.localizador, lines.length)
    : viewOffset(input.cursor, viewBinding, lines.length)
  const page = linePage(lines, from, input.limite ?? 4000)
  return { artefacto_id: meta.id, archivo: meta.archivo, vista: "linea",
    ...(meta.instantanea ? { instantanea: true } : {}),
    ...(meta.fuente ? { fuente: meta.fuente, corpus: meta.corpus, referencia: meta.referencia,
      representacion: meta.representacion } : {}),
    ...(meta.version ? { version: meta.version } : {}),
    ...(meta.cobertura_paginas ? { cobertura_paginas: meta.cobertura_paginas } : {}),
    ...(meta.cobertura_campos ? { cobertura_campos: meta.cobertura_campos } : {}),
    ...(meta.pendientes ? { pendientes: meta.pendientes } : {}),
    total_lineas: lines.length, total_unidades: text.length, lineas: page.page, lineas_unidades: page.units,
    ...(page.excede ? { excede_limite: true } : {}), cursor: nextViewCursor(viewBinding, page.next, lines.length) }
}


export async function sessionArtifacts(raw: ArtifactRequest, actor: Actor, options: Options): Promise<unknown> {
  const input = artifactRequest.parse(raw)
  const nodes = await chain(actor.sessionID, actor.messageID, options.get)
  const current = nodes.at(-1)!
  if (current.agent !== actor.agent) throw new Error("Lector del artefacto diferente")
  const settings = await readAgentSettings(options.settingsPath)
  checkReader(current, nodes, settings.agentes.investigador.especialistasPermitidos)
  // 8.4 share: the only write path of this tool, an explicit encargo-to-encargo
  // link. It requires managing both encargos, a matching corpus/referencia and an
  // intact blob; with saving off it returns exactly {guardado:false}.
  if (input.action === "share") {
    if (current.agent === "revisor") throw new Error("El Revisor consulta instantáneas; no comparte fuentes")
    if (!settings.agentes[agentNames[current.agent]].guardarEntregablesEnSesion) return { guardado: false }
    const { root, stateDir } = await stateLocation(nodes, options, true)
    return locked(join(stateDir, ".lock"), async () => {
      const state = await loadOrCreateState(root, stateDir, nodes[0], "encargo")
      const work = await authorizedWork(state, input.encargo_id, nodes, options)
      if (input.corpus !== work.corpus || input.referencia !== work.referencia)
        throw new Error("Corpus/referencia del encargo distintos")
      const originWork = await authorizedWork(state, input.origen_encargo_id, nodes, options)
      if (!(manages(work, current.id, state) && manages(originWork, current.id, state)))
        throw new Error("Solo quien gestiona ambos encargos comparte una instantánea")
      const snapshot = state.snapshots[input.instantanea_id]
      if (!snapshot || snapshot.workID !== originWork.id || snapshot.rootSessionID !== nodes[0].id)
        throw new Error("Instantánea ajena al encargo de origen o no registrada")
      if (snapshot.workID === work.id) throw new Error("La instantánea ya pertenece al encargo indicado")
      if (snapshot.corpus !== work.corpus || snapshot.referencia !== work.referencia)
        throw new Error("Corpus/referencia de la instantánea incompatibles con el encargo destino")
      // The blob is re-verified before the link is recorded: a link never shares
      // an original that no longer matches its hash.
      await sourceBlob(stateDir, snapshot)
      const already = snapshot.compartida_con?.includes(work.id) ?? false
      if (!already) {
        snapshot.compartida_con = [...(snapshot.compartida_con ?? []), work.id]
        await saveJson(join(stateDir, "state.json"), state)
      }
      return { guardado: true, instantanea_id: snapshot.id, encargo_id: work.id, origen_encargo_id: snapshot.workID,
        fuente: snapshot.fuente, ...(already ? { ya_compartida: true } : {}),
        contenido: { sha256: snapshot.contentSha256, bytes: snapshot.bytes } }
    })
  }
  const { root, stateDir } = await stateLocation(nodes, options, false)
  const state = await loadState(stateDir, false)
  const work = await authorizedWork(state, input.encargo_id, nodes, options)
  if (input.corpus !== work.corpus || input.referencia !== work.referencia) throw new Error("Corpus/referencia del encargo distintos")
  const sessionDir = await sessionDirectory(root, state)
  const accessible: Artifact[] = []
  for (const artifact of Object.values(state.artifacts))
    if (artifact.workID === work.id && await canReadArtifact(artifact, work, nodes, state, options)) accessible.push(artifact)
  accessible.sort((a, b) => a.id.localeCompare(b.id))
  // 8.4 bounded snapshot inventory: only this encargo's own and explicitly shared
  // snapshots, drawn by canReadSource — no global catalog, no arbitrary paths.
  const readable: Snapshot[] = []
  for (const snapshot of Object.values(state.snapshots))
    if (await canReadSource(snapshot, work, nodes, state, options)) readable.push(snapshot)
  readable.sort((a, b) => a.id.localeCompare(b.id))
  if (input.action === "list") {
    const limit = input.limite ?? 20
    if (limit > 100) throw new Error("Inventario: limite máximo 100")
    const binding = hash(JSON.stringify([actor.sessionID, work.id, "list",
      accessible.map(a => [a.id, a.manifestHash]), readable.map(s => [s.id, s.contentSha256])]))
    const total = Math.max(accessible.length, readable.length)
    const offset = pageOffset(input.cursor, binding, total)
    const page = accessible.slice(offset, offset + limit)
    const snapPage = readable.slice(offset, offset + limit)
    for (const artifact of page) await verifyArtifact(sessionDir, artifact, state)
    for (const snapshot of snapPage) await sourceBlob(stateDir!, snapshot)
    const consumed = offset + Math.max(page.length, snapPage.length)
    return { artefactos: page.map(artifact => {
      const operation = Object.values(state.operations).find(op => op.phase === "confirmed" && op.artifact.id === artifact.id)!
      return { ...artifact, operacion_id: operation.logicalID, fuentes: operation.sources, decisiones: operation.decisions, claves: operation.keys }
    }),
    // Coverage/version/pending are the producer's declarations; the content hash
    // is the runtime's verified receipt. Vigencia is not decided by date equality.
    instantaneas: snapPage.map(snapshot => ({
      id: snapshot.id, operacion_id: snapshot.operacion_id, fuente: snapshot.fuente, corpus: snapshot.corpus,
      referencia: snapshot.referencia, archivo: snapshot.archivo,
      productor: { sesion: snapshot.producerSessionID, agente: snapshot.agent,
        ...(snapshot.producerMessageID ? { mensaje: snapshot.producerMessageID } : {}) },
      representacion: snapshot.representacion, formato: snapshot.formato,
      contenido: { sha256: snapshot.contentSha256, bytes: snapshot.bytes },
      ...(snapshot.version ? { version: snapshot.version } : {}),
      ...(snapshot.cobertura_paginas ? { cobertura_paginas: snapshot.cobertura_paginas } : {}),
      ...(snapshot.cobertura_campos ? { cobertura_campos: snapshot.cobertura_campos } : {}),
      ...(snapshot.pendientes ? { pendientes: snapshot.pendientes } : {}),
      ...(snapshot.compartida_con?.length ? { compartida_con: snapshot.compartida_con } : {}),
      creado: snapshot.created,
    })), cursor: nextCursor(binding, consumed, total) }
  }
  const readResult = async (id: string, archivo: string, meta: {
    sha256: string; text: string; instantanea: boolean; extra?: Record<string, unknown> }) => {
    const binding = hash(JSON.stringify([actor.sessionID, work.id, id, archivo, meta.sha256]))
    if (input.localizador && input.cursor) throw new Error("Indica cursor o localizador, no ambos")
    const offset = input.localizador
      ? (() => {
        const { lines, starts } = lineIndex(meta.text)
        return starts[locatorLine(input.localizador!, lines.length)]
      })()
      : pageOffset(input.cursor, binding, meta.text.length)
    if (offset && /[\uDC00-\uDFFF]/.test(meta.text[offset]) && /[\uD800-\uDBFF]/.test(meta.text[offset - 1]))
      throw new Error("Cursor dentro de un carácter Unicode")
    let end = Math.min(offset + (input.limite ?? 4000), meta.text.length)
    if (end < meta.text.length && /[\uD800-\uDBFF]/.test(meta.text[end - 1]) && /[\uDC00-\uDFFF]/.test(meta.text[end])) end++
    return { artefacto_id: id, archivo, sha256: meta.sha256, inicio: offset, fin: end, total: meta.text.length,
      unidad: "UTF-16", contenido: meta.text.slice(offset, end), cursor: nextCursor(binding, end, meta.text.length),
      ...(meta.instantanea ? { instantanea: true } : {}), ...(meta.extra ?? {}) }
  }
  const artifact = accessible.find(a => a.id === input.artefacto_id)
  if (!artifact) {
    // Snapshots read through the same bounded contract: corpus/reference must
    // match, the blob is verified by hash and a known ID grants nothing alone.
    const snapshot = state.snapshots[input.artefacto_id]
    if (!snapshot || !await canReadSource(snapshot, work, nodes, state, options))
      throw new Error("Artefacto/archivo no asignado o no registrado")
    if (input.archivo !== snapshot.archivo) throw new Error("Artefacto/archivo no asignado o no registrado")
    const bytes = await sourceBlob(stateDir!, snapshot)
    const text = bytes.toString("utf8")
    const binding = hash(JSON.stringify([actor.sessionID, work.id, snapshot.id, snapshot.archivo, snapshot.contentSha256]))
    if (input.vista === "linea") return sourceView({ id: snapshot.id, archivo: snapshot.archivo, sha256: snapshot.contentSha256,
      bytes: snapshot.bytes, formato: snapshot.formato, instantanea: true, fuente: snapshot.fuente, corpus: snapshot.corpus,
      referencia: snapshot.referencia, representacion: snapshot.representacion, version: snapshot.version,
      cobertura_paginas: snapshot.cobertura_paginas, cobertura_campos: snapshot.cobertura_campos,
      pendientes: snapshot.pendientes }, text, binding, input)
    return readResult(input.artefacto_id, snapshot.archivo, { sha256: snapshot.contentSha256, text, instantanea: true,
      extra: { fuente: snapshot.fuente, corpus: snapshot.corpus, referencia: snapshot.referencia,
        representacion: snapshot.representacion, formato: snapshot.formato,
        ...(snapshot.version ? { version: snapshot.version } : {}),
        ...(snapshot.cobertura_paginas ? { cobertura_paginas: snapshot.cobertura_paginas } : {}),
        ...(snapshot.cobertura_campos ? { cobertura_campos: snapshot.cobertura_campos } : {}),
        ...(snapshot.pendientes ? { pendientes: snapshot.pendientes } : {}) } })
  }
  const file = artifact.files.find(f => f.path === input.archivo)
  if (!file) throw new Error("Artefacto/archivo no asignado o no registrado")
  await verifyArtifact(sessionDir, artifact, state)
  const path = join(sessionDir, file.path)
  await checkedFile(sessionDir, path)
  const bytes = await readFile(path)
  if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error("Contenido del artefacto modificado externamente")
  const text = bytes.toString("utf8")
  if (input.vista === "linea")
    return sourceView({ id: artifact.id, archivo: file.path, sha256: file.sha256, bytes: file.bytes,
      formato: "texto", instantanea: false },
      text, hash(JSON.stringify([actor.sessionID, work.id, artifact.id, file.path, file.sha256])), input)
  return readResult(input.artefacto_id, file.path, { sha256: file.sha256, text, instantanea: false })
}

// Append reviewer-authored reports to an existing, indexed delivery of its direct parent.
export async function publishReview(input: {
  sessionID: string; messageID?: string; delivery: string; sanity?: string; dispute?: string; operationID?: string; verdict?: Verdict
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
    if (artifact?.workID) {
      const work = await authorizedWork(state, artifact.workID, nodes, options)
      if (!work.reviews.some(r => r.sessionID === reviewer.id && r.artifactID === artifact.id))
        throw new Error("Revisión no asignada a la entrega exacta del encargo")
    }
    const verdict = input.verdict ? checkedVerdict(input.verdict) : undefined
    if (verdict && (!artifact || artifact.producerSessionID !== producer.id || artifact.agent !== producer.agent ||
        artifact.rootSessionID !== nodes[0].id || artifact.id !== verdict.artefacto_id || artifact.manifestHash !== verdict.hash_manifiesto))
      throw new Error("El dictamen no corresponde a la entrega/hash del productor autorizado")
    if (verdict && !input.sanity?.trim()) throw new Error("El dictamen estructurado requiere guardar el informe de sanidad en la misma operación")
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
      type: "write_review_documents", topic: reference, delivery: reference, files: Object.fromEntries(files), verdict,
      ...(artifact?.workID ? { workID: artifact.workID } : {}) }
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
