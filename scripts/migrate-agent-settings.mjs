import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"

const renamed = { coordinador: "investigador", codigo: "lector-codigo", documentacion: "lector-documentacion", refinamiento: "refinador" }

export function migrateSettings(value, validate) {
  const next = structuredClone(value)
  const agents = next?.agentes
  if (agents && typeof agents === "object" && !Array.isArray(agents)) {
    for (const key of ["coordinador", "investigador"]) {
      const permitted = agents[key]?.especialistasPermitidos
      if (Array.isArray(permitted)) agents[key].especialistasPermitidos = permitted.map(name => renamed[name] ?? name)
    }
    for (const [old, current] of Object.entries(renamed)) {
      if (!Object.hasOwn(agents, old)) continue
      if (Object.hasOwn(agents, current) && !isDeepStrictEqual(agents[old], agents[current]))
        throw new Error(`Conflicto de configuración: agentes.${old} y agentes.${current} tienen valores incompatibles: ${JSON.stringify(agents[old])} / ${JSON.stringify(agents[current])}. Conserva un único valor confirmado y repite la instalación.`)
      agents[current] = agents[old]
      delete agents[old]
    }
  }
  validate(next)
  return next
}

export async function migrateAgentSettings(path, validate) {
  for (let attempt = 0; ; attempt++) {
    try { await mkdir(`${path}.lock`); break }
    catch (error) {
      if (error.code !== "EEXIST" || attempt === 99) throw error
      await new Promise(done => setTimeout(done, 50))
    }
  }
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    const original = await readFile(path, "utf8")
    const value = JSON.parse(original)
    const next = migrateSettings(value, validate)
    if (isDeepStrictEqual(value, next)) return false
    await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" })
    if (await readFile(path, "utf8") !== original) throw new Error("La configuración cambió durante la migración")
    await rename(temp, path)
    return true
  } finally {
    await rm(temp, { force: true })
    await rm(`${path}.lock`, { recursive: true, force: true })
  }
}
