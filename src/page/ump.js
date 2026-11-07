import { concat } from './protobuf.js'

export function readUmpVarint(bytes, pos) {
  if (pos >= bytes.length) return null
  const first = bytes[pos]
  const length = first < 128 ? 1 : first < 192 ? 2 : first < 224 ? 3 : first < 240 ? 4 : 5
  if (pos + length > bytes.length) return null
  let value
  if (length === 1) value = first
  else if (length === 2) value = (first & 0x3f) + bytes[pos + 1] * 64
  else if (length === 3) value = (first & 0x1f) + bytes[pos + 1] * 32 + bytes[pos + 2] * 8192
  else if (length === 4) value = (first & 0x0f) + bytes[pos + 1] * 16 + bytes[pos + 2] * 4096 + bytes[pos + 3] * 1048576
  else value = bytes[pos + 1] + bytes[pos + 2] * 256 + bytes[pos + 3] * 65536 + bytes[pos + 4] * 16777216
  return { value, next: pos + length }
}

export function writeUmpVarint(value) {
  if (value < 128) return Uint8Array.of(value)
  if (value < 16384) return Uint8Array.of((value & 0x3f) | 0x80, value >> 6)
  if (value < 2097152) return Uint8Array.of((value & 0x1f) | 0xc0, (value >> 5) & 0xff, value >> 13)
  if (value < 268435456) return Uint8Array.of((value & 0x0f) | 0xe0, (value >> 4) & 0xff, (value >> 12) & 0xff, value >> 20)
  const out = new Uint8Array(5)
  out[0] = 0xf0
  new DataView(out.buffer).setUint32(1, value, true)
  return out
}

export function partHeader(type, size) {
  return concat([writeUmpVarint(type), writeUmpVarint(size)])
}

export function writePart(type, payload) {
  return concat([partHeader(type, payload.length), payload])
}

export function readParts(bytes) {
  const parts = []
  let pos = 0
  for (;;) {
    const type = readUmpVarint(bytes, pos)
    const size = type && readUmpVarint(bytes, type.next)
    if (!size || size.next + size.value > bytes.length) return parts
    parts.push({ type: type.value, payload: bytes.subarray(size.next, size.next + size.value) })
    pos = size.next + size.value
  }
}

export function createReader(onPart) {
  let chunks = []
  let total = 0
  let need = 1

  function push(chunk) {
    if (!chunk.length) return
    chunks.push(chunk)
    total += chunk.length
    if (total < need) return
    const buffer = chunks.length === 1 ? chunks[0] : concat(chunks)
    let pos = 0
    need = 1
    for (;;) {
      const type = readUmpVarint(buffer, pos)
      const size = type && readUmpVarint(buffer, type.next)
      if (!size) {
        need = buffer.length - pos + 1
        break
      }
      const end = size.next + size.value
      if (end > buffer.length) {
        need = end - pos
        break
      }
      onPart(type.value, buffer.subarray(size.next, end))
      pos = end
    }
    const rest = buffer.subarray(pos)
    chunks = rest.length ? [rest] : []
    total = rest.length
    if (!rest.length) need = 1
  }

  function rest() {
    return concat(chunks)
  }

  return { push, rest }
}
