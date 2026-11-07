import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache } from '../src/page/cache.js'
import { createScheduler } from '../src/page/scheduler.js'
import { createSession } from '../src/page/session.js'
import { DEFAULTS } from '../src/shared/settings.js'

const video = { itag: 248, lmt: 1, xtags: '' }
const audio = { itag: 251, lmt: 2, xtags: '' }
const nextVideo = { itag: 248, lmt: 3, xtags: '' }
const nextAudio = { itag: 251, lmt: 4, xtags: '' }

function setup(overrides = {}) {
  const cache = createCache()
  const sessions = new Map()
  const player = {
    videoId: () => 'current',
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
    network: { online: true },
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
  context.player.time = () => 60
  assert.ok(scheduler.pick())
  assert.equal(cache.ids().includes('old'), false)
  assert.ok(cache.find('current', '248:1:').segments.has(1), 'watched part stays while the old video freed enough')
  assert.equal(context.sessions.has('old'), false)
})

test('a paused loader picks nothing until it is resumed', () => {
  const { scheduler, context } = setup()
  context.held = true
  assert.equal(scheduler.pick(), null)
  context.held = false
  assert.ok(scheduler.pick())
})
