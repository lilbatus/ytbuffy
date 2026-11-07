import { concat } from './protobuf.js'
import { buildRequest, formatKey } from './sabr.js'
import { readParts } from './ump.js'
import { requestUrl, contextsOf, createConsumer, takeTurn, fail } from './session.js'
import { log } from './log.js'

const MIB = 1048576
const BEHIND_MS = 10000
const STALLS_TO_PAUSE = 3
const ANSWER_TIMEOUT_MS = 15000
const STALL_TIMEOUT_MS = 15000

export function createScheduler(context) {
  const { cache, sessions } = context
  let running = false

  function wake() {
    if (!running) run()
  }

  async function run() {
    running = true
    try {
      for (let job = pick(); job; job = pick()) {
        const ok = await prefetch(job)
        await sleep(pauseAfter(job.session, ok))
      }
    } catch (error) {
      log('scheduler stopped', error)
    } finally {
      running = false
    }
  }

  function started(session, isCurrent) {
    if (session.autostart || !isCurrent || context.manualIds.has(session.videoId)) return true
    const mode = context.settings.startMode
    return mode === 'open' || (mode === 'play' && context.playedIds.has(session.videoId))
  }

  function limitFor(isCurrent, fromMs) {
    const { settings } = context
    if (isCurrent) return settings.aheadMode === 'minutes' ? fromMs + settings.aheadMinutes * 60000 : Infinity
    return settings.nextAmount === 'minutes' ? settings.nextMinutes * 60000 : Infinity
  }

  function planTrack(videoId, format, fromMs, untilMs) {
    const key = formatKey(format)
    const first = cache.segmentAt(videoId, key, fromMs)
    const run = first ? cache.run(videoId, key, first) : null
    const endSegment = cache.find(videoId, key)?.meta?.endSegment || 0
    const complete = Boolean(run && endSegment && run.last >= endSegment)
    const endMs = run ? run.endMs : fromMs
    return { format, key, run, endMs, complete, reached: complete || endMs >= untilMs }
  }

  function evaluate(session, isCurrent) {
    const { settings, player } = context
    if (session.live || (isCurrent && player.live())) return { state: 'live' }
    if (isCurrent && player.shorts() && !settings.shorts) return { state: 'shorts' }
    if (isCurrent && player.ad()) return { state: 'ad' }
    if (!session.body) return { state: 'idle' }
    if (!started(session, isCurrent)) return { state: settings.startMode === 'manual' ? 'manual' : 'waiting' }
    if (!session.tracks.audio || !session.tracks.video) return { state: 'idle' }
    const formats = [session.tracks.audio, session.tracks.video]
    const fromMs = isCurrent ? player.time() * 1000 : 0
    const untilMs = limitFor(isCurrent, fromMs)
    const plans = formats.map(format => planTrack(session.videoId, format, fromMs, untilMs))
    if (plans.every(plan => plan.reached)) return { state: plans.every(plan => plan.complete) ? 'done' : 'target' }
    if (!settings.whilePaused && player.paused()) return { state: 'paused' }
    if (session.failure && Date.now() < session.retryAt) return { state: 'error' }
    return { state: 'loading', job: { session, plans, isCurrent } }
  }

  function upcomingSessions() {
    return context.next.upcoming().map(id => sessions.get(id)).filter(session => session?.body)
  }

  function pick() {
    const { player } = context
    context.limited = false
    if (!context.active() || !context.network.online || context.held) return null
    const currentId = player.videoId()
    const current = currentId && sessions.get(currentId)
    if (current) {
      const result = evaluate(current, true)
      if (result.job) return context.mirror.ready(current) && room(result.job) ? result.job : null
      if (result.state !== 'done' && result.state !== 'target') return null
    }
    if (!context.settings.nextEnabled) return null
    for (const session of upcomingSessions()) {
      const result = evaluate(session, false)
      if (result.job) return context.mirror.ready(session) && room(result.job) ? result.job : null
    }
    return null
  }

  function room(job) {
    const { settings, player } = context
    const limit = settings.memoryMb * MIB
    if (cache.bytes < limit) return true
    const currentId = player.videoId()
    const upcoming = context.next.upcoming()
    const keep = new Set([currentId, ...upcoming])
    if (settings.onLimit.includes('others')) {
      for (const id of cache.ids()) {
        if (cache.bytes < limit) break
        if (!keep.has(id)) {
          cache.dropVideo(id)
          sessions.delete(id)
        }
      }
    }
    if (settings.onLimit.includes('watched') && currentId && cache.bytes >= limit) {
      cache.evictBefore(currentId, player.time() * 1000 - BEHIND_MS)
    }
    if (job.isCurrent) {
      for (const id of [...upcoming].reverse()) {
        if (cache.bytes < limit) break
        cache.trimEnd(id, limit)
      }
    }
    if (cache.bytes < limit) return true
    context.limited = true
    return false
  }

  async function prefetch({ session, plans }) {
    const turn = await takeTurn(session, 'prefetch')
    const pending = plans.filter(plan => !plan.reached)
    const timeMs = Math.min(...pending.map(plan => plan.endMs))
    const body = buildRequest(session.body, {
      playerTimeMs: timeMs,
      ranges: plans.filter(plan => plan.run).map(({ format, run }) => ({
        format,
        startMs: run.startMs,
        durationMs: run.endMs - run.startMs,
        startSegment: run.first,
        endSegment: run.last
      })),
      initializedFormats: plans.filter(plan => cache.find(session.videoId, plan.key)?.init).map(plan => plan.format),
      audioFormats: session.tracks.audio ? [session.tracks.audio] : [],
      videoFormats: session.tracks.video ? [session.tracks.video] : [],
      cookie: session.cookie,
      contexts: contextsOf(session),
      bandwidthEstimate: session.bandwidth || undefined
    })
    const startedAt = performance.now()
    const timer = new AbortController()
    const giveUp = reason => timer.abort(new DOMException(reason, 'TimeoutError'))
    try {
      const init = { ...session.init, body, cache: 'no-store', signal: AbortSignal.any([turn.signal, timer.signal]) }
      if (session.referrer) init.referrer = session.referrer
      const answer = setTimeout(giveUp, ANSWER_TIMEOUT_MS, 'no answer')
      const response = await context.nativeFetch(requestUrl(session), init).finally(() => clearTimeout(answer))
      context.network.succeeded()
      if (!response.ok) {
        fail(session, `http ${response.status}`)
        return false
      }
      const bytes = await readAll(response, () => giveUp('download stalled'))
      let added = 0
      const consume = createConsumer({ cache, session, onSegment: () => { added += 1 } })
      for (const part of readParts(bytes)) consume(part.type, part.payload)
      const seconds = (performance.now() - startedAt) / 1000
      log(`prefetch ${session.videoId} t=${(timeMs / 1000).toFixed(1)}s +${added} segments`,
        `${(bytes.length / MIB).toFixed(1)} MB in ${seconds.toFixed(1)}s, memory ${(cache.bytes / MIB).toFixed(0)} MB`,
        consume.summary.segments.join(' '))
      if (added) {
        session.stalls = 0
        session.failures = 0
      } else if (++session.stalls >= STALLS_TO_PAUSE) {
        session.stalls = 0
        fail(session, 'no new segments')
      }
      return added > 0
    } catch (error) {
      if (error.name === 'AbortError') return true
      context.network.failed()
      log('prefetch failed', error)
      return false
    } finally {
      turn.release()
    }
  }

  function pauseAfter(session, ok) {
    const backoff = Math.max(0, session.waitUntil - Date.now())
    return Math.max(context.settings.delayMs, backoff, ok ? 0 : 1000)
  }

  return { wake, evaluate, pick }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function readAll(response, onStall) {
  const reader = response.body.getReader()
  const chunks = []
  for (;;) {
    const stall = setTimeout(onStall, STALL_TIMEOUT_MS)
    const { done, value } = await reader.read().finally(() => clearTimeout(stall))
    if (done) return concat(chunks)
    chunks.push(value)
  }
}
