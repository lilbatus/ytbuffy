import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readUmpVarint, writeUmpVarint, writePart, readParts, createReader } from '../src/page/ump.js'
import { concat } from '../src/page/protobuf.js'

test('UMP varints round trip at every length boundary', () => {
  const values = [0, 127, 128, 16383, 16384, 2097151, 2097152, 268435455, 268435456, 2 ** 32 - 1]
  const lengths = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]
  values.forEach((value, index) => {
    const bytes = writeUmpVarint(value)
    assert.equal(bytes.length, lengths[index])
    assert.deepEqual(readUmpVarint(bytes, 0), { value, next: bytes.length })
  })
})

test('incomplete varints are reported as missing', () => {
  assert.equal(readUmpVarint(Uint8Array.of(0xc0, 0x01), 0), null)
  assert.equal(readUmpVarint(new Uint8Array(0), 0), null)
})

function sampleStream() {
  const big = new Uint8Array(70000).map((_, index) => index % 251)
  return {
    parts: [
      { type: 35, payload: Uint8Array.of(8, 1, 16, 2) },
      { type: 20, payload: Uint8Array.of(8, 0, 24, 248, 1) },
      { type: 21, payload: concat([Uint8Array.of(0), big]) },
      { type: 22, payload: Uint8Array.of(0) },
      { type: 300, payload: new Uint8Array(0) }
    ],
    bytes: concat([
      writePart(35, Uint8Array.of(8, 1, 16, 2)),
      writePart(20, Uint8Array.of(8, 0, 24, 248, 1)),
      writePart(21, concat([Uint8Array.of(0), big])),
      writePart(22, Uint8Array.of(0)),
      writePart(300, new Uint8Array(0))
    ])
  }
}

test('readParts splits a complete response into parts', () => {
  const { parts, bytes } = sampleStream()
  assert.deepEqual(readParts(bytes), parts)
})

test('readParts ignores a truncated last part', () => {
  const { parts, bytes } = sampleStream()
  assert.deepEqual(readParts(bytes.subarray(0, bytes.length - 3)), parts.slice(0, 4))
  assert.deepEqual(readParts(bytes.subarray(0, bytes.length - 4)), parts.slice(0, 3))
})

test('the streaming reader gives the same parts for any chunking', () => {
  const { parts, bytes } = sampleStream()
  const cuts = [1, 2, 3, 7, 64, 1000, 4096, 69999]
  for (const size of cuts) {
    const seen = []
    const reader = createReader((type, payload) => seen.push({ type, payload: payload.slice() }))
    for (let offset = 0; offset < bytes.length; offset += size) reader.push(bytes.subarray(offset, offset + size))
    assert.deepEqual(seen, parts, `chunk size ${size}`)
    assert.equal(reader.rest().length, 0)
  }
})

test('the streaming reader handles a split at every single byte of the headers', () => {
  const { parts, bytes } = sampleStream()
  for (let cut = 1; cut < 40; cut++) {
    const seen = []
    const reader = createReader((type, payload) => seen.push({ type, payload: payload.slice() }))
    reader.push(bytes.subarray(0, cut))
    reader.push(bytes.subarray(cut))
    assert.deepEqual(seen, parts, `cut at ${cut}`)
  }
})

test('leftover bytes are kept for passthrough', () => {
  const reader = createReader(() => {})
  reader.push(Uint8Array.of(21, 10, 1, 2))
  assert.deepEqual(reader.rest(), Uint8Array.of(21, 10, 1, 2))
})
