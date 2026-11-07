import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache, intersect } from '../src/page/cache.js'
import { formatKey } from '../src/page/sabr.js'

const video = { itag: 248, lmt: 1, xtags: '' }
const audio = { itag: 251, lmt: 2, xtags: '' }
const VIDEO = formatKey(video)
const AUDIO = formatKey(audio)

function header(format, segment, durationMs = 2000) {
  return { format, segment, isInit: false, startMs: (segment - 1) * durationMs, durationMs, videoId: 'v' }
}

function fill(cache, format, numbers, durationMs = 2000, id = 'v') {
  for (const number of numbers) cache.add(id, header(format, number, durationMs), new Uint8Array(10), new Uint8Array(100))
}

test('segments are stored once and counted in bytes', () => {
  const cache = createCache()
  fill(cache, video, [1, 2, 3])
  fill(cache, video, [2])
  cache.add('v', { ...header(video, 0), isInit: true }, new Uint8Array(5), new Uint8Array(50))
  assert.equal(cache.bytes, 3 * 110 + 55)
  assert.equal(cache.owner(VIDEO), 'v')
  assert.equal(cache.find('v', VIDEO).init.data.length, 50)
})

test('segments without a duration are skipped', () => {
  const cache = createCache()
  assert.equal(cache.add('v', { ...header(video, 1), durationMs: 0 }, new Uint8Array(1), new Uint8Array(1)), false)
  assert.equal(cache.bytes, 0)
})

test('runs stop at the first gap', () => {
  const cache = createCache()
  fill(cache, video, [1, 2, 4, 5, 6])
  assert.deepEqual(cache.run('v', VIDEO, 1), { first: 1, last: 2, startMs: 0, endMs: 4000 })
  assert.deepEqual(cache.run('v', VIDEO, 4), { first: 4, last: 6, startMs: 6000, endMs: 12000 })
  assert.equal(cache.run('v', VIDEO, 3), null)
  assert.equal(cache.segmentAt('v', VIDEO, 6500), 4)
  assert.equal(cache.segmentAt('v', VIDEO, 5000), 0)
  assert.deepEqual(cache.ranges('v', VIDEO), [[0, 4000], [6000, 12000]])
})

test('complete needs every segment up to the end', () => {
  const cache = createCache()
  cache.describe('v', { format: video, endSegment: 3, endTimeMs: 6000, mimeType: 'video/webm' }, new Uint8Array(1))
  fill(cache, video, [1, 3])
  assert.equal(cache.complete('v', VIDEO), false)
  fill(cache, video, [2])
  assert.equal(cache.complete('v', VIDEO), true)
})

test('watched parts are evicted and bytes go down', () => {
  const cache = createCache()
  fill(cache, video, [1, 2, 3, 4])
  fill(cache, audio, [1, 2], 4000)
  cache.evictBefore('v', 4500)
  assert.deepEqual([...cache.find('v', VIDEO).segments.keys()], [3, 4])
  assert.deepEqual([...cache.find('v', AUDIO).segments.keys()], [2])
  assert.equal(cache.bytes, 3 * 110)
})

test('clearing one track leaves the other alone', () => {
  const cache = createCache()
  fill(cache, video, [1, 2])
  fill(cache, audio, [1])
  cache.clearSegments('v', VIDEO)
  assert.equal(cache.find('v', VIDEO).segments.size, 0)
  assert.equal(cache.find('v', AUDIO).segments.size, 1)
  assert.equal(cache.bytes, 110)
})

test('trimEnd removes the latest segments until the limit is met', () => {
  const cache = createCache()
  fill(cache, video, [1, 2, 3, 4, 5])
  cache.trimEnd('v', 300)
  assert.deepEqual([...cache.find('v', VIDEO).segments.keys()], [1, 2])
  assert.equal(cache.bytes, 220)
})

test('dropping a video frees its bytes and format owners', () => {
  const cache = createCache()
  fill(cache, video, [1, 2], 2000, 'a')
  fill(cache, audio, [1], 2000, 'b')
  cache.dropVideo('a')
  assert.equal(cache.bytes, 110)
  assert.equal(cache.owner(VIDEO), null)
  assert.equal(cache.owner(AUDIO), 'b')
  assert.deepEqual(cache.ids(), ['b'])
})

test('intersect keeps only time covered by both tracks', () => {
  assert.deepEqual(intersect([[0, 10], [20, 30]], [[5, 25]]), [[5, 10], [20, 25]])
  assert.deepEqual(intersect([[0, 10]], []), [])
})
