// Synthetic raster only: no OCR, external converter, image metadata or answer text.
import { crc32, deflateSync } from "node:zlib"

export const width = 480, height = 320
export const expected = { superiorIzquierda: "cuadrado rojo", superiorDerecha: "círculo azul",
  inferiorIzquierda: "triángulo verde", inferiorDerecha: "tres barras amarillas" }
export const question = "Describe las figuras, sus colores y su posición en los cuatro cuadrantes del adjunto. Si no puedes leerlo, identifica el límite; no deduzcas su contenido del nombre."

export function pixels() {
  const rows = Buffer.alloc(height * (1 + width * 3), 255)
  for (let y = 0; y < height; y++) {
    rows[y * (1 + width * 3)] = 0 // PNG filter: None
    for (let x = 0; x < width; x++) {
      let color
      if (x >= 60 && x < 160 && y >= 30 && y < 130) color = [220, 30, 40]
      if ((x - 350) ** 2 + (y - 80) ** 2 <= 50 ** 2) color = [25, 75, 220]
      if (y >= 190 && y < 280 && Math.abs(x - 110) <= (y - 190) * 0.6) color = [20, 160, 65]
      if (y >= 190 && y < 280 && [300, 340, 380].some(left => x >= left && x < left + 20)) color = [245, 195, 15]
      if (color) rows.set(color, y * (1 + width * 3) + 1 + x * 3)
    }
  }
  return rows
}

export function png() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), checksum = Buffer.alloc(4)
    size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([size, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels())), chunk("IEND", Buffer.alloc(0))])
}
