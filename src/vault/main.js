import { createStore } from './store.js'

const CHANNEL = 'ytbuffy-vault'
const PORTS = ['vault', 'vault-replay']
const GRACE_MS = 120000
const IDLE_MS = 60000
const BATCH_BYTES = 4 * 1048576

const store = createStore()
const ports = new Map()
const timers = new Map()
const channel = new BroadcastChannel(CHANNEL)
let idleTimer = 0

const bytes = value => typeof value === 'string' ? Uint8Array.fromBase64(value) : value
const text = value => value ? value.toBase64() : value

chrome.runtime.onConnect.addListener(port => {
  if (!PORTS.includes(port.name)) return
  const tabId = port.sender?.tab?.id
  hold(tabId)
  port.onMessage.addListener(message => receive(port, message, tabId))
  port.onDisconnect.addListener(() => release(tabId))
})

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'vault-find') {
    reply(store.find(message.videoId))
  } else if (message?.type === 'vault-tab-closed') {
    store.forgetTab(message.tabId)
    checkIdle()
  }
})

channel.onmessage = ({ data }) => {
  if (data?.type === 'manifest') {
    channel.postMessage({ type: 'manifest-reply', id: data.id, manifest: store.manifest(data.videoId) })
  } else if (data?.type === 'segments') {
    channel.postMessage({ type: 'segments-reply', id: data.id, segments: store.segments(data.videoId, data.key, data.numbers) })
  }
}

function receive(port, message, tabId) {
  if (message.op === 'segment') {
    store.segment({ ...message, header: bytes(message.header), data: bytes(message.data) }, tabId)
  } else if (message.op === 'track') {
    store.track({ ...message, meta: bytes(message.meta), initHeader: bytes(message.initHeader), init: bytes(message.init) }, tabId)
  } else if (message.op === 'time') {
    if (message.limitBytes) store.setLimit(message.limitBytes)
    if (message.keepBehindMs !== undefined) store.setKeepBehind(message.keepBehindMs)
    store.time(message, tabId)
  } else if (message.op === 'clear') {
    store.clear(message.videoId, message.key)
  } else if (message.op === 'drop') {
    store.drop(message.videoId)
  } else if (message.op === 'forget') {
    store.forgetTab(tabId)
  } else if (message.op === 'restore') {
    restore(port, message)
  }
}

function restore(port, { videoId, keys }) {
  for (const key of keys) {
    const track = store.restoreData(videoId, key)
    if (!track) continue
    port.postMessage({ op: 'restore', videoId, key, meta: text(track.meta), initHeader: text(track.initHeader), init: text(track.init), segments: [] })
    let batch = []
    let size = 0
    for (const segment of track.segments) {
      const { number, startMs, durationMs } = segment
      batch.push({ number, startMs, durationMs, header: text(segment.header), data: text(segment.data) })
      size += segment.data.length
      if (size < BATCH_BYTES) continue
      port.postMessage({ op: 'restore', videoId, key, segments: batch })
      batch = []
      size = 0
    }
    if (batch.length) port.postMessage({ op: 'restore', videoId, key, segments: batch })
  }
  port.postMessage({ op: 'restored', videoId })
}

function hold(tabId) {
  clearTimeout(idleTimer)
  if (tabId === undefined) return
  ports.set(tabId, (ports.get(tabId) || 0) + 1)
  clearTimeout(timers.get(tabId))
  timers.delete(tabId)
}

function release(tabId) {
  if (tabId === undefined) return
  const left = (ports.get(tabId) || 1) - 1
  if (left > 0) {
    ports.set(tabId, left)
    return
  }
  ports.delete(tabId)
  timers.set(tabId, setTimeout(() => {
    timers.delete(tabId)
    store.forgetTab(tabId)
    checkIdle()
  }, GRACE_MS))
}

function checkIdle() {
  clearTimeout(idleTimer)
  if (store.size || ports.size || timers.size) return
  idleTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'vault-idle' }).catch(() => {}), IDLE_MS)
}
