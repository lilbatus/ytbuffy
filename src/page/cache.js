import { formatKey } from './sabr.js'

export function createCache(events = {}) {
  const videos = new Map()
  const owners = new Map()
  let total = 0

  function video(id) {
    let entry = videos.get(id)
    if (!entry) {
      entry = { id, tracks: new Map(), usedAt: Date.now() }
      videos.set(id, entry)
    }
    return entry
  }

  function track(videoId, format) {
    const key = formatKey(format)
    const entry = video(videoId)
    let found = entry.tracks.get(key)
    if (!found) {
      found = { key, format, segments: new Map(), init: null, meta: null, bytes: 0 }
      entry.tracks.set(key, found)
      owners.set(key, videoId)
    }
    return found
  }

  function find(videoId, key) {
    return videos.get(videoId)?.tracks.get(key) || null
  }

  function grow(target, amount) {
    target.bytes += amount
    total += amount
  }

  function add(videoId, header, raw, data) {
    const target = track(videoId, header.format)
    if (header.isInit) {
      if (target.init) return false
      target.init = { header: raw, data }
      grow(target, raw.length + data.length)
      events.initialized?.(videoId, target)
      return false
    }
    if (!header.segment || !header.durationMs || target.segments.has(header.segment)) return false
    const segment = { number: header.segment, startMs: header.startMs, durationMs: header.durationMs, header: raw, data }
    target.segments.set(header.segment, segment)
    grow(target, raw.length + data.length)
    events.added?.(videoId, target, segment)
    return true
  }

  function describe(videoId, meta, raw) {
    const target = track(videoId, meta.format)
    target.meta = { endSegment: meta.endSegment, endTimeMs: meta.endTimeMs, mimeType: meta.mimeType, raw }
    events.described?.(videoId, target)
  }

  function segmentAt(videoId, key, timeMs) {
    const target = find(videoId, key)
    if (!target) return 0
    for (const segment of target.segments.values()) {
      if (segment.startMs <= timeMs && timeMs < segment.startMs + segment.durationMs) return segment.number
    }
    return 0
  }

  function run(videoId, key, from) {
    const target = find(videoId, key)
    const start = target?.segments.get(from)
    if (!start) return null
    let last = start
    for (let next = target.segments.get(from + 1); next; next = target.segments.get(last.number + 1)) last = next
    return { first: from, last: last.number, startMs: start.startMs, endMs: last.startMs + last.durationMs }
  }

  function ranges(videoId, key) {
    const target = find(videoId, key)
    if (!target) return []
    const sorted = [...target.segments.values()].sort((a, b) => a.startMs - b.startMs)
    const merged = []
    for (const segment of sorted) {
      const end = segment.startMs + segment.durationMs
      const last = merged[merged.length - 1]
      if (last && segment.startMs <= last[1] + 50) last[1] = Math.max(last[1], end)
      else merged.push([segment.startMs, end])
    }
    return merged
  }

  function complete(videoId, key) {
    const target = find(videoId, key)
    const end = target?.meta?.endSegment
    if (!end) return false
    for (let number = 1; number <= end; number++) {
      if (!target.segments.has(number)) return false
    }
    return true
  }

  function remove(target, segment) {
    target.segments.delete(segment.number)
    grow(target, -(segment.header.length + segment.data.length))
  }

  function evictBefore(videoId, timeMs) {
    for (const target of videos.get(videoId)?.tracks.values() || []) {
      for (const segment of target.segments.values()) {
        if (segment.startMs + segment.durationMs < timeMs) remove(target, segment)
      }
    }
  }

  function clearSegments(videoId, key) {
    for (const target of videos.get(videoId)?.tracks.values() || []) {
      if (key && target.key !== key) continue
      for (const segment of target.segments.values()) remove(target, segment)
      events.cleared?.(videoId, target.key)
    }
  }

  function trimEnd(videoId, limit) {
    const entry = videos.get(videoId)
    if (!entry) return
    const segments = []
    for (const target of entry.tracks.values()) {
      for (const segment of target.segments.values()) segments.push([target, segment])
    }
    segments.sort((a, b) => b[1].startMs - a[1].startMs)
    for (const [target, segment] of segments) {
      if (total < limit) return
      remove(target, segment)
    }
  }

  function dropVideo(videoId) {
    const entry = videos.get(videoId)
    if (!entry) return
    for (const target of entry.tracks.values()) {
      total -= target.bytes
      owners.delete(target.key)
    }
    videos.delete(videoId)
    events.dropped?.(videoId)
  }

  function clear() {
    for (const id of [...videos.keys()]) dropVideo(id)
  }

  function touch(videoId) {
    const entry = videos.get(videoId)
    if (entry) entry.usedAt = Date.now()
  }

  function ids() {
    return [...videos.values()].sort((a, b) => a.usedAt - b.usedAt).map(entry => entry.id)
  }

  function owner(key) {
    return owners.get(key) || null
  }

  function tracks(videoId) {
    return [...(videos.get(videoId)?.tracks.values() || [])]
  }

  return {
    add, describe, find, segmentAt, run, ranges, complete,
    evictBefore, clearSegments, trimEnd, dropVideo, clear, touch, ids, owner, tracks,
    get bytes() {
      return total
    }
  }
}

export function intersect(a, b) {
  const result = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i][0], b[j][0])
    const end = Math.min(a[i][1], b[j][1])
    if (start < end) result.push([start, end])
    if (a[i][1] < b[j][1]) i++
    else j++
  }
  return result
}
