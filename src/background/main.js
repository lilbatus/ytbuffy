import { normalize } from '../shared/settings.js'

const VAULT_URL = 'vault.html'
const NETWORK_ERROR = /ERR_(FAILED|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|CONNECTION_[A-Z_]+|ADDRESS_UNREACHABLE|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|TIMED_OUT|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/
let opening = null

async function vaultIsOpen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  return contexts.length > 0
}

async function openVault() {
  if (await vaultIsOpen()) return true
  opening ||= chrome.offscreen.createDocument({
    url: VAULT_URL,
    reasons: ['BLOBS'],
    justification: 'Keeps the loaded video in memory so it can keep playing after the YouTube tab is reloaded without a connection.'
  }).finally(() => {
    opening = null
  })
  await opening
  return true
}

async function closeVault() {
  if (await vaultIsOpen()) await chrome.offscreen.closeDocument()
}

async function replay(tabId, videoId) {
  const settings = normalize((await chrome.storage.local.get('settings')).settings)
  if (!videoId || !settings.enabled || !settings.keepOnReload || !(await vaultIsOpen())) return
  const found = await chrome.runtime.sendMessage({ type: 'vault-find', videoId }).catch(() => null)
  if (!found) return
  const seconds = Math.floor(found.timeMs / 1000)
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`watch.html?v=${encodeURIComponent(videoId)}&t=${seconds}`) })
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'vault-open') {
    openVault().then(() => reply(true), () => reply(false))
    return true
  }
  if (message?.type === 'vault-idle') closeVault()
  if (message?.type === 'replay' && sender.tab) replay(sender.tab.id, message.videoId)
})

chrome.tabs.onRemoved.addListener(async tabId => {
  if (await vaultIsOpen()) chrome.runtime.sendMessage({ type: 'vault-tab-closed', tabId }).catch(() => {})
})

chrome.webNavigation.onErrorOccurred.addListener(details => {
  if (details.frameId === 0 && NETWORK_ERROR.test(details.error)) replay(details.tabId, new URL(details.url).searchParams.get('v'))
}, { url: [{ hostEquals: 'www.youtube.com', pathEquals: '/watch' }] })
