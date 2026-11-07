import { normalize } from '../shared/settings.js'
import { formatMegabytes, formatTime } from '../shared/format.js'
import { setLanguage, t, translate } from '../shared/i18n.js'

const byId = id => document.getElementById(id)
const START_STATES = ['manual', 'waiting']
const PAUSE_STATES = ['loading', 'paused', 'error', 'limit', 'target', 'offline']
const LABELS = { load: 'popupStart', hold: 'popupPause', release: 'popupResume' }

let tabId = null
let settings = null

start()

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab?.id ?? null
  settings = normalize((await chrome.storage.local.get('settings')).settings)
  setLanguage(settings.language)
  document.documentElement.lang = settings.language
  translate(document)
  byId('enabled').checked = settings.enabled
  byId('enabled').setAttribute('aria-label', t('popupToggle'))
  byId('enabled').addEventListener('change', toggle)
  byId('action').addEventListener('click', act)
  byId('settings').addEventListener('click', () => chrome.runtime.openOptionsPage())
  refresh()
  setInterval(refresh, 1000)
}

async function toggle() {
  settings = { ...settings, enabled: byId('enabled').checked }
  await chrome.storage.local.set({ settings })
  refresh()
}

async function act() {
  const command = byId('action').dataset.command
  if (tabId === null || !command) return
  await chrome.tabs.sendMessage(tabId, { type: command }).catch(() => null)
  refresh()
}

async function refresh() {
  const status = tabId === null ? null : await chrome.tabs.sendMessage(tabId, { type: 'status' }).catch(() => null)
  render(status)
}

function commandFor(state) {
  if (START_STATES.includes(state)) return 'load'
  if (state === 'held') return 'release'
  return PAUSE_STATES.includes(state) ? 'hold' : ''
}

function render(status) {
  const state = !settings.enabled ? 'off' : status ? status.state : 'none'
  byId('state').textContent = t(`state_${state}`)
  const hasVideo = Boolean(settings.enabled && status?.videoId && status.percent !== null && status.durationMs > 0)
  const command = hasVideo ? commandFor(state) : ''
  const action = byId('action')
  action.dataset.command = command
  action.disabled = !command
  action.textContent = t(LABELS[command || 'hold'])
  byId('video').hidden = !hasVideo
  if (!hasVideo) return
  byId('cached').textContent = t('popupCachedValue', status.percent, formatTime(status.cachedMs / 1000), formatTime(status.durationMs / 1000))
  byId('cachedBar').style.width = `${status.percent}%`
  byId('memory').textContent = t('popupMemoryValue', formatMegabytes(status.bytes), formatMegabytes(status.limit))
  const next = status.next || []
  byId('nextRow').hidden = !next.length
  byId('next').textContent = next.map(item => t('popupPercent', item.percent)).join('  ')
}
