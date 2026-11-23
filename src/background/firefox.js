import { normalize } from '../shared/settings.js'
import { find, forgetTab } from '../vault/firefox.js'

const INTERRUPTED = /NS_BINDING_(ABORTED|REDIRECTED|RETARGETED)|NS_ERROR_ABORT\b|\b(215239885[0-2]|2147500036)\b/

async function replay(tabId, videoId) {
  const settings = normalize((await chrome.storage.local.get('settings')).settings)
  if (!videoId || !settings.enabled || !settings.keepOnReload) return
  const found = find(videoId)
  if (!found) return
  const seconds = Math.floor(found.timeMs / 1000)
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`watch.html?v=${encodeURIComponent(videoId)}&t=${seconds}`) })
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'vault-open') reply(true)
  if (message?.type === 'replay' && sender.tab) replay(sender.tab.id, message.videoId)
})

chrome.tabs.onRemoved.addListener(tabId => forgetTab(tabId))

chrome.webNavigation.onErrorOccurred.addListener(details => {
  if (details.frameId === 0 && !INTERRUPTED.test(details.error)) replay(details.tabId, new URL(details.url).searchParams.get('v'))
}, { url: [{ hostEquals: 'www.youtube.com', pathEquals: '/watch' }] })
