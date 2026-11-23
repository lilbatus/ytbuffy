import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache } from '../src/page/cache.js'
import { createSession, takeTurn } from '../src/page/session.js'
import { createVideos } from '../src/page/videos.js'
import { DEFAULTS } from '../src/shared/settings.js'

function setup(overrides = {}) {
  const context = {
    settings: { ...DEFAULTS, ...overrides },
    cache: createCache(),
    sessions: new Map(),
    next: { upcoming: () => [] }
  }
  return { context, videos: createVideos(context) }
}

function watch(context, id) {
  context.cache.add(id, { format: { itag: 248, lmt: id.length, xtags: id }, segment: 1, startMs: 0, durationMs: 5000 }, new Uint8Array(1), new Uint8Array(100))
  const session = createSession(id)
  session.settleUntil = 1
  context.sessions.set(id, session)
  return session
}

test('opening a video from the home page clears the one watched before', () => {
  const { context, videos } = setup()
  videos.tick('first')
  watch(context, 'first')
  videos.tick(null)
  videos.tick('second')
  assert.deepEqual(context.cache.ids(), [])
  assert.equal(context.sessions.has('first'), false)
})

test('keeping recent videos also works when coming from the home page', () => {
  const { context, videos } = setup({ onSwitch: 'keep', keepVideos: 2 })
  videos.tick('first')
  watch(context, 'first')
  videos.tick(null)
  videos.tick('second')
  assert.deepEqual(context.cache.ids(), ['first'])
  assert.ok(context.sessions.has('first'))
})

test('a dropped video stops its download', async () => {
  const { context, videos } = setup()
  videos.tick('first')
  const session = watch(context, 'first')
  const turn = await takeTurn(session, 'prefetch')
  videos.tick('second')
  assert.equal(session.retired, true)
  assert.equal(turn.signal.aborted, true)
})

test('opening a video gives YouTube time to pick its quality again', () => {
  const { context, videos } = setup()
  const session = watch(context, 'first')
  videos.tick('first')
  assert.ok(session.settleUntil > Date.now())
})

test('memory is released a minute after leaving the videos', () => {
  const { context, videos } = setup()
  videos.tick('first')
  watch(context, 'first')
  const now = Date.now
  try {
    videos.tick(null)
    Date.now = () => now() + 61000
    videos.tick(null)
  } finally {
    Date.now = now
  }
  assert.deepEqual(context.cache.ids(), [])
})
