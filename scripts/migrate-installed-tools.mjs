import { createHash } from "node:crypto"
import { readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

const hash = text => createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex")
const legacyHash = "6b0f049d90ec09985703c1868d8b99c21aefac7253983be6a788c49613090957"
async function optional(path) {
  try { return await readFile(path, "utf8") }
  catch (error) { if (error.code !== "ENOENT") throw error }
}

export async function prepareInstalledTools(source, configDir) {
  const manifestPath = join(configDir, "ai-assisted-planning-install.json")
  const manifest = JSON.parse(await optional(manifestPath) ?? "{}")
  const name = "investigator_defaults.ts"
  const current = await optional(join(configDir, "tools", name))
  const expected = hash(await readFile(join(source, "tools", name), "utf8"))
  if (current !== undefined && hash(current) !== expected && hash(current) !== manifest[name])
    throw new Error(`Colisión con herramienta personalizada: ${join(configDir, "tools", name)}. Conserva o renombra el archivo antes de repetir la instalación.`)
  const legacyPath = join(configDir, "tools", "coordinator_defaults.ts")
  const legacy = await optional(legacyPath)
  if (legacy !== undefined) {
    if (hash(legacy) === legacyHash) await rm(legacyPath)
    else console.log(`Se conserva la herramienta personalizada ${legacyPath}; revisa su nombre antes de usarla.`)
  }
  return async () => {
    const text = JSON.stringify({ [name]: expected }, null, 2) + "\n"
    if (await optional(manifestPath) !== text) await writeFile(manifestPath, text)
  }
}
