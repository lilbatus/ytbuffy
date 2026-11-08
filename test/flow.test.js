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
import { learnKinds } from '../src/page/kinds.js'
import { DEFAULTS } from '../src/shared/settings.js'

globalThis.location = { href: 'https://www.youtube.com/watch?v=abcdefghijk', origin: 'https://www.youtube.com', pathname: '/watch' }

const VIDEO_ID = 'abcdefghijk'
const URL_BASE = 'https://rr1---sn-test.googlevideo.com/videoplayback?ei=E1&expire=99&sabr=1&rn=1'
const TRACKS = [
  { format: { itag: 251, lmt: 1700000000000001, xtags: '' }, count: 10, durationMs: 10000, mime: 'audio/webm; codecs="opus"' },
  { format: { itag: 248, lmt: 1700000000000000, xtags: '' }, count: 20, durationMs: 5000, mime: 'video/webm; codecs="vp9"' }
]
const [AUDIO, VIDEO] = TRACKS
const BOTH = [AUDIO.format, VIDEO.format]

function mediaBytes(track, number) {
  return new Uint8Array(700).map((_, index) => (track.format.itag + number * 7 + index) % 256)
}

function createServerStub() {
  const requests = []
  const state = { protect: false }
  function respond(url, body) {
    const parsed = parseRequest(body)
    requests.push({ url, parsed })
    const parts = [writePart(PART.NEXT_REQUEST_POLICY, encode([
      makeVarint(1, 30000), makeVarint(2, 30000), makeVarint(4, 200),
      makeBytes(7, new TextEncoder().encode(`cookie${requests.length}`)), makeString(8, VIDEO_ID)
    ]))]
    if (state.protect) parts.push(writePart(PART.STREAM_PROTECTION_STATUS, encode([makeVarint(1, 3)])))
    let headerId = 0
    for (const track of TRACKS) {
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
    const bytes = respond(url, init.body)
    return new Response(bytes, { status: 200, headers: { 'content-type': 'application/vnd.yt-ump', 'content-length': String(bytes.length) } })
  }
  return { requests, fetchStub, state }
}

function playerBody({ timeMs = 0, formats = [], ranges = [], manualResolution = 0, token = 9 } = {}) {
  const abr = [makeVarint(23, 4000000), makeVarint(28, timeMs)]
  if (manualResolution) abr.push(makeVarint(16, manualResolution))
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
    player: { videoId: () => VIDEO_ID, time: () => 0, live: () => false, shorts: () => false, ad: () => false, paused: () => false },
    network: { online: true, failed() { this.online = false }, succeeded() { this.online = true } },
    next: { upcoming: () => [] },
    mirror: { ready: () => true }
  }
  context.readahead = createReadahead(context)
  context.scheduler = createScheduler(context)
  context.server = createServer(context)
  return { context, stub }
}

async function until(check, timeoutMs = 3000) {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function playerCall(body) {
  return describe(URL_BASE, { method: 'POST', body, credentials: 'include' })
}

test('a cold start is forwarded, copied into memory and the whole video gets prefetched', async () => {
  const { context, stub } = setup()
  const reply = await context.server.handle(playerCall(playerBody()))
  const forwarded = readParts(new Uint8Array(await reply.arrayBuffer()))
  assert.equal(reply.headers.get('content-length'), null)
  const policy = parsePolicy(forwarded.find(part => part.type === PART.NEXT_REQUEST_POLICY).payload)
  assert.ok(policy.targetVideoMs > 30000, 'player readahead target is raised')
  assert.equal(forwarded.filter(part => part.type === PART.MEDIA_END).length, 6)

  const session = context.sessions.get(VIDEO_ID)
  assert.ok(session, 'session created from the response')
  assert.deepEqual(session.tracks, { audio: AUDIO.format, video: VIDEO.format })

  await until(() => context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)) && context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)))
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

test('a follow-up request is answered from memory without touching the network', async () => {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  const networkCalls = stub.requests.length

  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  const reply = await context.server.handle(playerCall(body))
  assert.equal(stub.requests.length, networkCalls, 'no network request was made')
  assert.equal(reply.headers.get('content-type'), 'application/vnd.yt-ump')
  assert.equal(reply.url, URL_BASE)

  const parts = readParts(new Uint8Array(await reply.arrayBuffer()))
  const policy = parsePolicy(parts[0].payload)
  assert.equal(parts[0].type, PART.NEXT_REQUEST_POLICY)
  assert.equal(policy.backoffMs, 0)

  const headers = parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
  assert.deepEqual(headers.map(header => header.id), headers.map((_, index) => index))
  const served = headers.map(header => `${header.format.itag}#${header.segment}`)
  assert.deepEqual(served.filter(item => item.startsWith('251')), ['251#2', '251#3', '251#4'])
  assert.deepEqual(served.filter(item => item.startsWith('248')), ['248#3', '248#4', '248#5', '248#6', '248#7', '248#8'])

  for (const header of headers) {
    const media = parts.find(part => part.type === PART.MEDIA && part.payload[0] === header.id)
    const track = TRACKS.find(item => item.format.itag === header.format.itag)
    assert.deepEqual(media.payload.subarray(1), mediaBytes(track, header.segment))
    assert.ok(parts.some(part => part.type === PART.MEDIA_END && part.payload[0] === header.id))
  }
})

test('serving stops after the player keeps ignoring served segments', async () => {
  const { context } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  const stuck = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  for (let attempt = 0; attempt < 4; attempt++) await (await context.server.handle(playerCall(stuck))).arrayBuffer()
  assert.equal(context.sessions.get(VIDEO_ID).serving, false)
})

test('the main player takes over a session from an earlier stream', async () => {
  const { context, stub } = setup()
  const session = createSession(VIDEO_ID)
  Object.assign(session, {
    source: 'preload',
    url: 'https://rr9---sn-other.googlevideo.com/videoplayback?ei=E0&expire=50&sabr=1&rn=3',
    init: { method: 'POST', headers: {} },
    referrer: 'https://www.youtube.com/watch?v=previous',
    body: playerBody(),
    cookie: new TextEncoder().encode('old-cookie'),
    rn: 3,
    autostart: true,
    tracks: { audio: AUDIO.format, video: VIDEO.format }
  })
  context.sessions.set(VIDEO_ID, session)
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  assert.equal(session.source, 'player')
  assert.equal(session.referrer, undefined)
  assert.equal(new URL(session.url).searchParams.get('ei'), 'E1')
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  const prefetches = stub.requests.slice(1)
  assert.ok(prefetches.every(request => new URL(request.url).searchParams.get('ei') === 'E1'))
  assert.equal(new TextDecoder().decode(prefetches[0].parsed.cookie), 'cookie1')
  assert.equal(new URL(prefetches[0].url).searchParams.get('rn'), '2')
})

test('forwarded requests carry the latest cookie and a fresh request number', async () => {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  context.sessions.get(VIDEO_ID).serving = false
  const before = stub.requests.length
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH })))).arrayBuffer()
  const sent = stub.requests[before]
  assert.equal(new TextDecoder().decode(sent.parsed.cookie), `cookie${before}`)
  assert.equal(Number(new URL(sent.url).searchParams.get('rn')), before + 1)
  assert.equal(sent.parsed.bandwidthEstimate, 4000000)
})

async function ready() {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  return { context, stub, calls: stub.requests.length }
}

async function partsOf(reply) {
  return readParts(new Uint8Array(await reply.arrayBuffer()))
}

function servedSegments(parts) {
  return parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
    .filter(header => !header.isInit).map(header => `${header.format.itag}#${header.segment}`)
}

test('a jump past the player buffer is answered from the segment at the new position', async () => {
  const { context, stub, calls } = await ready()
  const body = playerBody({
    timeMs: 52000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(body))))
  assert.equal(stub.requests.length, calls)
  assert.deepEqual(served.filter(item => item.startsWith('251')), ['251#6', '251#7', '251#8'])
  assert.equal(served.find(item => item.startsWith('248')), '248#11')
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

test('a format the player has not set up yet is sent together with its init segment', async () => {
  const { context } = await ready()
  const body = playerBody({
    timeMs: 0,
    formats: [AUDIO.format],
    ranges: [{ format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 }]
  })
  const parts = await partsOf(await context.server.handle(playerCall(body)))
  const types = parts.map(part => part.type)
  assert.equal(types.filter(type => type === PART.FORMAT_INITIALIZATION_METADATA).length, 1)
  const headers = parts.filter(part => part.type === PART.MEDIA_HEADER).map(part => parseMediaHeader(part.payload))
  assert.ok(headers[0].isInit && headers[0].format.itag === 248)
  assert.deepEqual(servedSegments(parts).filter(item => item.startsWith('248')).slice(0, 2), ['248#1', '248#2'])
})

test('while offline whatever is cached is served and the rest waits', async () => {
  const { context, stub, calls } = await ready()
  context.network.online = false
  context.cache.clearSegments(VIDEO_ID, formatKey(AUDIO.format))
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(body))))
  assert.equal(stub.requests.length, calls)
  assert.ok(served.length && served.every(item => item.startsWith('248')))
  context.cache.clearSegments(VIDEO_ID)
  context.nativeFetch = async () => { throw new TypeError('Failed to fetch') }
  const parts = await partsOf(await context.server.handle(playerCall(body)))
  assert.deepEqual(parts.map(part => part.type), [PART.NEXT_REQUEST_POLICY])
  assert.equal(parsePolicy(parts[0].payload).backoffMs, 2000)
})

test('while marked offline a request for missing parts still tries the network', async () => {
  const { context, stub } = await ready()
  context.network.online = false
  context.cache.clearSegments(VIDEO_ID)
  const before = stub.requests.length
  const body = playerBody({ timeMs: 3000, formats: BOTH })
  const parts = await partsOf(await context.server.handle(playerCall(body)))
  assert.equal(stub.requests.length, before + 1)
  assert.equal(context.network.online, true)
  assert.ok(parts.some(part => part.type === PART.MEDIA_HEADER))
})

test('a failed network request turns into a waiting answer instead of an error', async () => {
  const { context } = await ready()
  context.cache.clearSegments(VIDEO_ID)
  context.nativeFetch = async () => { throw new TypeError('Failed to fetch') }
  const body = playerBody({ timeMs: 3000, formats: BOTH })
  const parts = await partsOf(await context.server.handle(playerCall(body)))
  assert.equal(context.network.online, false)
  assert.deepEqual(parts.map(part => part.type), [PART.NEXT_REQUEST_POLICY])
})

test('a quality change by hand drops the cached video track and goes to the network', async () => {
  const { context, stub, calls } = await ready()
  const session = context.sessions.get(VIDEO_ID)
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    manualResolution: 720,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  await (await context.server.handle(playerCall(body))).arrayBuffer()
  assert.ok(stub.requests.length > calls, 'the request went to the network')
  assert.equal(context.cache.ranges(VIDEO_ID, formatKey(VIDEO.format)).length > 0, true, 'the network answer is cached again')
  assert.deepEqual(session.tracks.video, VIDEO.format)
})

test('split ranges of one format are read as one buffer', async () => {
  const { context } = await ready()
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 },
      { format: VIDEO.format, startMs: 5000, durationMs: 35000, startSegment: 2, endSegment: 8 }
    ]
  })
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(body))))
  assert.equal(served.find(item => item.startsWith('248')), '248#9')
})

test('a quality picked before the video started is not taken for a change', async () => {
  const { context, stub } = setup()
  await (await context.server.handle(playerCall(playerBody({ manualResolution: 1080 })))).arrayBuffer()
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
  const calls = stub.requests.length
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    manualResolution: 1080,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  const served = servedSegments(await partsOf(await context.server.handle(playerCall(body))))
  assert.equal(stub.requests.length, calls)
  assert.ok(served.includes('248#3'))
})

test('a flushed player buffer does not count against serving', async () => {
  const { context } = await ready()
  const session = context.sessions.get(VIDEO_ID)
  const body = playerBody({
    timeMs: 3000,
    formats: BOTH,
    ranges: [
      { format: AUDIO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 1 },
      { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
    ]
  })
  await (await context.server.handle(playerCall(body))).arrayBuffer()
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH })))).arrayBuffer()
  assert.equal(session.strikes, 0)
})

test('an attestation request pauses loading until the player brings a new token', async () => {
  const { context, stub } = setup()
  stub.state.protect = true
  await (await context.server.handle(playerCall(playerBody()))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
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
  await until(() => context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)) && context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)))
})

test('a player that set up its formats before the extension saw them still gets loaded ahead', async () => {
  const { context, stub } = setup()
  const ranges = [
    { format: AUDIO.format, startMs: 0, durationMs: 20000, startSegment: 1, endSegment: 2 },
    { format: VIDEO.format, startMs: 0, durationMs: 10000, startSegment: 1, endSegment: 2 }
  ]
  learnKinds(TRACKS.map(track => ({ itag: track.format.itag, mimeType: track.mime })))
  await (await context.server.handle(playerCall(playerBody({ timeMs: 3000, formats: BOTH, ranges })))).arrayBuffer()
  const session = context.sessions.get(VIDEO_ID)
  assert.deepEqual(session.tracks, { audio: AUDIO.format, video: VIDEO.format })
  await until(() => context.cache.complete(VIDEO_ID, formatKey(AUDIO.format)) && context.cache.complete(VIDEO_ID, formatKey(VIDEO.format)))
  assert.equal(stub.requests[1].parsed.initializedFormats.length, 0, 'the first prefetch asks for the format setup again')
  assert.ok(context.cache.find(VIDEO_ID, formatKey(VIDEO.format)).init, 'the init segment is in memory for the reload copy')
})
