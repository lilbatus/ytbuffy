import { send } from './bridge.js'
import { formatKey, parseFormatInit, parseMediaHeader } from './sabr.js'
import { log } from './log.js'

const MIB = 1048576
const RESTORE_WAIT_MS = 5000

export function createMirror(context) {
  const sent = new Set()
  const restores = new Map()
  let connected = false
  let restoring = false

  function on() {
    return connected && !restoring && context.active() && context.settings.keepOnReload
  }

  function copy(bytes) {
    return bytes.slice().buffer
  }

  function sendSegment(videoId, track, segment) {
    const header = copy(segment.header)
    const data = copy(segment.data)
    send('vault', {
      op: 'segment', videoId, key: track.key, number: segment.number,
      startMs: segment.startMs, durationMs: segment.durationMs, header, data
    }, [header, data])
  }

  function sendTrack(videoId, track) {
    const id = `${videoId}|${track.key}`
    if (sent.has(id) || !track.meta || !track.init) return
    sent.add(id)
    const meta = copy(track.meta.raw)
    const initHeader = copy(track.init.header)
    const init = copy(track.init.data)
    send('vault', { op: 'track', videoId, key: track.key, mimeType: track.meta.mimeType, meta, initHeader, init }, [meta, initHeader, init])
    for (const segment of track.segments.values()) sendSegment(videoId, track, segment)
  }

  const events = {
    described(videoId, track) {
      if (on()) sendTrack(videoId, track)
    },
    initialized(videoId, track) {
      if (on()) sendTrack(videoId, track)
    },
    added(videoId, track, segment) {
      if (!on()) return
      if (sent.has(`${videoId}|${track.key}`)) sendSegment(videoId, track, segment)
      else sendTrack(videoId, track)
    },
    cleared(videoId, key) {
      if (!on()) return
      sent.delete(`${videoId}|${key}`)
      send('vault', { op: 'clear', videoId, key })
    },
    dropped(videoId) {
      if (!on()) return
      for (const id of [...sent]) if (id.startsWith(`${videoId}|`)) sent.delete(id)
      send('vault', { op: 'drop', videoId })
    }
  }

  function connect() {
    connected = true
    sent.clear()
    restores.clear()
    if (!on()) return
    for (const videoId of context.cache.ids()) {
      for (const track of context.cache.tracks(videoId)) sendTrack(videoId, track)
    }
  }

  function disconnect() {
    connected = false
  }

  function tick() {
    if (!on()) return
    const { player, sessions } = context
    const videoId = player.videoId()
    const session = videoId && sessions.get(videoId)
    if (!session?.body) return
    send('vault', {
      op: 'time', videoId, title: player.title(), durationMs: Math.round(player.duration() * 1000),
      timeMs: Math.round(player.time() * 1000), limitBytes: context.settings.memoryMb * MIB,
      keepBehindMs: context.settings.trimCopy ? context.settings.trimCopyMinutes * 60000 : 0
    })
  }

  function ready(session) {
    if (!on()) return true
    const keys = [session.tracks.audio, session.tracks.video].filter(Boolean).map(formatKey)
    if (keys.length < 2) return true
    let entry = restores.get(session.videoId)
    if (!entry) {
      entry = { at: Date.now(), done: false }
      restores.set(session.videoId, entry)
      send('vault', { op: 'restore', videoId: session.videoId, keys })
    }
    return entry.done || Date.now() - entry.at > RESTORE_WAIT_MS
  }

  function restored(videoId) {
    const entry = restores.get(videoId)
    if (entry) entry.done = true
    context.scheduler.wake()
  }

  function restore({ videoId, key, meta, initHeader, init, segments }) {
    const { cache } = context
    let added = 0
    restoring = true
    try {
      if (meta) cache.describe(videoId, parseFormatInit(new Uint8Array(meta)), new Uint8Array(meta))
      if (initHeader && init) cache.add(videoId, parseMediaHeader(new Uint8Array(initHeader)), new Uint8Array(initHeader), new Uint8Array(init))
      for (const segment of segments) {
        const header = new Uint8Array(segment.header)
        if (cache.add(videoId, parseMediaHeader(header), header, new Uint8Array(segment.data))) added += 1
      }
    } finally {
      restoring = false
    }
    sent.add(`${videoId}|${key}`)
    if (added) log('restored from the extension memory', videoId, key.split(':')[0], `+${added} segments`)
    context.scheduler.wake()
  }

  return { events, connect, disconnect, tick, ready, restore, restored }
}
