import { normalize } from '../shared/settings.js'
import { createOverlay } from './overlay.js'

const CHANNEL = 'ytbuffy'
const RECONNECT_MS = 3000
const PAGE_COMMANDS = ['load', 'hold', 'release']
const overlay = createOverlay()
let settings = null
let status = null
let vault = null
let vaultWanted = false

function post(type, data, transfer = []) {
  window.postMessage({ channel: CHANNEL, to: 'page', type, data }, location.origin, transfer)
}

function publish() {
  post('settings', settings)
  overlay.configure(settings)
  setVault(settings.enabled && settings.keepOnReload)
}

function encode(message) {
  const result = { ...message }
  for (const [key, value] of Object.entries(result)) {
    if (value instanceof ArrayBuffer) result[key] = new Uint8Array(value).toBase64()
  }
  return result
}

function decode(value) {
  return Uint8Array.fromBase64(value).buffer
}

function setVault(wanted) {
  if (wanted === vaultWanted) return
  vaultWanted = wanted
  if (wanted) {
    openVault()
    return
  }
  if (!vault) return
  vault.postMessage({ op: 'forget' })
  vault.disconnect()
  vault = null
  post('vault-lost')
}

async function openVault() {
  if (vault || !vaultWanted) return
  const ready = await chrome.runtime.sendMessage({ type: 'vault-open' }).catch(() => false)
  if (!ready || vault || !vaultWanted) return
  vault = chrome.runtime.connect({ name: 'vault' })
  vault.onMessage.addListener(restore)
  vault.onDisconnect.addListener(() => {
    vault = null
    post('vault-lost')
    if (vaultWanted) setTimeout(openVault, RECONNECT_MS)
  })
  post('vault-ready')
}

function restore(message) {
  if (message.op === 'restored') post('vault-restored', { videoId: message.videoId })
  if (message.op !== 'restore') return
  const transfer = []
  const data = { videoId: message.videoId, key: message.key, segments: [] }
  for (const field of ['meta', 'initHeader', 'init']) {
    if (!message[field]) continue
    data[field] = decode(message[field])
    transfer.push(data[field])
  }
  for (const segment of message.segments || []) {
    const item = { ...segment, header: decode(segment.header), data: decode(segment.data) }
    transfer.push(item.header, item.data)
    data.segments.push(item)
  }
  post('vault-restore', data, transfer)
}

chrome.storage.local.get('settings').then(stored => {
  settings = normalize(stored.settings)
  publish()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return
  settings = normalize(changes.settings.newValue)
  publish()
})

window.addEventListener('message', event => {
  const message = event.data
  if (event.source !== window || message?.channel !== CHANNEL || message.to !== 'content') return
  if (message.type === 'hello') {
    if (settings) publish()
    if (vault) post('vault-ready')
  } else if (message.type === 'status') {
    status = message.data
    overlay.update(status)
  } else if (message.type === 'vault') {
    vault?.postMessage(encode(message.data))
  } else if (message.type === 'replay') {
    chrome.runtime.sendMessage({ type: 'replay', videoId: message.data.videoId }).catch(() => {})
  } else {
    overlay.notify(message.type, message.data)
  }
})

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'status') {
    reply(status)
  } else if (PAGE_COMMANDS.includes(message?.type)) {
    post(message.type)
    reply(true)
  }
})
