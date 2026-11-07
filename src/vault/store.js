const MIB = 1048576
const PLAYING_MARGIN_MS = 30000

export function createStore() {
  const videos = new Map()
  let total = 0
  let limit = 500 * MIB
  let keepBehindMs = 0

  function videoFor(id, tabId) {
    let video = videos.get(id)
    if (!video) {
      video = { id, title: '', durationMs: 0, timeMs: 0, tabs: new Set(), tracks: new Map(), usedAt: 0 }
      videos.set(id, video)
    }
    if (tabId !== undefined) video.tabs.add(tabId)
    video.usedAt = Date.now()
    return video
  }

  function trackFor(video, key) {
    let track = video.tracks.get(key)
    if (!track) {
      track = { key, kind: '', mimeType: '', meta: null, initHeader: null, init: null, segments: new Map(), bytes: 0 }
      video.tracks.set(key, track)
    }
    return track
  }

  function grow(track, amount) {
    track.bytes += amount
    total += amount
  }

  function removeSegment(track, segment) {
    track.segments.delete(segment.number)
    grow(track, -(segment.header.length + segment.data.length))
  }

  function sizeOf(...parts) {
    return parts.reduce((sum, part) => sum + (part?.length || 0), 0)
  }

  function drop(id) {
    const video = videos.get(id)
    if (!video) return
    for (const track of video.tracks.values()) total -= track.bytes
    videos.delete(id)
  }

  function clear(id, key) {
    const track = videos.get(id)?.tracks.get(key)
    if (!track) return
    total -= track.bytes
    videos.get(id).tracks.delete(key)
  }

  function makeRoom(video, bytes) {
    const others = [...videos.values()].filter(other => other !== video).sort((a, b) => a.usedAt - b.usedAt)
    for (const other of others) {
      if (total + bytes <= limit) return true
      drop(other.id)
    }
    const watched = [...video.tracks.values()]
      .flatMap(item => [...item.segments.values()].map(segment => [item, segment]))
      .filter(([, segment]) => segment.startMs + segment.durationMs < video.timeMs - PLAYING_MARGIN_MS)
      .sort((a, b) => a[1].startMs - b[1].startMs)
    for (const [item, segment] of watched) {
      if (total + bytes <= limit) return true
      removeSegment(item, segment)
    }
    return total + bytes <= limit
  }

  function time({ videoId, title, durationMs, timeMs }, tabId) {
    const video = videoFor(videoId, tabId)
    video.title = title || video.title
    video.durationMs = durationMs || video.durationMs
    video.timeMs = timeMs
    if (!keepBehindMs) return
    for (const item of video.tracks.values()) {
      for (const segment of item.segments.values()) {
        if (segment.startMs + segment.durationMs < timeMs - keepBehindMs) removeSegment(item, segment)
      }
    }
  }

  function track({ videoId, key, mimeType, meta, initHeader, init }, tabId) {
    const target = trackFor(videoFor(videoId, tabId), key)
    grow(target, sizeOf(meta, initHeader, init) - sizeOf(target.meta, target.initHeader, target.init))
    Object.assign(target, { mimeType, kind: mimeType.startsWith('audio/') ? 'audio' : 'video', meta, initHeader, init })
  }

  function segment({ videoId, key, number, startMs, durationMs, header, data }, tabId) {
    const video = videoFor(videoId, tabId)
    const target = trackFor(video, key)
    if (target.segments.has(number)) return false
    if (keepBehindMs && video.timeMs && startMs + durationMs < video.timeMs - keepBehindMs) return false
    const size = header.length + data.length
    if (!makeRoom(video, size)) return false
    target.segments.set(number, { number, startMs, durationMs, header, data })
    grow(target, size)
    return true
  }

  function forgetTab(tabId) {
    for (const video of [...videos.values()]) {
      video.tabs.delete(tabId)
      if (!video.tabs.size) drop(video.id)
    }
  }

  function playable(video) {
    return [...video.tracks.values()].filter(item => item.init && item.mimeType && item.segments.size)
  }

  function find(id) {
    const video = videos.get(id)
    if (!video) return null
    const kinds = new Set(playable(video).map(item => item.kind))
    if (!kinds.has('audio') || !kinds.has('video')) return null
    return { videoId: id, title: video.title, timeMs: video.timeMs }
  }

  function sorted(target) {
    return [...target.segments.values()].sort((a, b) => a.startMs - b.startMs)
  }

  function manifest(id) {
    const video = videos.get(id)
    if (!video) return null
    return {
      videoId: id,
      title: video.title,
      durationMs: video.durationMs,
      timeMs: video.timeMs,
      tracks: playable(video).map(item => ({
        key: item.key,
        kind: item.kind,
        mimeType: item.mimeType,
        init: item.init,
        segments: sorted(item).map(({ number, startMs, durationMs }) => [number, startMs, durationMs])
      }))
    }
  }

  function segments(id, key, numbers) {
    const target = videos.get(id)?.tracks.get(key)
    if (!target) return []
    return numbers.map(number => target.segments.get(number)).filter(Boolean)
      .map(({ number, startMs, durationMs, data }) => ({ number, startMs, durationMs, data }))
  }

  function restoreData(id, key) {
    const target = videos.get(id)?.tracks.get(key)
    if (!target?.meta || !target.init) return null
    return { meta: target.meta, initHeader: target.initHeader, init: target.init, segments: sorted(target) }
  }

  return {
    setLimit: bytes => { limit = bytes },
    setKeepBehind: ms => { keepBehindMs = ms },
    time, track, segment, clear, drop, forgetTab, find, manifest, segments, restoreData,
    get bytes() {
      return total
    },
    get size() {
      return videos.size
    }
  }
}
