import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encode, concat, makeVarint, makeBytes, makeString, makeMessage } from '../src/page/protobuf.js'
import { writePart, readParts } from '../src/page/ump.js'
import { PART, encodeFormat, formatKey, parseRequest, parseMediaHeader, parsePolicy } from '../src/page/sabr.js'
import { createCache } from '../src/page/cache.js'
import { createScheduler } from '../src/page/scheduler.js'
import { createServer } from '../src/page/serve.js'
import { createSession } from '../src/page/session.js'
import { createReadahead } from '../src/page/readahead.js'
import { describe } from '../src/page/hooks.js'
import { learnFormats } from '../src/page/formats.js'
import { DEFAULTS } from '../src/shared/settings.js'

globalThis.location = { href: 'https://www.youtube.com/watch?v=abcdefghijk', origin: 'https://www.youtube.com', pathname: '/watch' }

const VIDEO_ID = 'abcdefghijk'
const URL_BASE = 'https://rr1---sn-test.googlevideo.com/videoplayback?ei=E1&expire=99&sabr=1&rn=1'
const OPUS = 'audio/webm; codecs="opus"'
const VP9 = 'video/webm; codecs="vp9"'

function audioTrack(name, lmt, xtags, track) {
  return { name, track, format: { itag: 251, lmt, xtags }, count: 10, durationMs: 10000, mime: OPUS, bitrate: 130000 }
}

function videoTrack(name, itag, lmt, width, height, bitrate) {
  return { name, format: { itag, lmt, xtags: '' }, count: 20, durationMs: 5000, mime: VP9, width, height, bitrate }
}

const EN = audioTrack('en', 1700000000000001, 'CgdlbixvcmlnaW5hbA', 'en.4')
const EN_DRC = audioTrack('en-drc', 1700000000000002, 'CgdlbixvcmlnaW5hbCxkcmM', 'en.4')
const TR = audioTrack('tr', 1700000000000003, 'CgZ0cixkdWJiZWQ', 'tr.3')
const ML = audioTrack('ml', 1700000000000004, 'CgZtbCxkdWJiZWQ', 'ml.3')
const VIDEO = videoTrack('1080p', 248, 1700000000000010, 1920, 1080, 2600000)
const V480 = videoTrack('480p', 244, 1700000000000011, 854, 480, 700000)
const TRACKS = [EN, EN_DRC, TR, ML, VIDEO, V480]
const AUDIO = EN
const BOTH = [AUDIO.format, VIDEO.format]
const PREFERRED_AUDIO = [ML.format, TR.format, EN_DRC.format, EN.format]
const AUDIO_BY_TRACK = { 'tr.3': TR, 'ml.3': ML, 'en.4': EN }

learnFormats(TRACKS.map(track => ({
  itag: track.format.itag,
  mimeType: track.mime,
  width: track.width,
  height: track.height,
  bitrate: track.bitrate,
  xtags: track.format.xtags,
  audioTrack: track.track ? { id: track.track } : undefined,
  isDrc: track === EN_DRC
})))

function mediaBytes(track, number) {
  return new Uint8Array(700).map((_, index) => (track.format.itag + track.format.lmt % 97 + number * 7 + index) % 256)
}

function trackOf(format) {
  return TRACKS.find(track => formatKey(track.format) === formatKey(format))
}

function createServerStub() {
  const requests = []
  const state = { protect: false, video: VIDEO, backoff: 40, latency: 0 }

  function pick(parsed, kind) {
    const preferred = kind === 'audio' ? parsed.audioFormats : parsed.videoFormats
    if (preferred.length === 1) return trackOf(preferred[0])
    if (kind === 'video') return state.video
    if (parsed.audioTrackId) return AUDIO_BY_TRACK[parsed.audioTrackId]
    return parsed.drc ? EN_DRC : EN
  }

  function respond(url, body) {
    const parsed = parseRequest(body)
    requests.push({ url, parsed })
    const parts = [writePart(PART.NEXT_REQUEST_POLICY, encode([
      makeVarint(1, 30000), makeVarint(2, 30000), makeVarint(4, state.backoff),
      makeBytes(7, new TextEncoder().encode(`cookie${requests.length}`)), makeString(8, VIDEO_ID)
    ]))]
    parts.push(writePart(PART.STREAM_PROTECTION_STATUS, encode([makeVarint(1, state.protect ? 3 : 1)])))
    let headerId = 0
    for (const track of [pick(parsed, 'audio'), pick(parsed, 'video')]) {
      const key = formatKey(track.format)
      const format = encodeFormat(track.format)
      if (!parsed.initializedFormats.some(item => formatKey(item) === key)) {
        parts.push(writePart(PART.FORMAT_INITIALIZATION_METADATA, encode([
          makeString(1, VIDEO_ID), makeBytes(2, format), makeVarint(3, track.count * track.durationMs),
          makeVarint(4, track.count), makeString(5, track.mime)
        ])))
        const id = headerId++
        parts.push(writePart(PART.MEDIA_HEADER, encode([makeVarint(1, id), makeString(2, VIDEO_ID), makeVarint(3, track.format.itag), makeVarint(8, 1), makeBytes(13, format)])))
        parts.push(writePart(PART.MEDIA, concat([Uint8Array.of(id), Uint8Array.of(1, 2, 3)])))
        parts.push(writePart(PART.MEDIA_END, Uint8Array.of(id)))
      }
      const range = parsed.ranges.find(item => formatKey(item.format) === key)
      const first = range ? range.endSegment + 1 : Math.floor(parsed.playerTimeMs / track.durationMs) + 1
      for (let number = first; number < first + 2 && number <= track.count; number++) {
        const id = headerId++
        const data = mediaBytes(track, number)
        parts.push(writePart(PART.MEDIA_HEADER, encode([
          makeVarint(1, id), makeString(2, VIDEO_ID), makeVarint(3, track.format.itag), makeVarint(4, track.format.lmt),
          makeVarint(9, number), makeVarint(11, (number - 1) * track.durationMs), makeVarint(12, track.durationMs), makeBytes(13, format)
        ])))
        parts.push(writePart(PART.MEDIA, concat([Uint8Array.of(id), data.subarray(0, 300)])))
        parts.push(writePart(PART.MEDIA, concat([Uint8Array.of(id), data.subarray(300)])))
        parts.push(writePart(PART.MEDIA_END, Uint8Array.of(id)))
      }
    }
    return concat(parts)
  }

  async function fetchStub(url, init) {
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    if (state.latency) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, state.latency)
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }
    const bytes = respond(url, init.body)
    return new Response(bytes, { status: 200, headers: { 'content-type': 'application/vnd.yt-ump', 'content-length': String(bytes.length) } })
  }

  return { requests, fetchStub, state }
}

function playerBody({ timeMs = 0, formats = [], ranges = [], manualResolution = 0, token = 9, audioTrack = '', drc = false, preferred = PREFERRED_AUDIO } = {}) {
  const abr = [makeVarint(23, 4000000), makeVarint(28, timeMs)]
  if (manualResolution) abr.push(makeVarint(16, manualResolution))
  if (drc) abr.push(makeVarint(46, 1))
  if (audioTrack) abr.push(makeString(69, audioTrack))
  const fields = [
    makeMessage(1, abr),
    makeBytes(5, Uint8Array.of(42)),
    makeMessage(19, [makeBytes(2, Uint8Array.of(token)), makeBytes(3, new TextEncoder().encode('player-cookie'))])
  ]
  for (const range of ranges) {
    fields.push(makeMessage(3, [
      makeBytes(1, encodeFormat(range.format)), makeVarint(2, range.startMs), makeVarint(3, range.durationMs),
      makeVarint(4, range.startSegment), makeVarint(5, range.endSegment)
    ]))
  }
  for (const format of formats) fields.push(makeBytes(2, encodeFormat(format)))
  for (const format of preferred) fields.push(makeBytes(16, encodeFormat(format)))
  return encode(fields)
}

function setup() {
  const stub = createServerStub()
  const context = {
    settings: { ...DEFAULTS, startMode: 'open', delayMs: 0 },
    cache: createCache(),
    sessions: new Map(),
    manualIds: new Set(),
    playedIds: new Set(),
    limited: false,
    qualityLockedAt: 0,
    nativeFetch: stub.fetchStub,
    active: () => true,
    mainStream: '',
    player: {
      videoId: () => VIDEO_ID, time: () => 0, live: () => false, shorts: () => false, ad: () => false, paused: () => false,
      streamId: () => context.mainStream
    },
    network: { online: true, failed() { this.online = false }, succeeded() { this.online = true }, check() {} },
    next: { upcoming: () => [] },
    mirror: { ready: () => true }
  }
  context.readahead = createReadahead(context)
  context.scheduler = createScheduler(context)
  context.server = createServer(context)
  return { context, stub }
}

function settle(context) {
  for (const session of context.sessions.values()) session.settleUntil = Date.now() - 1
  context.scheduler.wake()
}

async function until(check, timeoutMs = 3000) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function playerCall(body, url = URL_BASE) {
  return describe(url, { method: 'POST', body, credentials: 'include' })
}

function complete(context, ...tracks) {
  return () => tracks.every(track => context.cache.complete(VIDEO_ID, formatKey(track.format)))
}

async function ready(audio = AUDIO) {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  settle(context)
  await until(complete(context, audio, VIDEO))
  return { context, stub, calls: stub.requests.length, session: context.sessions.get(VIDEO_ID) }
}

async function partsOf(reply) {
  return readParts(new Uint8Array(await reply.arrayBuffer()))
}

function servedSegments(parts) {
  return parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
    .filter(header => !header.isInit).map(header => `${trackOf(header.format).name}#${header.segment}`)
}

const playing = [
  { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
  { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
]

test('a cold start is forwarded, YouTube gets a few seconds to pick the quality, then the whole video gets prefetched', async () => {
  const { context, stub } = setup()
  const reply = await context.server.handle(playerCall(playerBody()))
  const forwarded = readParts(new Uint8Array(await reply.arrayBuffer()))
  assert.equal(reply.headers.get('content-length'), null)
  const policy = parsePolicy(forwarded.find(part => part.type === PART.NEXT_REQUEST_POLICY).payload)
  assert.ok(policy.targetVideoMs > 30000, 'player readahead target is raised')
  assert.equal(forwarded.filter(part => part.type === PART.MEDIA_END).length, 6)

  const session = context.sessions.get(VIDEO_ID)
  assert.deepEqual(session.tracks, { audio: AUDIO.format, video: VIDEO.format })
  assert.ok(session.settleUntil > Date.now())
  assert.equal(context.scheduler.evaluate(session, true).state, 'settling')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(stub.requests.length, 1, 'nothing is prefetched while YouTube picks the quality')

  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  assert.equal(context.scheduler.evaluate(session, true).state, 'done')
  const prefetches = stub.requests.slice(1)
  assert.ok(prefetches.length >= 9)
  prefetches.forEach((request, index) => {
    assert.equal(new TextDecoder().decode(request.parsed.cookie), `cookie${index + 1}`)
    assert.equal(Number(new URL(request.url).searchParams.get('rn')), index + 2)
    assert.deepEqual(request.parsed.videoFormats, [VIDEO.format])
    assert.deepEqual(request.parsed.audioFormats, [AUDIO.format])
  })
  const second = prefetches[0].parsed
  assert.equal(second.playerTimeMs, 10000)
  assert.deepEqual(second.ranges.map(range => [range.format.itag, range.startSegment, range.endSegment]), [[251, 1, 2], [248, 1, 2]])
  assert.equal(second.initializedFormats.length, 2)
})

test('while YouTube picks the quality the player requests still go to YouTube', async () => {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  const calls = stub.requests.length
  await (await context.server.handle(playerCall(playerBody({ timeMs: 1000, formats: BOTH, ranges: playing })))).arrayBuffer()
  assert.equal(stub.requests.length, calls + 1)
})

test('a follow-up request is answered from memory without touching the network', async () => {
  const { context, stub, calls } = await ready()
  const reply = await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))
  assert.equal(stub.requests.length, calls, 'no network request was made')
  assert.equal(reply.headers.get('content-type'), 'application/vnd.yt-ump')
  assert.equal(reply.url, URL_BASE)

  const parts = readParts(new Uint8Array(await reply.arrayBuffer()))
  assert.equal(parts[0].type, PART.NEXT_REQUEST_POLICY)
  assert.equal(parsePolicy(parts[0].payload).backoffMs, 0)
  const headers = parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
  assert.deepEqual(headers.map(header => header.id), headers.map((_, index) => index))
  const served = servedSegments(parts)
  assert.deepEqual(served.filter(item => item.startsWith('en#')), ['en#2', 'en#3', 'en#4'])
  assert.deepEqual(served.filter(item => item.startsWith('1080p#')), ['1080p#3', '1080p#4', '1080p#5', '1080p#6', '1080p#7', '1080p#8'])
  for (const header of headers) {
    const media = parts.find(part => part.type === PART.MEDIA && part.payload[0] === header.id)
    assert.deepEqual(media.payload.subarray(1), mediaBytes(trackOf(header.format), header.segment))
    assert.ok(parts.some(part => part.type === PART.MEDIA_END && part.payload[0] === header.id))
  }
})

test('a player request in the middle of loading gets through, even with no pause between downloads', async () => {
  const { context, stub } = setup()
  stub.state.backoff = 0
  stub.state.latency = 30
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  settle(context)
  await new Promise(resolve => setTimeout(resolve, 10))
  const started = Date.now()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))).arrayBuffer()
  assert.ok(Date.now() - started < 2000)
  await until(complete(context, AUDIO, VIDEO), 10000)
})

test('the long list of preferred audio formats is not taken for an audio track choice', async () => {
  const { context, stub, session } = await ready()
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))))
  assert.deepEqual(session.tracks.audio, EN.format)
  assert.ok(served.some(item => item.startsWith('en#')))
  assert.ok(served.every(item => !/^(ml|tr|en-drc)#/.test(item)))
  assert.ok(stub.requests.slice(1).every(request => request.parsed.audioFormats.length === 1 && formatKey(request.parsed.audioFormats[0]) === formatKey(EN.format)))
})

test('picking another audio track drops the old one and from then on only the new one is served', async () => {
  const { context, stub, calls, session } = await ready()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 6000, formats: BOTH, audioTrack: 'tr.3' })))).arrayBuffer()
  assert.equal(stub.requests.length, calls + 1, 'the switch goes to YouTube')
  assert.equal(context.cache.find(VIDEO_ID, formatKey(EN.format)), null, 'the old language is gone from memory')
  assert.deepEqual(session.tracks.audio, TR.format)
  await until(complete(context, TR, VIDEO))
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 7000,
    formats: [...BOTH, TR.format],
    audioTrack: 'tr.3',
    ranges: [
      { format: TR.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })))))
  assert.ok(served.some(item => item.startsWith('tr#')))
  assert.ok(served.every(item => !item.startsWith('en#')))
})

test('turning stable volume on or off is followed like a track change', async () => {
  const { context, session } = await ready()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 6000, formats: BOTH, drc: true })))).arrayBuffer()
  assert.deepEqual(session.tracks.audio, EN_DRC.format)
  assert.equal(context.cache.find(VIDEO_ID, formatKey(EN.format)), null)
})

test('a session that claimed another language follows the one the player is playing', async () => {
  const { context, session } = await ready()
  session.tracks.audio = ML.format
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))).arrayBuffer()
  assert.deepEqual(session.tracks.audio, EN.format)
})

test('YouTube raising the quality in the first seconds is followed and the old quality is never pushed back', async () => {
  const { context, stub } = setup()
  stub.state.video = V480
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
  assert.deepEqual(session.tracks.video, V480.format)
  stub.state.video = VIDEO
  await (await context.server.handle(playerCall(playerBody({
    timeMs: 2000,
    formats: [AUDIO.format, V480.format],
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
      { format: V480.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })))).arrayBuffer()
  assert.deepEqual(session.tracks.video, VIDEO.format)
  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  assert.ok(stub.requests.slice(2).every(request => formatKey(request.parsed.videoFormats[0]) === formatKey(VIDEO.format)))
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 3000,
    formats: [AUDIO.format, V480.format, VIDEO.format],
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })))))
  assert.ok(served.some(item => item.startsWith('1080p#')))
  assert.ok(served.every(item => !item.startsWith('480p#')))
})

test('a lower quality from YouTube does not replace the better one in memory', async () => {
  const { context, stub, session } = await ready()
  stub.state.video = V480
  context.cache.clearSegments(VIDEO_ID, formatKey(VIDEO.format))
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))).arrayBuffer()
  assert.deepEqual(session.tracks.video, VIDEO.format)
  await until(complete(context, VIDEO))
})

test('a lower quality left in memory is never served while the player shows a better one', async () => {
  const { context, stub } = setup()
  stub.state.video = V480
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  settle(context)
  await until(complete(context, AUDIO, V480))
  stub.state.video = VIDEO
  const calls = stub.requests.length
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 3000,
    formats: [AUDIO.format, V480.format, VIDEO.format],
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  }))))
  assert.equal(stub.requests.length, calls + 1, 'the request goes to YouTube instead')
  assert.ok(servedSegments(parts).every(item => !item.startsWith('480p#')))
  assert.deepEqual(context.sessions.get(VIDEO_ID).tracks.video, VIDEO.format)
})

test('offline, a cached lower quality fills in where the current one has nothing', async () => {
  const { context, stub } = setup()
  stub.state.video = V480
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  settle(context)
  await until(complete(context, AUDIO, V480))
  const session = context.sessions.get(VIDEO_ID)
  session.tracks.video = VIDEO.format
  context.network.online = false
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: [AUDIO.format, VIDEO.format], ranges: playing }))))
  const served = servedSegments(parts)
  assert.ok(served.some(item => item.startsWith('480p#')))
  assert.ok(parts.some(part => part.type === PART.FORMAT_INITIALIZATION_METADATA), 'the lower quality comes with its init segment')
})

test('audio in another language is never served, not even offline', async () => {
  const { context, session } = await ready()
  context.cache.describe(VIDEO_ID, { format: TR.format, endSegment: 10, endTimeMs: 100000, mimeType: OPUS }, new Uint8Array(3))
  context.cache.add(VIDEO_ID, { format: TR.format, isInit: true }, new Uint8Array(1), new Uint8Array(1))
  for (let number = 1; number <= 10; number++) {
    context.cache.add(VIDEO_ID, { format: TR.format, segment: number, startMs: (number - 1) * 10000, durationMs: 10000 }, new Uint8Array(1), new Uint8Array(5))
  }
  context.cache.clearSegments(VIDEO_ID, formatKey(EN.format))
  context.network.online = false
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))))
  assert.deepEqual(session.tracks.audio, EN.format)
  assert.ok(served.every(item => !item.startsWith('tr#')))
})

test('serving stops after the player keeps ignoring served segments', async () => {
  const { context, session } = await ready()
  const stuck = playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })
  for (let attempt = 0; attempt < 4; attempt++) await (await context.server.handle(playerCall(stuck))).arrayBuffer()
  assert.equal(session.serving, false)
})

test('the main player takes over a session from an earlier stream and starts it over', async () => {
  const { context, stub } = setup()
  const session = createSession(VIDEO_ID)
  Object.assign(session, {
    source: 'preload',
    stream: 'E0|50',
    url: 'https://rr9---sn-other.googlevideo.com/videoplayback?ei=E0&expire=50&sabr=1&rn=3',
    init: { method: 'POST', headers: {} },
    referrer: 'https://www.youtube.com/watch?v=previous',
    body: playerBody(),
    cookie: new TextEncoder().encode('old-cookie'),
    rn: 3,
    autostart: true,
    tracks: { audio: ML.format, video: V480.format }
  })
  context.sessions.set(VIDEO_ID, session)
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  assert.equal(session.source, 'player')
  assert.equal(session.referrer, undefined)
  assert.equal(new URL(session.url).searchParams.get('ei'), 'E1')
  assert.deepEqual(session.tracks, { audio: AUDIO.format, video: VIDEO.format }, 'formats are learned again from the new stream')
  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  const prefetches = stub.requests.slice(1)
  assert.ok(prefetches.every(request => new URL(request.url).searchParams.get('ei') === 'E1'))
  assert.equal(new TextDecoder().decode(prefetches[0].parsed.cookie), 'cookie1')
  assert.equal(new URL(prefetches[0].url).searchParams.get('rn'), '2')
})

test('requests are matched to their video by the stream address', async () => {
  const { context, calls, session } = await ready()
  context.cache.clearSegments(VIDEO_ID)
  const before = session.rn
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: [{ itag: 9999, lmt: 1, xtags: '' }] })))).arrayBuffer()
  assert.ok(session.rn > before, 'the request used the session of its stream')
  assert.ok(calls > 0)
})

test('another player of the same video cannot take over the session', async () => {
  const { context, stub, session } = await ready()
  context.mainStream = 'E1|99'
  const other = 'https://rr2---sn-test.googlevideo.com/videoplayback?ei=E9&expire=99&sabr=1&rn=1'
  const before = { url: session.url, tracks: { ...session.tracks } }
  const reply = await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing }), other))
  await reply.arrayBuffer()
  assert.equal(session.url, before.url)
  assert.deepEqual(session.tracks, before.tracks)
  assert.equal(stub.requests[stub.requests.length - 1].url, other, 'the other player went straight to YouTube')
})

test('forwarded requests carry the latest cookie and a fresh request number', async () => {
  const { context, stub, session } = await ready()
  session.serving = false
  const before = stub.requests.length
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH })))).arrayBuffer()
  const sent = stub.requests[before]
  assert.equal(new TextDecoder().decode(sent.parsed.cookie), `cookie${before}`)
  assert.equal(Number(new URL(sent.url).searchParams.get('rn')), before + 1)
  assert.equal(sent.parsed.bandwidthEstimate, 4000000)
})

test('a jump past the player buffer is answered from the segment at the new position', async () => {
  const { context, stub, calls } = await ready()
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 52000, formats: BOTH, ranges: playing })))))
  assert.equal(stub.requests.length, calls)
  assert.deepEqual(served.filter(item => item.startsWith('en#')), ['en#6', 'en#7', 'en#8'])
  assert.equal(served.find(item => item.startsWith('1080p#')), '1080p#11')
})

test('a full player buffer gets a waiting answer without any media', async () => {
  const { context, stub, calls } = await ready()
  context.settings = { ...context.settings, aheadMode: 'minutes', aheadMinutes: 1 }
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 70000, startSegment: 1, endSegment: 7 },
      { format: VIDEO.format, startMs: 0, durationMs: 70000, startSegment: 1, endSegment: 14 }
    ]
  })
  const parts = await partsOf(await context.server.handle(playerCall(body)))
  assert.equal(stub.requests.length, calls)
  assert.deepEqual(parts.map(part => part.type), [PART.NEXT_REQUEST_POLICY])
  assert.equal(parsePolicy(parts[0].payload).backoffMs, 2000)
})

test('a video format the player has not set up yet is sent together with its init segment', async () => {
  const { context } = await ready()
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 0,
    formats: [AUDIO.format],
    ranges: [{ format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 }]
  }))))
  assert.equal(parts.filter(part => part.type === PART.FORMAT_INITIALIZATION_METADATA).length, 1)
  const headers = parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
  assert.ok(headers[0].isInit && headers[0].format.itag === 248)
  assert.deepEqual(servedSegments(parts).filter(item => item.startsWith('1080p#')).slice(0, 2), ['1080p#1', '1080p#2'])
})

test('an audio format the player has not set up is never pushed while online', async () => {
  const { context, stub, calls } = await ready()
  await (await context.server.handle(playerCall(playerBody({
    timeMs: 0,
    formats: [VIDEO.format],
    ranges: [{ format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }]
  })))).arrayBuffer()
  assert.equal(stub.requests.length, calls + 1, 'the request goes to YouTube')
})

test('while offline whatever is cached is served and the rest waits', async () => {
  const { context, stub, calls } = await ready()
  context.network.online = false
  context.cache.clearSegments(VIDEO_ID, formatKey(AUDIO.format))
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))))
  assert.equal(stub.requests.length, calls)
  assert.ok(served.length && served.every(item => item.startsWith('1080p#')))
  context.cache.clearSegments(VIDEO_ID)
  context.nativeFetch = async () => { throw new TypeError('Failed to fetch') }
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing }))))
  assert.deepEqual(parts.map(part => part.type), [PART.NEXT_REQUEST_POLICY])
  assert.equal(parsePolicy(parts[0].payload).backoffMs, 2000)
})

test('while marked offline a request for missing parts still tries the network', async () => {
  const { context, stub } = await ready()
  context.network.online = false
  context.cache.clearSegments(VIDEO_ID)
  const before = stub.requests.length
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH }))))
  assert.equal(stub.requests.length, before + 1)
  assert.equal(context.network.online, true)
  assert.ok(parts.some(part => part.type === PART.MEDIA_HEADER))
})

test('a failed network request turns into a waiting answer instead of an error', async () => {
  const { context } = await ready()
  context.cache.clearSegments(VIDEO_ID)
  context.nativeFetch = async () => { throw new TypeError('Failed to fetch') }
  const parts = await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH }))))
  assert.equal(context.network.online, false)
  assert.deepEqual(parts.map(part => part.type), [PART.NEXT_REQUEST_POLICY])
})

test('a quality change by hand drops the cached video track and learns the new one from YouTube', async () => {
  const { context, stub, calls, session } = await ready()
  stub.state.video = V480
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, manualResolution: 480 })))).arrayBuffer()
  assert.ok(stub.requests.length > calls, 'the request went to the network')
  assert.equal(context.cache.ranges(VIDEO_ID, formatKey(VIDEO.format)).length, 0, 'the old quality is dropped')
  assert.deepEqual(session.tracks.video, V480.format)
})

test('with following quality changes off, a quality picked by hand keeps the loaded one playing', async () => {
  const { context, stub, session } = await ready()
  context.settings = { ...context.settings, refetchOnQualityChange: false }
  stub.state.video = V480
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, manualResolution: 480 })))).arrayBuffer()
  assert.ok(context.cache.ranges(VIDEO_ID, formatKey(VIDEO.format)).length > 0, 'the loaded quality stays')
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 3000,
    formats: [...BOTH, V480.format],
    manualResolution: 480,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: V480.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })))))
  assert.ok(served.some(item => item.startsWith('1080p#')), 'the loaded quality keeps playing from memory')
  assert.deepEqual(session.tracks.video, V480.format)
})

test('split ranges of one format are read as one buffer', async () => {
  const { context } = await ready()
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [...playing, { format: VIDEO.format, startMs: 5000, durationMs: 35000, startSegment: 2, endSegment: 8 }]
  })))))
  assert.equal(served.find(item => item.startsWith('1080p#')), '1080p#9')
})

test('a quality picked before the video started is not taken for a change', async () => {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody({ manualResolution: 1080 })))).arrayBuffer()
  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  const calls = stub.requests.length
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, manualResolution: 1080, ranges: playing })))))
  assert.equal(stub.requests.length, calls)
  assert.ok(served.includes('1080p#3'))
})

test('a flushed player buffer does not count against serving', async () => {
  const { context, session } = await ready()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges: playing })))).arrayBuffer()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH })))).arrayBuffer()
  assert.equal(session.strikes, 0)
})

test('an attestation request pauses loading until the player brings a new token', async () => {
  const { context, stub } = setup()
  stub.state.protect = true
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
  settle(context)
  assert.notEqual(session.blockedToken, null)
  assert.equal(context.scheduler.evaluate(session, true).state, 'error')
  await new Promise(resolve => setTimeout(resolve, 50))
  const before = stub.requests.length
  const ranges = [
    { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
    { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
  ]
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges })))).arrayBuffer()
  assert.equal(stub.requests.length, before + 1, 'the player request goes to YouTube so it can renew its token')
  stub.state.protect = false
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges, token: 7 })))).arrayBuffer()
  assert.equal(session.blockedToken, null)
  await until(complete(context, AUDIO, VIDEO))
})

test('an attestation pause is tried again after a while even without a new token', async () => {
  const { context, stub } = setup()
  stub.state.protect = true
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
  stub.state.protect = false
  session.blockedUntil = Date.now() - 1
  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  assert.equal(session.blockedToken, null)
})

test('a player that set up its formats before the extension saw them still gets loaded ahead', async () => {
  const { context, stub } = setup()
  const ranges = [
    { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
    { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
  ]
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges })))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
  assert.deepEqual(session.tracks, { audio: AUDIO.format, video: VIDEO.format })
  settle(context)
  await until(complete(context, AUDIO, VIDEO))
  assert.equal(stub.requests[1].parsed.initializedFormats.length, 0, 'the first prefetch asks for the format setup again')
  assert.ok(context.cache.find(VIDEO_ID, formatKey(VIDEO.format)).init, 'the init segment is in memory for the reload copy')
})
