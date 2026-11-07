import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decode, encode, makeVarint, makeBytes, makeString, makeMessage, readInt, readMessage } from '../src/page/protobuf.js'
import {
  encodeFormat, formatKey, parseRequest, buildRequest, parseMediaHeader, withHeaderId, parsePolicy, rewritePolicy,
  parseFormatInit, parseContextUpdate, parseSendingPolicy
} from '../src/page/sabr.js'

const video = { itag: 248, lmt: 1700000000000000, xtags: '' }
const audio = { itag: 251, lmt: 1700000000000001, xtags: 'lang=en' }

function playerRequest() {
  return encode([
    makeMessage(1, [makeVarint(16, 720), makeVarint(23, 5000000), makeVarint(28, 12345), makeVarint(40, 0), makeVarint(99, 7)]),
    makeBytes(2, encodeFormat(audio)),
    makeMessage(3, [makeBytes(1, encodeFormat(video)), makeVarint(2, 0), makeVarint(3, 10000), makeVarint(4, 1), makeVarint(5, 2)]),
    makeBytes(5, Uint8Array.of(1, 2, 3)),
    makeBytes(16, encodeFormat(audio)),
    makeBytes(17, encodeFormat(video)),
    makeMessage(19, [makeMessage(1, [makeVarint(16, 1)]), makeBytes(2, Uint8Array.of(9, 9)), makeBytes(3, Uint8Array.of(7))]),
    makeVarint(1000, 5)
  ])
}

test('formatKey is stable and includes xtags', () => {
  assert.equal(formatKey(video), '248:1700000000000000:')
  assert.equal(formatKey(audio), '251:1700000000000001:lang=en')
})

test('parseRequest reads the fields the cache needs', () => {
  const parsed = parseRequest(playerRequest())
  assert.equal(parsed.playerTimeMs, 12345)
  assert.equal(parsed.bandwidthEstimate, 5000000)
  assert.equal(parsed.manualResolution, 720)
  assert.deepEqual(parsed.audioFormats, [audio])
  assert.deepEqual(parsed.videoFormats, [video])
  assert.deepEqual(parsed.initializedFormats, [audio])
  assert.deepEqual(parsed.ranges, [{ format: video, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }])
  assert.deepEqual(parsed.cookie, Uint8Array.of(7))
  assert.equal(parsed.hasPoToken, true)
})

test('buildRequest changes only what it is asked to change', () => {
  const original = playerRequest()
  const built = buildRequest(original, {
    playerTimeMs: 60000.4,
    ranges: [{ format: video, startMs: 0, durationMs: 60000, startSegment: 1, endSegment: 12 }],
    audioFormats: [audio],
    videoFormats: [video],
    initializedFormats: [audio, video],
    cookie: Uint8Array.of(8, 8),
    contexts: { active: [{ type: 3, value: Uint8Array.of(4) }], unsent: [5] },
    bandwidthEstimate: 900000
  })
  const parsed = parseRequest(built)
  assert.equal(parsed.playerTimeMs, 60000)
  assert.equal(parsed.bandwidthEstimate, 900000)
  assert.equal(parsed.manualResolution, 720)
  assert.deepEqual(parsed.ranges, [{ format: video, startMs: 0, durationMs: 60000, startSegment: 1, endSegment: 12 }])
  assert.deepEqual(parsed.initializedFormats, [audio, video])
  assert.deepEqual(parsed.cookie, Uint8Array.of(8, 8))

  const fields = decode(built)
  const before = decode(original)
  const rawOf = (list, number) => list.find(field => field.number === number).raw
  assert.deepEqual(rawOf(fields, 5), rawOf(before, 5))
  assert.deepEqual(rawOf(fields, 1000), rawOf(before, 1000))
  assert.equal(readInt(readMessage(fields, 1), 99), 7)
  const streamer = readMessage(fields, 19)
  assert.deepEqual(rawOf(streamer, 2), rawOf(readMessage(before, 19), 2))
  assert.deepEqual(rawOf(streamer, 1), rawOf(readMessage(before, 19), 1))
  assert.equal(readInt(streamer, 6), 5)
  assert.equal(readInt(readMessage(streamer, 5), 1), 3)
})

test('buildRequest without changes keeps the request intact', () => {
  const original = playerRequest()
  assert.deepEqual(parseRequest(buildRequest(original, {})), parseRequest(original))
})

test('media headers parse and get a new header id without other changes', () => {
  const header = encode([
    makeVarint(1, 3), makeString(2, 'abcdefghijk'), makeVarint(3, 248), makeVarint(4, video.lmt),
    makeVarint(9, 12), makeVarint(10, 2500000), makeVarint(11, 55000), makeVarint(12, 5000),
    makeBytes(13, encodeFormat(video)), makeVarint(14, 1234)
  ])
  const parsed = parseMediaHeader(header)
  assert.equal(parsed.id, 3)
  assert.equal(parsed.videoId, 'abcdefghijk')
  assert.deepEqual(parsed.format, video)
  assert.equal(parsed.segment, 12)
  assert.equal(parsed.startMs, 55000)
  assert.equal(parsed.durationMs, 5000)
  assert.equal(parsed.isInit, false)
  const renumbered = parseMediaHeader(withHeaderId(header, 9))
  assert.deepEqual({ ...renumbered, id: 3 }, parsed)
  assert.equal(renumbered.id, 9)
})

test('media header timing falls back to the time range', () => {
  const header = encode([
    makeVarint(1, 0), makeVarint(3, 251), makeVarint(9, 2),
    makeMessage(15, [makeVarint(1, 90000), makeVarint(2, 9000), makeVarint(3, 90000)])
  ])
  const parsed = parseMediaHeader(header)
  assert.equal(parsed.startMs, 1000)
  assert.equal(parsed.durationMs, 100)
  assert.deepEqual(parsed.format, { itag: 251, lmt: 0, xtags: '' })
})

test('policy rewrite raises targets, drops backoff and keeps everything else', () => {
  const policy = encode([
    makeVarint(1, 30000), makeVarint(2, 30000), makeVarint(4, 500),
    makeBytes(7, Uint8Array.of(1, 2)), makeString(8, 'abcdefghijk'), makeVarint(50, 3)
  ])
  const raised = rewritePolicy(policy, { audioMs: 600000, videoMs: 400000, backoffMs: 0 })
  assert.deepEqual(parsePolicy(raised), {
    targetAudioMs: 600000, targetVideoMs: 400000, backoffMs: 0, cookie: Uint8Array.of(1, 2), videoId: 'abcdefghijk'
  })
  assert.equal(readInt(decode(raised), 50), 3)
  const kept = rewritePolicy(policy, { audioMs: 1000, videoMs: 1000 })
  assert.deepEqual(kept, policy)
  const waiting = rewritePolicy(raised, { backoffMs: 2000 })
  assert.equal(parsePolicy(waiting).backoffMs, 2000)
})

test('format init, context update and sending policy parse', () => {
  const init = encode([makeString(1, 'abcdefghijk'), makeBytes(2, encodeFormat(video)), makeVarint(3, 600000), makeVarint(4, 120), makeString(5, 'video/webm; codecs="vp9"')])
  assert.deepEqual(parseFormatInit(init), { videoId: 'abcdefghijk', format: video, endTimeMs: 600000, endSegment: 120, mimeType: 'video/webm; codecs="vp9"' })
  const update = encode([makeVarint(1, 2), makeBytes(3, Uint8Array.of(5, 6)), makeVarint(4, 1)])
  assert.deepEqual(parseContextUpdate(update), { type: 2, value: Uint8Array.of(5, 6), sendByDefault: true })
  const policy = encode([makeVarint(1, 2), makeVarint(2, 3), makeVarint(3, 4)])
  assert.deepEqual(parseSendingPolicy(policy), { start: [2], stop: [3], discard: [4] })
})
