import { formatKey } from './sabr.js'
import { intersect } from './cache.js'
import { send } from './bridge.js'

const MIB = 1048576
const HOLDABLE = ['loading', 'waiting', 'paused', 'error', 'target']

export function createStatus(context) {
  let loadedFor = ''
  let warnedFor = ''

  function coverage(session) {
    const keys = [session.tracks.audio, session.tracks.video].filter(Boolean).map(formatKey)
    if (!keys.length) return []
    return keys.map(key => context.cache.ranges(session.videoId, key)).reduce(intersect)
  }

  function durationOf(session) {
    let longest = 0
    for (const format of [session.tracks.audio, session.tracks.video]) {
      const meta = format && context.cache.find(session.videoId, formatKey(format))?.meta
      if (meta?.endTimeMs > longest) longest = meta.endTimeMs
    }
    return longest
  }

  function percentOf(covered, durationMs) {
    if (!durationMs) return 0
    const cachedMs = covered.reduce((sum, [start, end]) => sum + end - start, 0)
    return Math.min(100, Math.round(cachedMs / durationMs * 100))
  }

  function compute() {
    const { settings, player, sessions, cache, network } = context
    const videoId = player.videoId()
    const base = { enabled: settings.enabled, online: network.online, videoId, bytes: cache.bytes, limit: settings.memoryMb * MIB }
    if (!settings.enabled) return { ...base, state: 'off', percent: null }
    if (!videoId) return { ...base, state: 'idle', percent: null }
    const session = sessions.get(videoId)
    const result = session ? context.scheduler.evaluate(session, true) : { state: player.live() ? 'live' : 'idle' }
    const durationMs = player.duration() * 1000 || (session ? durationOf(session) : 0)
    const covered = session ? coverage(session) : []
    const timeMs = player.time() * 1000
    const around = covered.find(([start, end]) => start <= timeMs + 500 && timeMs < end)
    let state = result.state
    if (context.held && HOLDABLE.includes(state)) state = 'held'
    else if (!network.online && state !== 'live') state = 'offline'
    else if (context.limited && state === 'loading') state = 'limit'
    return {
      ...base,
      state,
      durationMs,
      timeMs,
      cachedMs: covered.reduce((sum, [start, end]) => sum + end - start, 0),
      aheadMs: around ? around[1] - timeMs : 0,
      percent: state === 'live' ? null : percentOf(covered, durationMs),
      ranges: durationMs ? covered.map(([start, end]) => [start / durationMs, Math.min(1, end / durationMs)]) : [],
      next: context.next.upcoming().map(id => {
        const upcoming = sessions.get(id)
        return { id, percent: upcoming ? percentOf(coverage(upcoming), durationOf(upcoming)) : 0 }
      })
    }
  }

  function report() {
    const status = compute()
    send('status', status)
    if (status.state === 'done' && loadedFor !== status.videoId) {
      loadedFor = status.videoId
      send('loaded', {})
    }
    const warnMs = context.settings.warnSeconds * 1000
    if (status.online) warnedFor = ''
    else if (warnMs && status.videoId && status.aheadMs > 0 && status.aheadMs <= warnMs && warnedFor !== status.videoId) {
      warnedFor = status.videoId
      send('warn', { seconds: Math.ceil(status.aheadMs / 1000) })
    }
    return status
  }

  return { compute, report }
}
