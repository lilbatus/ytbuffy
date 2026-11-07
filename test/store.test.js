import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../src/vault/store.js'

const MIB = 1048576

function filled(store, videoId = 'v', tabId = 1, count = 10, size = 100) {
  store.track({ videoId, key: 'a', mimeType: 'audio/webm; codecs="opus"', meta: new Uint8Array(4), initHeader: new Uint8Array(2), init: new Uint8Array(8) }, tabId)
  store.track({ videoId, key: 'v', mimeType: 'video/mp4; codecs="av01.0.05M.08"', meta: new Uint8Array(4), initHeader: new Uint8Array(2), init: new Uint8Array(8) }, tabId)
  for (let number = 1; number <= count; number++) {
    for (const key of ['a', 'v']) {
      store.segment({ videoId, key, number, startMs: (number - 1) * 5000, durationMs: 5000, header: new Uint8Array(3), data: new Uint8Array(size) }, tabId)
    }
  }
}

test('a stored video can be found, listed and read back', () => {
  const store = createStore()
  filled(store)
  store.time({ videoId: 'v', title: 'Title', durationMs: 50000, timeMs: 12000 }, 1)
  assert.deepEqual(store.find('v'), { videoId: 'v', title: 'Title', timeMs: 12000 })
  const manifest = store.manifest('v')
  assert.equal(manifest.tracks.length, 2)
  assert.equal(manifest.tracks.find(track => track.kind === 'audio').segments.length, 10)
  const [segment] = store.segments('v', 'v', [3])
  assert.deepEqual([segment.number, segment.startMs, segment.data.length], [3, 10000, 100])
  assert.equal(store.restoreData('v', 'a').segments.length, 10)
  assert.equal(store.find('missing'), null)
})

test('a video needs both audio and video to be playable', () => {
  const store = createStore()
  store.track({ videoId: 'v', key: 'a', mimeType: 'audio/webm', meta: new Uint8Array(1), initHeader: new Uint8Array(1), init: new Uint8Array(1) }, 1)
  store.segment({ videoId: 'v', key: 'a', number: 1, startMs: 0, durationMs: 5000, header: new Uint8Array(1), data: new Uint8Array(1) }, 1)
  assert.equal(store.find('v'), null)
})

test('watched parts stay until room is needed, then the oldest go first', () => {
  const store = createStore()
  filled(store)
  store.time({ videoId: 'v', timeMs: 45000 }, 1)
  assert.deepEqual(store.manifest('v').tracks.map(track => track.segments.length), [10, 10])
  const limit = store.bytes + 150
  store.setLimit(limit)
  const accepted = store.segment({ videoId: 'v', key: 'v', number: 11, startMs: 50000, durationMs: 5000, header: new Uint8Array(3), data: new Uint8Array(200) }, 1)
  assert.equal(accepted, true)
  const [audio, video] = ['audio', 'video'].map(kind => store.manifest('v').tracks.find(track => track.kind === kind).segments.map(([number]) => number))
  assert.equal(audio[0] + video[0] > 2, true, 'the oldest watched segment was let go')
  assert.equal(video.includes(11), true)
  assert.ok(store.bytes <= limit)
})

test('parts around the playback point are never let go to make room', () => {
  const store = createStore()
  filled(store, 'v', 1, 4)
  store.time({ videoId: 'v', timeMs: 10000 }, 1)
  store.setLimit(store.bytes)
  const accepted = store.segment({ videoId: 'v', key: 'v', number: 9, startMs: 40000, durationMs: 5000, header: new Uint8Array(3), data: new Uint8Array(100) }, 1)
  assert.equal(accepted, false)
  assert.deepEqual(store.manifest('v').tracks.map(track => track.segments.length), [4, 4])
})

test('the limit drops older videos first and then refuses', () => {
  const store = createStore()
  store.setLimit(MIB)
  filled(store, 'old', 1, 4, 100000)
  filled(store, 'new', 2, 4, 100000)
  assert.equal(store.manifest('old'), null)
  assert.ok(store.bytes <= MIB)
  const accepted = store.segment({ videoId: 'new', key: 'v', number: 99, startMs: 900000, durationMs: 5000, header: new Uint8Array(1), data: new Uint8Array(MIB) }, 2)
  assert.equal(accepted, false)
})

test('closing a tab forgets only the videos it held', () => {
  const store = createStore()
  filled(store, 'one', 1)
  filled(store, 'two', 2)
  store.forgetTab(1)
  assert.equal(store.find('one'), null)
  assert.ok(store.find('two'))
  store.clear('two', 'v')
  assert.equal(store.find('two'), null)
  store.drop('two')
  assert.equal(store.bytes, 0)
  assert.equal(store.size, 0)
})

test('with trimming on, parts further behind than allowed are let go and not taken back', () => {
  const store = createStore()
  store.setKeepBehind(20000)
  filled(store)
  store.time({ videoId: 'v', timeMs: 40000 }, 1)
  const numbers = store.manifest('v').tracks[0].segments.map(([number]) => number)
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(number => number * 5000 >= 20000))
  const old = store.segment({ videoId: 'v', key: 'a', number: 1, startMs: 0, durationMs: 5000, header: new Uint8Array(1), data: new Uint8Array(1) }, 1)
  assert.equal(old, false)
  store.setKeepBehind(0)
  assert.equal(store.segment({ videoId: 'v', key: 'a', number: 1, startMs: 0, durationMs: 5000, header: new Uint8Array(1), data: new Uint8Array(1) }, 1), true)
})
