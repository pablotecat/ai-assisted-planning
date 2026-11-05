// Deterministic S09 batch/reuse fixture (9.2/9.3). It models the documented
// attachment contract of lectura-documental/references/adjuntos.md against a
// simulated Code Mode runtime. It is a control check, not evidence of model
// conduct or of a real remote download.
import { crc32, deflateSync } from "node:zlib"

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), checksum = Buffer.alloc(4)
  size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([size, body, checksum])
}

// Minimal valid PNG so every batch member has its own byte-distinct content.
export function tinyPng(index = 0) {
  const width = 8, height = 8, rows = Buffer.alloc(height * (1 + width * 3))
  const color = [(index * 53 + 40) % 251, (index * 97 + 10) % 251, (index * 151 + 200) % 251]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set(color, y * (1 + width * 3) + 1 + x * 3)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))])
}

// Simulated V2 Code Mode runtime, matching the verified contract: fetch offers
// bytes() and Uint8Array.toBase64(); arrayBuffer is absent unless requested.
export function simulatedRuntime(assets) {
  const trace = { downloads: [], methodCalls: [] }
  const status = new Map()
  const fetch = async url => {
    trace.downloads.push(url)
    if (status.get(url) === 410 || !(url in assets)) return { ok: false, status: status.get(url) ?? 404 }
    const bytes = assets[url]
    return {
      ok: true, status: 200,
      bytes: async () => {
        trace.methodCalls.push({ url, method: "bytes" })
        const value = new Uint8Array(bytes)
        value.toBase64 = () => bytes.toString("base64")
        return value
      },
      ...(status.has("arrayBuffer:" + url) ? {
        arrayBuffer: async () => {
          trace.methodCalls.push({ url, method: "arrayBuffer" })
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        }
      } : {}),
    }
  }
  return { fetch, trace, expire: url => status.set(url, 410), renew: url => status.delete(url), offerArrayBuffer: url => status.set("arrayBuffer:" + url, true) }
}

// Documented batch barrier: probe the first attachment, correct an absent
// method exactly once, validate the alternative on the same attachment and
// extend the validated method to the rest without repeating the failure.
export async function batchBarrier(runtime, list, { primary = "arrayBuffer" } = {}) {
  const state = { method: primary, corrections: 0, methodFailures: [], results: [], pendientes: [] }
  async function extract(url, response, method) {
    if (method === "arrayBuffer") {
      runtime.trace.methodCalls.push({ url, method })
      if (typeof response.arrayBuffer !== "function") throw new TypeError("r.arrayBuffer is not a function")
      return Buffer.from(await response.arrayBuffer()).toString("base64")
    }
    const raw = await response.bytes()
    return raw.toBase64()
  }
  for (const url of list) {
    const response = await runtime.fetch(url)
    if (!response.ok) { state.pendientes.push({ url, etapa: "descargar", estado: response.status }); continue }
    try {
      state.results.push({ url, method: state.method, base64: await extract(url, response, state.method) })
    } catch (failure) {
      state.methodFailures.push({ url, method: state.method, error: failure.message })
      if (state.corrections >= 1 || state.method !== primary) throw new Error(`Fallo de método repetido en ${url}: ${failure.message}`)
      state.method = state.method === "arrayBuffer" ? "bytes" : "arrayBuffer"; state.corrections++
      state.results.push({ url, method: state.method, base64: await extract(url, response, state.method) })
    }
  }
  return state
}

// Documented obtain-stage decision (adjuntos.md 1–2): reuse a valid accessible
// copy even with an expired URL; register the cause of any new download; an
// ID, path or hash alone never grants access.
export function downloadDecision({ copia = "ausente", url = "valida", autorizado = true, version, alcance }) {
  if (!autorizado) return { accion: "rechazar", causa: "sin_acceso_autorizado" }
  if (copia === "alterada") return { accion: "nueva_descarga", causa: "copia_alterada" }
  if (version === "distinta") return { accion: "nueva_descarga", causa: "version_distinta" }
  if (alcance === "ampliado") return { accion: "nueva_descarga", causa: "cambio_de_alcance" }
  if (copia === "valida") return { accion: "reutilizar_copia" }
  if (url === "caducada") return { accion: "recuperar_localizador", causa: "url_caducada_sin_copia" }
  return { accion: "nueva_descarga", causa: "sin_copia_registrada" }
}
