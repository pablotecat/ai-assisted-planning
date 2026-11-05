import { crc32 } from "node:zlib"

// Transport decoding, not visual reading. Only the PNG branch required by S09.
export function sourcePng(value: unknown): Buffer {
  if (typeof value !== "string" || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error("PNG: se requiere base64 íntegro, no una ruta ni un objeto")
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw new Error("PNG: base64 o firma inválidos")
  let offset = 8, first = true, image = false, ended = false
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size
    if (end > bytes.length) throw new Error("PNG: contenido truncado")
    const body = bytes.subarray(offset + 4, end - 4), type = body.subarray(0, 4).toString("ascii")
    if (crc32(body) !== bytes.readUInt32BE(end - 4)) throw new Error("PNG: CRC incorrecto")
    if (first && (type !== "IHDR" || size !== 13 || !bytes.readUInt32BE(offset + 8) || !bytes.readUInt32BE(offset + 12)))
      throw new Error("PNG: cabecera inválida")
    first = false; image ||= type === "IDAT"; offset = end
    if (type === "IEND") { ended = size === 0 && offset === bytes.length; break }
  }
  if (!image || !ended) throw new Error("PNG: imagen incompleta")
  return bytes
}
