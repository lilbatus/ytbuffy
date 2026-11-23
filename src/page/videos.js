import { log } from './log.js'
import { retire, settle } from './session.js'

const CLOSED_PRUNE_MS = 60000

export function createVideos(context) {
  let currentId = null
  let closedAt = 0

  function drop(id) {
    const session = context.sessions.get(id)
    if (!session) return
    retire(session)
    context.sessions.delete(id)
  }

  function prune(id) {
    const { settings, cache, sessions } = context
    const keep = new Set([id, ...context.next.upcoming()])
    const others = cache.ids().filter(other => !keep.has(other))
    const room = id ? settings.keepVideos - 1 : settings.keepVideos
    const kept = settings.onSwitch === 'keep' && room > 0 ? others.slice(-room) : []
    for (const other of others) {
      if (kept.includes(other)) continue
      cache.dropVideo(other)
      drop(other)
    }
    for (const other of [...sessions.keys()]) {
      if (!keep.has(other) && !kept.includes(other)) drop(other)
    }
  }

  function switchTo(id) {
    const previous = currentId
    currentId = id
    if (!id) {
      closedAt = Date.now()
      log('video closed', previous)
      return
    }
    closedAt = 0
    context.cache.touch(id)
    const session = context.sessions.get(id)
    if (session) {
      if (session.source !== 'player') session.autostart = true
      settle(session)
    }
    prune(id)
    log('video changed', previous, '->', id)
  }

  function tick(id) {
    if (id !== currentId) switchTo(id)
    if (closedAt && Date.now() - closedAt > CLOSED_PRUNE_MS) {
      closedAt = 0
      prune(null)
      log('memory released after the video was closed')
    }
  }

  return { tick }
}
