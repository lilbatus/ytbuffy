import { normalize } from '../shared/settings.js'
import { setLanguage, t } from '../shared/i18n.js'
import { formatTime } from '../shared/format.js'

const CHANNEL = 'ytbuffy-vault'
const AHEAD_S = 90
const BEHIND_S = 30
const BATCH = 4
const ASK_TIMEOUT_MS = 5000
const PUMP_MS = 500
const PROBE_MS = 5000
const PROBE_TIMEOUT_MS = 4000
const TIME_MS = 3000
const PROBE_URL = 'https://www.youtube.com/generate_204'

const byId = id => document.getElementById(id)
const video = byId('video')
const back = byId('back')
const params = new URLSearchParams(location.search)
const videoId = params.get('v') || ''
const requestedS = Number(params.get('t')) || 0
const channel = new BroadcastChannel(CHANNEL)
const pending = new Map()
let online = false
let cachedEndS = 0
let port = null
let probes = 0
let probeTimer = 0

channel.onmessage = ({ data }) => {
  const resolve = pending.get(data?.id)
  if (!resolve) return
  pending.delete(data.id)
  resolve(data)
}

function ask(type, fields = {}) {
  const id = crypto.randomUUID()
  return new Promise(resolve => {
    pending.set(id, resolve)
    channel.postMessage({ type, id, videoId, ...fields })
    setTimeout(() => {
      if (pending.delete(id)) resolve(null)
    }, ASK_TIMEOUT_MS)
  })
}

function endOf(track) {
  const [, startMs, durationMs] = track.segments[track.segments.length - 1]
  return (startMs + durationMs) / 1000
}

function pickTracks(manifest) {
  const best = kind => manifest.tracks
    .filter(track => track.kind === kind && MediaSource.isTypeSupported(track.mimeType))
    .sort((a, b) => b.segments.length - a.segments.length)[0]
  const tracks = [best('video'), best('audio')]
  return tracks.every(Boolean) ? tracks : null
}

function startPoint(tracks) {
  const firstS = Math.max(...tracks.map(track => track.segments[0][1] / 1000))
  return Math.min(Math.max(requestedS, firstS), Math.max(firstS, cachedEndS - 1))
}

function waitFor(target, success) {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener('error', failed)
      resolve()
    }
    const failed = () => {
      target.removeEventListener(success, done)
      reject(new Error(`${success} failed`))
    }
    target.addEventListener(success, done, { once: true })
    target.addEventListener('error', failed, { once: true })
  })
}

function createFeed(source, track, durationS) {
  const buffer = source.addSourceBuffer(track.mimeType)
  const lastS = endOf(track)
  let busy = false

  async function append(bytes) {
    const finished = waitFor(buffer, 'updateend')
    buffer.appendBuffer(bytes)
    await finished
  }

  function bufferedEnd(now) {
    const ranges = buffer.buffered
    for (let index = 0; index < ranges.length; index++) {
      if (ranges.start(index) <= now + 0.3 && now < ranges.end(index)) return ranges.end(index)
    }
    return now
  }

  async function trim(now) {
    const ranges = buffer.buffered
    if (!ranges.length || ranges.start(0) >= now - BEHIND_S - 10) return
    const finished = waitFor(buffer, 'updateend')
    buffer.remove(ranges.start(0), now - BEHIND_S)
    await finished
  }

  async function pump(now) {
    if (busy || buffer.updating) return
    busy = true
    try {
      await trim(now)
      const end = bufferedEnd(now)
      if (end >= Math.min(now + AHEAD_S, lastS - 0.1)) return
      const numbers = track.segments
        .filter(([, startMs, durationMs]) => (startMs + durationMs) / 1000 > end + 0.1)
        .slice(0, BATCH)
        .map(([number]) => number)
      if (!numbers.length) return
      const reply = await ask('segments', { key: track.key, numbers })
      for (const segment of reply?.segments || []) await append(segment.data)
    } finally {
      busy = false
    }
  }

  return {
    init: () => append(track.init),
    pump,
    complete: now => !busy && !buffer.updating && lastS >= durationS - 1.5 && bufferedEnd(now) >= lastS - 0.3
  }
}

async function play(manifest, tracks) {
  const source = new MediaSource()
  const opened = waitFor(source, 'sourceopen')
  video.src = URL.createObjectURL(source)
  await opened
  const durationS = manifest.durationMs / 1000
  if (durationS) source.duration = durationS
  const feeds = tracks.map(track => createFeed(source, track, durationS))
  for (const feed of feeds) await feed.init()
  video.currentTime = startPoint(tracks)
  const pump = () => {
    for (const feed of feeds) feed.pump(video.currentTime).catch(() => {})
    if (source.readyState === 'open' && feeds.every(feed => feed.complete(video.currentTime))) source.endOfStream()
  }
  video.addEventListener('seeking', pump)
  setInterval(pump, PUMP_MS)
  pump()
  video.play().catch(() => {})
}

function render() {
  const status = byId('status')
  status.textContent = online ? t('replayOnline') : t('replayOffline', formatTime(cachedEndS))
  status.classList.toggle('online', online)
  back.classList.toggle('waiting', !online)
  back.setAttribute('aria-disabled', String(!online))
}

async function probe() {
  const id = ++probes
  clearTimeout(probeTimer)
  let reachable = true
  try {
    await fetch(PROBE_URL, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  } catch {
    reachable = false
  }
  if (id !== probes) return
  online = reachable
  render()
  probeTimer = setTimeout(probe, PROBE_MS)
}

function keepTime() {
  port = chrome.runtime.connect({ name: 'vault-replay' })
  port.onDisconnect.addListener(() => {
    port = null
  })
  setInterval(() => port?.postMessage({ op: 'time', videoId, timeMs: Math.round(video.currentTime * 1000) }), TIME_MS)
}

function note(text) {
  byId('note').textContent = text
}

video.addEventListener('timeupdate', () => {
  back.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(video.currentTime)}s`
  if (cachedEndS && video.currentTime >= cachedEndS - 0.5) note(t('replayEnded'))
})

back.addEventListener('click', event => {
  if (!online) event.preventDefault()
})

window.addEventListener('online', probe)
window.addEventListener('offline', probe)

document.addEventListener('keydown', event => {
  if (event.target === video || event.ctrlKey || event.metaKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === ' ' || key === 'k') {
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  } else if (key === 'arrowleft' || key === 'j') {
    video.currentTime -= key === 'j' ? 10 : 5
  } else if (key === 'arrowright' || key === 'l') {
    video.currentTime += key === 'l' ? 10 : 5
  } else if (key === 'f') {
    if (document.fullscreenElement) document.exitFullscreen()
    else video.requestFullscreen()
  } else if (key === 'm') {
    video.muted = !video.muted
  } else {
    return
  }
  event.preventDefault()
})

start()

async function start() {
  const settings = normalize((await chrome.storage.local.get('settings')).settings)
  setLanguage(settings.language)
  document.documentElement.lang = settings.language
  byId('heading').textContent = t('replayHeading')
  back.textContent = t('replayBack')
  back.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.floor(requestedS)}s`
  probe()
  const reply = await ask('manifest')
  const manifest = reply?.manifest
  const tracks = manifest && pickTracks(manifest)
  if (!tracks) {
    note(t('replayMissing'))
    return
  }
  byId('title').textContent = manifest.title
  document.title = manifest.title ? `${manifest.title} · ${t('extName')}` : t('extName')
  cachedEndS = Math.min(...tracks.map(endOf))
  render()
  keepTime()
  try {
    await play(manifest, tracks)
  } catch {
    note(t('replayFailed'))
  }
}
