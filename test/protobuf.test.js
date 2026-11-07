import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readVarint, writeVarint, decode, encode, replace, makeVarint, makeBytes, makeString, makeMessage,
  readInt, readString, readMessage, readPacked, concat
} from '../src/page/protobuf.js'

test('varints survive a round trip, including values above 32 bits', () => {
  for (const value of [0, 1, 127, 128, 300, 16383, 16384, 2 ** 31, 2 ** 32 + 5, 2 ** 40, 1696451837271390]) {
    const bytes = writeVarint(value)
    assert.deepEqual(readVarint(bytes, 0), [value, bytes.length])
  }
})

test('unchanged fields keep their exact bytes after re-encoding', () => {
  const original = encode([
    makeVarint(1, 42),
    makeString(2, 'hello'),
    { number: 3, type: 5, value: Uint8Array.of(1, 2, 3, 4) },
    makeMessage(4, [makeVarint(1, 7), makeVarint(99, 2 ** 45)])
  ])
  const unknownTail = Uint8Array.of(0xf8, 0x3e, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01)
  const message = concat([original, unknownTail])
  assert.deepEqual(encode(decode(message)), message)
})

test('replace swaps a field in place and removes duplicates', () => {
  const fields = decode(encode([makeVarint(1, 1), makeVarint(2, 2), makeVarint(2, 3), makeVarint(3, 4)]))
  const replaced = replace(fields, 2, makeVarint(2, 9))
  assert.deepEqual(replaced.map(field => [field.number, field.value]), [[1, 1], [2, 9], [3, 4]])
  const removed = replace(fields, 2, [])
  assert.deepEqual(removed.map(field => field.number), [1, 3])
  const appended = replace(fields, 7, makeBytes(7, Uint8Array.of(5)))
  assert.equal(appended[appended.length - 1].number, 7)
})

test('readers return typed values and tolerate missing fields', () => {
  const fields = decode(encode([makeVarint(1, 5), makeString(2, 'abc'), makeMessage(3, [makeVarint(1, 8)])]))
  assert.equal(readInt(fields, 1), 5)
  assert.equal(readInt(fields, 9), 0)
  assert.equal(readString(fields, 2), 'abc')
  assert.equal(readString(fields, 9), '')
  assert.equal(readInt(readMessage(fields, 3), 1), 8)
  assert.deepEqual(readMessage(fields, 9), [])
})

test('packed and unpacked repeated varints read the same', () => {
  const packed = decode(encode([makeBytes(1, concat([writeVarint(3), writeVarint(300)]))]))
  const unpacked = decode(encode([makeVarint(1, 3), makeVarint(1, 300)]))
  assert.deepEqual(readPacked(packed, 1), [3, 300])
  assert.deepEqual(readPacked(unpacked, 1), [3, 300])
})

test('truncated input throws instead of returning garbage', () => {
  assert.throws(() => decode(Uint8Array.of(0x0a, 0x05, 0x01)))
  assert.throws(() => readVarint(Uint8Array.of(0x80), 0))
})
