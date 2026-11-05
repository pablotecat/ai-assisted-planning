import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { readAgentSettings } from "./tools/agent_settings.ts"
import { captureSource, sessionArtifacts, sessionWork, type Identity } from "./tools/session_store.ts"
import { nativeArtifactContent } from "./tools/session_artifacts.ts"
import { sourcePng } from "./tools/source_media.ts"
import { captureRequest } from "./tools/capture_agent_source.ts"
import { png } from "./test-support/attachments/data.mjs"

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")

test("S09 transporte: solo PNG íntegro y base64 canónico; no convierte texto, rutas ni otros formatos", () => {
  const bytes = png(), base64 = bytes.toString("base64")
  assert.deepEqual(sourcePng(base64), bytes)
  for (const value of [undefined, {}, [], "", "file:///attachment.png", "data:image/png;base64," + base64,
    base64 + "\n", bytes.subarray(0, bytes.length - 1).toString("base64"), Buffer.from("not an image").toString("base64")])
    assert.throws(() => sourcePng(value), /PNG/)
  const altered = Buffer.from(bytes); altered[45] ^= 1
  assert.throws(() => sourcePng(altered.toString("base64")), /CRC/)
})

test("S09 registro: binario por hash, presentación nativa y reutilización autorizada sin nueva descarga; guardado:false intacto", async () => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s09-store-"))
  const settingsPath = join(root, "settings.json"), directory = join(root, "project")
  const nodes: Record<string, Identity> = Object.fromEntries([
    ["i", "investigador", undefined], ["docs", "lector-documentacion", "i"], ["other", "lector-documentacion", "i"],
  ].map(([id, agent, parentID]) => [id!, { id: id!, agent: agent!, ...(parentID ? { parentID } : {}), directory, title: "PNG", created: 1 }]))
  const options = { root: join(root, "sessions"), settingsPath, get: async (id: string) => nodes[id] }
  const actor = (id: string) => ({ sessionID: id, agent: nodes[id].agent })
  const settings = await readAgentSettings(settingsPath)
  const work: any = await sessionWork({ action: "create", pregunta: "Leer adjunto", criterios: [], corpus: "fixture",
    referencia: "v1", responsable_session_id: "docs" }, actor("i"), options)
  const base = { encargo_id: work.encargo.id, corpus: "fixture", referencia: "v1" }
  const input = { ...base, fuente: "APP-9:attachment:1", operacion_id: "png-1", representacion: "png_base64" as const,
    resultado: png().toString("base64"), pendientes: ["lectura visual"] }
  assert.deepEqual(captureRequest.parse(input), input)
  assert.throws(() => captureRequest.parse({ ...input, destino: "attachment.png" }), /Unrecognized/)
  const captured: any = await captureSource(input, actor("docs"), options)
  assert.equal(captured.contenido.sha256, hash(png()))
  assert.equal(captured.contenido.bytes, png().length)
  assert.equal(captured.formato, "image/png"); assert.match(captured.archivo, /\.png$/)
  assert.deepEqual(await captureSource(input, actor("docs"), options), captured)
  const request = { ...base, action: "read" as const, artefacto_id: captured.instantanea_id, archivo: captured.archivo }
  const original: any = await sessionArtifacts(request, actor("docs"), options)
  assert.equal(original.media.uri, "data:image/png;base64," + input.resultado)
  const content: any = nativeArtifactContent(JSON.stringify(original))
  assert.equal(content[1].type, "file"); assert.equal(content[1].mime, "image/png")
  assert.deepEqual(Buffer.from(content[1].uri.split(",")[1], "base64"), png())
  assert.equal(JSON.parse(content[0].text).lectura_visual, "no_acreditada")
  assert.ok(!content[0].text.includes(input.resultado), "Metadata must not repeat the binary as text")
  assert.equal(nativeArtifactContent('{"artefactos":[]}'), '{"artefactos":[]}')
  assert.deepEqual(await sessionArtifacts(request, actor("docs"), options), original, "Original válido se reutiliza aun cuando no se consulta la URL")
  for (const extra of [{ corpus: "other" }, { referencia: "v2" }, { archivo: "../attachment.png" },
    { vista: "linea" }, { cursor: "arbitrary" }, { limite: 10 }])
    await assert.rejects(sessionArtifacts({ ...request, ...extra } as never, actor("docs"), options))
  await assert.rejects(sessionArtifacts(request, actor("other"), options), /no asignado/)
  await assert.rejects(sessionArtifacts(request, actor("i"), options), /no asignado/, "El Investigador no adquiere fuentes locales crudas del lector")
  const files = await readdir(options.root, { recursive: true })
  const state = files.find(path => path.endsWith("state.json"))!
  const statePath = join(options.root, state), before = await readFile(statePath)
  settings.agentes["lector-documentacion"].guardarEntregablesEnSesion = false
  await writeFile(settingsPath, JSON.stringify(settings))
  assert.deepEqual(await captureSource({ ...input, operacion_id: "off" }, actor("docs"), options), { guardado: false })
  assert.deepEqual(await readdir(options.root, { recursive: true }), files)
  assert.deepEqual(await readFile(statePath), before)
  assert.deepEqual(await sessionArtifacts(request, actor("docs"), options), original)
  const blobPath = join(options.root, files.find(path => path.endsWith(captured.contenido.sha256))!)
  await writeFile(blobPath, Buffer.from("altered"))
  await assert.rejects(sessionArtifacts(request, actor("docs"), options), /modificado externamente/)
})
