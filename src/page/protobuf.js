const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const EMPTY = new Uint8Array(0)

export function readVarint(bytes, pos) {
  let value = 0
  let scale = 1
  for (;;) {
    if (pos >= bytes.length) throw new RangeError('Truncated varint')
    const byte = bytes[pos++]
    value += (byte & 0x7f) * scale
    if (byte < 0x80) return [value, pos]
    scale *= 128
  }
}

export function writeVarint(value) {
  const out = []
  let rest = value
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80)
    rest = Math.floor(rest / 0x80)
  }
  out.push(rest)
  return Uint8Array.from(out)
}

export function concat(chunks) {
  let length = 0
  for (const chunk of chunks) length += chunk.length
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function decode(bytes) {
  const fields = []
  let pos = 0
  while (pos < bytes.length) {
    const start = pos
    const [key, afterKey] = readVarint(bytes, pos)
    const number = Math.floor(key / 8)
    const type = key % 8
    let value
    pos = afterKey
    if (type === 0) {
      [value, pos] = readVarint(bytes, pos)
    } else if (type === 2) {
      const [length, afterLength] = readVarint(bytes, pos)
      pos = afterLength + length
      value = bytes.subarray(afterLength, pos)
    } else if (type === 1 || type === 5) {
      const size = type === 1 ? 8 : 4
      value = bytes.subarray(pos, pos + size)
      pos += size
    } else {
      throw new RangeError(`Unsupported wire type ${type}`)
    }
    if (pos > bytes.length) throw new RangeError('Truncated field')
    fields.push({ number, type, value, raw: bytes.subarray(start, pos) })
  }
  return fields
}

export function encode(fields) {
  return concat(fields.map(field => field.raw || encodeField(field)))
}

function encodeField({ number, type, value }) {
  const key = writeVarint(number * 8 + type)
  if (type === 0) return concat([key, writeVarint(value)])
  if (type === 2) return concat([key, writeVarint(value.length), value])
  return concat([key, value])
}

export function makeVarint(number, value) {
  return { number, type: 0, value }
}

export function makeBytes(number, value) {
  return { number, type: 2, value }
}

export function makeString(number, text) {
  return makeBytes(number, encoder.encode(text))
}

export function makeMessage(number, fields) {
  return makeBytes(number, encode(fields))
}

export function find(fields, number) {
  return fields.find(field => field.number === number)
}

export function findAll(fields, number) {
  return fields.filter(field => field.number === number)
}

export function readInt(fields, number) {
  const field = find(fields, number)
  return field && field.type === 0 ? field.value : 0
}

export function readBytes(fields, number) {
  const field = find(fields, number)
  return field && field.type === 2 ? field.value : null
}

export function readString(fields, number) {
  const value = readBytes(fields, number)
  return value ? decoder.decode(value) : ''
}

export function readMessage(fields, number) {
  return decode(readBytes(fields, number) || EMPTY)
}

export function readPacked(fields, number) {
  const values = []
  for (const field of findAll(fields, number)) {
    if (field.type === 0) {
      values.push(field.value)
      continue
    }
    for (let pos = 0; pos < field.value.length;) {
      const [value, next] = readVarint(field.value, pos)
      values.push(value)
      pos = next
    }
  }
  return values
}

export function replace(fields, number, replacement) {
  const items = Array.isArray(replacement) ? replacement : [replacement]
  const index = fields.findIndex(field => field.number === number)
  const rest = fields.filter(field => field.number !== number)
  if (index === -1) return [...rest, ...items]
  return [...rest.slice(0, index), ...items, ...rest.slice(index)]
}
