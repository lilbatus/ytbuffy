import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encode, makeVarint, makeBytes } from '../src/page/protobuf.js'
import { writePart } from '../src/page/ump.js'
import { PART } from '../src/page/sabr.js'
import { createCache } from '../src/page/cache.js'
import { createScheduler } from '../src/page/scheduler.js'
import { createSession } from '../src/page/session.js'
import { learnFormats } from '../src/page/formats.js'
import { DEFAULTS } from '../src/shared/settings.js'

const video = { itag: 248, lmt: 1, xtags: '' }
const audio = { itag: 251, lmt: 2, xtags: '' }
const nextVideo = { itag: 248, lmt: 3, xtags: '' }
const nextAudio = { itag: 251, lmt: 4, xtags: '' }
const lowVideo = { itag: 244, lmt: 5, xtags: '' }

learnFormats([
  { itag: 248, mimeType: 'video/webm', width: 1920, height: 1080, bitrate: 2600000 },
  { itag: 244, mimeType: 'video/webm', width: 854, height: 480, bitrate: 700000 },
  { itag: 251, mimeType: 'audio/webm', bitrate: 130000 }
])

function setup(overrides = {}) {
  const cache = createCache()
  const sessions = new Map()
  const player = {
    current: 'current',
    videoId: () => player.current,
    time: () => 0,
    live: () => false,
    shorts: () => false,
    ad: () => false,
    paused: () => false
  }
  const context = {
    settings: { ...DEFAULTS, startMode: 'open', ...overrides },
    cache,
    sessions,
    player,
    network: { online: true, check() {}, failed() {}, succeeded() {} },
    next: { upcoming: () => ['next'] },
    mirror: { ready: () => true },
    manualIds: new Set(),
    playedIds: new Set(),
    limited: false,
    active: () => true
  }
  const current = session('current', audio, video)
  const next = session('next', nextAudio, nextVideo)
  next.autostart = true
  sessions.set('current', current)
  sessions.set('next', next)
  return { context, cache, current, next, scheduler: createScheduler(context) }
}

function session(id, audioFormat, videoFormat) {
  const value = createSession(id)
  value.body = new Uint8Array(0)
  value.url = `https://rr1---sn-test.googlevideo.com/videoplayback?ei=${id}&expire=1&sabr=1&rn=1`
  value.init = { method: 'POST', headers: {} }
  value.settleUntil = 1
  value.tracks = { audio: audioFormat, video: videoFormat }
  return value
}

function fillAll(cache, id, audioFormat, videoFormat) {
  cache.describe(id, { format: audioFormat, endSegment: 2, endTimeMs: 20000, mimeType: 'audio/webm' }, new Uint8Array(1))
  cache.describe(id, { format: videoFormat, endSegment: 4, endTimeMs: 20000, mimeType: 'video/webm' }, new Uint8Array(1))
  for (const number of [1, 2]) {
    cache.add(id, { format: audioFormat, segment: number, startMs: (number - 1) * 10000, durationMs: 10000 }, new Uint8Array(1), new Uint8Array(10))
  }
  for (const number of [1, 2, 3, 4]) {
    cache.add(id, { format: videoFormat, segment: number, startMs: (number - 1) * 5000, durationMs: 5000 }, new Uint8Array(1), new Uint8Array(10))
  }
}

test('the current video comes first', () => {
  const { scheduler } = setup()
  const job = scheduler.pick()
  assert.equal(job.session.videoId, 'current')
  assert.equal(job.isCurrent, true)
})

test('the current video waits while YouTube picks the quality', () => {
  const { scheduler, current } = setup()
  current.settleUntil = 0
  assert.equal(scheduler.evaluate(current, true).state, 'settling')
  assert.equal(scheduler.pick(), null)
  current.settleUntil = Date.now() + 10000
  assert.equal(scheduler.evaluate(current, true).state, 'settling')
})

test('a video that is already complete shows as done while YouTube picks the quality', () => {
  const { scheduler, cache, current } = setup()
  fillAll(cache, 'current', audio, video)
  current.settleUntil = 0
  assert.equal(scheduler.evaluate(current, true).state, 'done')
})

test('offline there is nothing to settle', () => {
  const { scheduler, context, current } = setup()
  current.settleUntil = 0
  context.network.online = false
  assert.notEqual(scheduler.evaluate(current, true).state, 'settling')
})

test('the next video waits while the current one is still loading', () => {
  const { scheduler, cache, current } = setup()
  cache.describe('current', { format: video, endSegment: 4, endTimeMs: 20000, mimeType: 'video/webm' }, new Uint8Array(1))
  cache.add('current', { format: video, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), new Uint8Array(10))
  assert.equal(scheduler.evaluate(current, true).state, 'loading')
  assert.equal(scheduler.pick().session.videoId, 'current')
})

test('a complete current video hands over to the next one', () => {
  const { scheduler, cache, current } = setup()
  fillAll(cache, 'current', audio, video)
  assert.equal(scheduler.evaluate(current, true).state, 'done')
  const job = scheduler.pick()
  assert.equal(job.session.videoId, 'next')
  assert.equal(job.isCurrent, false)
})

test('a paused player blocks everything when loading while paused is off', () => {
  const { scheduler, context, current } = setup({ whilePaused: false })
  context.player.paused = () => true
  assert.equal(scheduler.evaluate(current, true).state, 'paused')
  assert.equal(scheduler.pick(), null)
})

test('start on play waits until the video has played', () => {
  const { scheduler, context, current } = setup({ startMode: 'play' })
  assert.equal(scheduler.evaluate(current, true).state, 'waiting')
  context.playedIds.add('current')
  assert.equal(scheduler.evaluate(current, true).state, 'loading')
})

test('manual mode waits for the load button', () => {
  const { scheduler, context, current } = setup({ startMode: 'manual' })
  assert.equal(scheduler.evaluate(current, true).state, 'manual')
  context.manualIds.add('current')
  assert.equal(scheduler.evaluate(current, true).state, 'loading')
})

test('a video played to its end is done, even when the end has left memory', () => {
  const { scheduler, cache, context, current } = setup()
  fillAll(cache, 'current', audio, video)
  cache.clearSegments('current')
  context.player.time = () => 19.5
  assert.equal(scheduler.evaluate(current, true).state, 'done')
  context.player.time = () => 10
  assert.equal(scheduler.evaluate(current, true).state, 'loading')
})

test('a minutes target is reached before the end of the video', () => {
  const { scheduler, cache, current } = setup({ aheadMode: 'minutes', aheadMinutes: 1 })
  fillAll(cache, 'current', audio, video)
  cache.describe('current', { format: video, endSegment: 100, endTimeMs: 500000, mimeType: 'video/webm' }, new Uint8Array(1))
  cache.describe('current', { format: audio, endSegment: 50, endTimeMs: 500000, mimeType: 'audio/webm' }, new Uint8Array(1))
  assert.equal(scheduler.evaluate(current, true).state, 'loading')
})

test('live videos and ads are never prefetched', () => {
  const { scheduler, context, current } = setup()
  context.player.live = () => true
  assert.equal(scheduler.evaluate(current, true).state, 'live')
  context.player.live = () => false
  context.player.ad = () => true
  assert.equal(scheduler.evaluate(current, true).state, 'ad')
  assert.equal(scheduler.pick(), null)
})

test('a backoff from YouTube makes only that video wait', () => {
  const { scheduler, current } = setup()
  current.nextAt = Date.now() + 30000
  const result = scheduler.evaluate(current, true)
  assert.equal(result.state, 'loading')
  assert.equal(result.job, undefined)
  assert.ok(result.wait > 25000)
})

test('switching videos does not wait for the backoff of the video before', async () => {
  const { scheduler, context } = setup()
  const { sessions } = context
  const fetched = []
  context.nativeFetch = async url => {
    fetched.push(new URL(url).searchParams.get('ei'))
    const policy = writePart(PART.NEXT_REQUEST_POLICY, encode([makeVarint(4, 30000), makeBytes(7, Uint8Array.of(1))]))
    return new Response(policy, { status: 200 })
  }
  context.next.upcoming = () => []
  scheduler.wake()
  const started = Date.now()
  while (!fetched.includes('current') && Date.now() - started < 2000) await new Promise(resolve => setTimeout(resolve, 5))
  const other = session('other', nextAudio, nextVideo)
  sessions.set('other', other)
  context.player.current = 'other'
  scheduler.wake()
  while (!fetched.includes('other') && Date.now() - started < 2000) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(fetched.includes('other'), 'the new video was loaded right away')
})

test('an attestation pause blocks loading until its wait is over', () => {
  const { scheduler, current } = setup()
  current.blockedToken = 'token'
  current.blockedUntil = Date.now() + 60000
  assert.equal(scheduler.evaluate(current, true).state, 'error')
  current.blockedUntil = Date.now() - 1
  assert.ok(scheduler.evaluate(current, true).job)
})

test('the memory limit removes watched parts when allowed, otherwise loading stops', () => {
  const { scheduler, context, cache } = setup({ memoryMb: 50, onLimit: ['watched'] })
  const big = new Uint8Array(30 * 1048576)
  cache.add('current', { format: video, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  cache.add('current', { format: video, segment: 2, startMs: 5000, durationMs: 5000 }, new Uint8Array(1), big)
  context.player.time = () => 60
  assert.ok(scheduler.pick())
  assert.ok(cache.bytes < 50 * 1048576)

  const stopped = setup({ memoryMb: 50, onLimit: [] })
  stopped.cache.add('current', { format: video, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  stopped.cache.add('current', { format: video, segment: 2, startMs: 5000, durationMs: 5000 }, new Uint8Array(1), big)
  stopped.context.player.time = () => 60
  assert.equal(stopped.scheduler.pick(), null)
  assert.equal(stopped.context.limited, true)
})

test('formats the player no longer uses go first when memory runs out', () => {
  const { scheduler, cache } = setup({ memoryMb: 50, onLimit: [] })
  const big = new Uint8Array(30 * 1048576)
  cache.describe('current', { format: lowVideo, endSegment: 4, endTimeMs: 20000, mimeType: 'video/webm' }, new Uint8Array(1))
  cache.add('current', { format: lowVideo, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  cache.add('current', { format: video, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  assert.ok(scheduler.pick())
  assert.equal(cache.find('current', '244:5:'), null)
  assert.ok(cache.find('current', '248:1:').segments.has(1))
})

test('the next video gives its memory to the current one', () => {
  const { scheduler, cache } = setup({ memoryMb: 50, onLimit: [] })
  const big = new Uint8Array(30 * 1048576)
  cache.add('next', { format: nextVideo, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  cache.add('next', { format: nextVideo, segment: 2, startMs: 5000, durationMs: 5000 }, new Uint8Array(1), big)
  const job = scheduler.pick()
  assert.equal(job.session.videoId, 'current')
  assert.ok(cache.bytes < 50 * 1048576)
})

test('other videos are removed before watched parts', () => {
  const { scheduler, context, cache } = setup({ memoryMb: 50, onLimit: ['others', 'watched'] })
  const big = new Uint8Array(30 * 1048576)
  cache.add('old', { format: { itag: 248, lmt: 9, xtags: '' }, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  cache.add('current', { format: video, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), big)
  context.sessions.set('old', session('old', audio, { itag: 248, lmt: 9, xtags: '' }))
  context.player.time = () => 60
  assert.ok(scheduler.pick())
  assert.equal(cache.ids().includes('old'), false)
  assert.ok(cache.find('current', '248:1:').segments.has(1), 'watched part stays while the old video freed enough')
  assert.equal(context.sessions.has('old'), false)
})

test('with following quality changes off, parts loaded in another quality count as loaded', () => {
  const { scheduler, cache, current } = setup({ refetchOnQualityChange: false })
  fillAll(cache, 'current', audio, video)
  current.tracks.video = lowVideo
  cache.describe('current', { format: lowVideo, endSegment: 4, endTimeMs: 20000, mimeType: 'video/webm' }, new Uint8Array(1))
  assert.equal(scheduler.evaluate(current, true).state, 'done')
  const strict = setup()
  fillAll(strict.cache, 'current', audio, video)
  strict.current.tracks.video = lowVideo
  strict.cache.describe('current', { format: lowVideo, endSegment: 4, endTimeMs: 20000, mimeType: 'video/webm' }, new Uint8Array(1))
  assert.equal(strict.scheduler.evaluate(strict.current, true).state, 'loading')
})

test('a paused loader picks nothing until it is resumed', () => {
  const { scheduler, context } = setup()
  context.held = true
  assert.equal(scheduler.pick(), null)
  context.held = false
  assert.ok(scheduler.pick())
})
