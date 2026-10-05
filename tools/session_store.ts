import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path"
import { readAgentSettings, sessionRoot, type AgentName } from "./agent_settings.ts"

export type Identity = { id: string; parentID?: string; agent: string; title: string; created: number; directory: string }
export type Resolver = (id: string, messageID?: string) => Promise<Identity>
let resolver: Resolver | undefined
export function setSessionResolver(value: Resolver) { resolver = value }

const agentNames: Record<string, AgentName> = {
  "agente-planificador": "planificador", "agente-refinamiento": "refinamiento",
  "agente-coordinador": "coordinador", "agente-codigo": "codigo", "agente-documentacion": "documentacion",
  "agente-revisor": "revisor",
}
const childOf: Record<AgentName, AgentName[]> = {
  planificador: [], refinamiento: ["planificador"], coordinador: ["refinamiento"],
  codigo: ["coordinador"], documentacion: ["coordinador", "documentacion"],
  revisor: ["planificador", "refinamiento", "coordinador", "codigo", "documentacion"],
}
type Entry = { parent?: string; agent: AgentName; folder: string }
type State = { root: string; entries: Record<string, Entry>; deliveries: string[]; sources: string[]; decisions: string[]; keys: string[] }

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
  return `${stamp}__${agent === "planificador" ? "planificacion" : "consulta"}__${slug(title)}`
}
async function chain(id: string, messageID: string | undefined, get: Resolver) {
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
  for (let i = 1; i < nodes.length; i++) {
    if (!childOf[agentNames[nodes[i].agent]].includes(agentNames[nodes[i - 1].agent]))
      throw new Error("Delegación no autorizada")
  }
  return nodes
}

async function locked<T>(path: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(path)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 99) throw error
      await new Promise((done) => setTimeout(done, 50))
    }
  }
  try { return await fn() } finally { await rm(path, { recursive: true, force: true }) }
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

export type Publication = { guardado: false } | { guardado: true; rutas: Record<string, string>; sesion: string }

// This contract has no model-supplied directory: only a trusted harness resolver assigns ownership.
export async function publishSession(input: {
  sessionID: string; messageID?: string; agent: string; topic: string;
  files: Record<string, string>; group?: string; sources?: string[]; decisions?: string[]; keys?: string[]
}, options: { get?: Resolver; root?: string; settingsPath?: string } = {}): Promise<Publication> {
  const names = Object.keys(input.files)
  if (!names.length || names.some((name) => !input.files[name]?.trim())) throw new Error("Entregables vacíos")
  names.forEach(safeName)
  if (input.group && input.group !== "Originales" && !/^[a-z][a-z0-9-]*$/.test(input.group)) throw new Error("Grupo no permitido")
  if (input.group === "Originales" && input.agent !== "agente-planificador") throw new Error("Solo el planificador puede publicar originales")
  const nodes = await chain(input.sessionID, input.messageID, options.get ?? resolver ?? (() => { throw new Error("Adaptador de sesión no disponible") }))
  if (nodes.at(-1)!.agent !== input.agent) throw new Error("Autor de publicación diferente")
  const settings = await readAgentSettings(options.settingsPath)
  if (!settings.agentes[agentNames[input.agent]].guardarEntregablesEnSesion) return { guardado: false }
  if (input.agent === "agente-codigo" && !settings.agentes.coordinador.especialistasPermitidos.includes("codigo") && nodes.length > 1)
    throw new Error("Especialista deshabilitado")
  if (input.agent === "agente-documentacion" && !settings.agentes.coordinador.especialistasPermitidos.includes("documentacion") && nodes.some((n) => n.agent === "agente-coordinador"))
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
      if ((await lstat(stateFile)).isSymbolicLink()) throw new Error("Estado de sesión enlazado")
      state = JSON.parse(await readFile(stateFile, "utf8")) as State
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
      state = { root: rootFolder, entries: {}, deliveries: [], sources: [], decisions: [], keys: [] }
      await saveJson(stateFile, state)
    }
    if (basename(state.root) !== state.root || state.root === "." || state.root === "..") throw new Error("Raíz de sesión inválida")
    const sessionDir = join(root, state.root)
    within(root, sessionDir)
    await checkExistingAncestors(sessionDir)
    await directory(sessionDir)
    state.sources ??= []
    state.decisions ??= []
    state.keys ??= []
    const previous = structuredClone(state)
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
    let staging: string | undefined
    let committed = false
    try {
      if (input.group) {
        staging = join(owner, `.pendiente-${randomUUID()}`)
        await mkdir(staging)
        for (const name of names) {
          await writeFile(join(staging, name), input.files[name], { flag: "wx" })
          paths[name] = join(target, name)
        }
        try {
          await lstat(target)
          throw new Error("La entrega ya existe")
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        await rename(staging, target)
        committed = true
        staging = undefined
      } else {
        for (const name of names) {
          const version = String(state.deliveries.filter((d) => d.startsWith(`${relativeOwner}/`)).length + 1).padStart(2, "0")
          const path = join(owner, `${version}-${name}`)
          await writeFile(path, input.files[name], { flag: "wx" })
          paths[name] = path
          state.deliveries.push(`${relativeOwner}/${version}-${name}`)
        }
      }
      if (input.group) state.deliveries.push(`${relativeOwner}/${basename(target)}`)
      const add = (field: "sources" | "decisions" | "keys", items: string[] = []) => {
        for (const item of items) {
          const text = item.replace(/[\r\n]+/g, " ").trim().slice(0, 300)
          if (text && !state[field].includes(text)) state[field].push(text)
        }
      }
      add("keys", input.keys)
      add("sources", input.sources)
      add("decisions", input.decisions)
      const index = ["# Encargo", "", `**Tema:** ${(nodes[0].title || input.topic).replace(/[\r\n]+/g, " ")}`, `**Claves:** ${state.keys.join(", ") || "No indicadas"}`,
        `**Estado:** entregables publicados`, "", "## Fuentes consultadas", ...state.sources.map((s) => `- ${s}`),
        "", "## Decisiones relevantes", ...state.decisions.map((d) => `- ${d}`),
        "", "## Entregas", ...state.deliveries.map((d) => `- [${d}](./${d})`), ""].join("\n")
      await saveJson(stateFile, state)
      const indexPath = join(sessionDir, "indice.md")
      try {
        if ((await lstat(indexPath)).isSymbolicLink()) throw new Error("Índice enlazado fuera de la sesión")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      const tempIndex = join(stateDir, `indice-${randomUUID()}.tmp`)
      try {
        await writeFile(tempIndex, index, { flag: "wx" })
        await replaceFile(tempIndex, indexPath)
      } finally { await rm(tempIndex, { force: true }) }
    } catch (error) {
      if (staging) await rm(staging, { recursive: true, force: true })
      if (input.group && committed) await rm(target, { recursive: true, force: true })
      if (!input.group) for (const path of Object.values(paths)) await rm(path, { force: true })
      await saveJson(stateFile, previous)
      throw error
    }
    return { guardado: true, rutas: paths, sesion: sessionDir }
  })
}

// Append reviewer-authored reports to an existing, indexed delivery of its direct parent.
export async function publishReview(input: {
  sessionID: string; messageID?: string; delivery: string; sanity?: string; dispute?: string
}, options: { get?: Resolver; root?: string; settingsPath?: string } = {}): Promise<Publication> {
  if (!input.sanity?.trim() && !input.dispute?.trim()) throw new Error("Documento de revisión vacío")
  const nodes = await chain(input.sessionID, input.messageID, options.get ?? resolver ?? (() => { throw new Error("Adaptador de sesión no disponible") }))
  const reviewer = nodes.at(-1)!
  const producer = nodes.at(-2)
  if (reviewer.agent !== "agente-revisor" || !producer) throw new Error("Revisor delegado por un productor requerido")
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
    const stateFile = join(stateDir, "state.json")
    if ((await lstat(stateFile)).isSymbolicLink()) throw new Error("Estado de sesión enlazado")
    const state = JSON.parse(await readFile(stateFile, "utf8")) as State
    if (basename(state.root) !== state.root || state.root === "." || state.root === "..") throw new Error("Raíz de sesión inválida")
    const sessionDir = join(root, state.root)
    within(root, sessionDir)
    await checkExistingAncestors(sessionDir)
    await directory(sessionDir)
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
    try {
      for (const [name, content] of files) {
        const path = join(folder, safeName(name))
        await writeFile(path, content, { flag: "wx" })
        paths[name] = path
      }
    } catch (error) {
      for (const path of Object.values(paths)) await rm(path, { force: true })
      throw error
    }
    return { guardado: true, rutas: paths, sesion: sessionDir }
  })
}
