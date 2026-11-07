import { setLanguage, t } from '../shared/i18n.js'
import { formatTime } from '../shared/format.js'

const TOAST_MS = 4000
const GAP_PX = 12

function element(tag, className) {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function host() {
  return document.getElementById(location.pathname.startsWith('/shorts/') ? 'shorts-player' : 'movie_player')
}

export function createOverlay() {
  let settings = null
  let status = null
  let root = null
  let badge = null
  let toasts = null

  function mount() {
    const player = host()
    if (!player) return false
    if (root?.parentElement === player) return true
    root = element('div', 'ytl-root')
    badge = element('div', 'ytl-badge')
    toasts = element('div', 'ytl-toasts')
    root.append(badge, toasts)
    player.append(root)
    return true
  }

  function update(next) {
    status = next
    if (!settings || !mount()) return
    const show = settings.enabled && settings.indicator && status?.videoId && status.state !== 'ad' &&
      status.percent !== null && status.percent !== undefined
    if (show) badge.textContent = t(status.state === 'held' ? 'badgePaused' : 'badgeLoaded', status.percent)
    badge.classList.toggle('ytl-visible', Boolean(show))
    place()
    drawProgress()
  }

  function place() {
    const bar = host()?.querySelector('.ytp-progress-bar')?.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    if (!bar?.height || !box.height) return
    const bottom = `${Math.round(box.bottom - bar.top + GAP_PX)}px`
    badge.style.bottom = bottom
    toasts.style.bottom = bottom
  }

  function drawProgress() {
    const bar = host()?.querySelector('.ytp-progress-bar')
    if (!bar) return
    const lists = [...bar.querySelectorAll('.ytp-chapters-container .ytp-progress-list')]
    const ranges = settings.enabled && settings.progressBar && status?.ranges?.length ? status.ranges : []
    if (!ranges.length || !lists.length) {
      for (const layer of bar.querySelectorAll('.ytl-progress')) layer.remove()
      return
    }
    const widths = lists.map(list => list.getBoundingClientRect().width)
    const total = widths.reduce((sum, width) => sum + width, 0) || 1
    let from = 0
    lists.forEach((list, index) => {
      const to = from + widths[index] / total
      drawChapter(list, ranges, from, to)
      from = to
    })
  }

  function drawChapter(list, ranges, from, to) {
    let layer = list.querySelector(':scope > .ytl-progress')
    if (!layer) {
      layer = element('div', 'ytl-progress')
      list.append(layer)
    }
    const span = to - from || 1
    const pieces = ranges
      .map(([start, end]) => [Math.max(start, from), Math.min(end, to)])
      .filter(([start, end]) => end > start)
    while (layer.children.length > pieces.length) layer.lastChild.remove()
    while (layer.children.length < pieces.length) layer.append(document.createElement('div'))
    pieces.forEach(([start, end], index) => {
      const piece = layer.children[index]
      piece.style.left = `${(start - from) / span * 100}%`
      piece.style.width = `${(end - start) / span * 100}%`
      piece.style.background = settings.progressColor
    })
  }

  function toast(text) {
    if (!mount()) return
    place()
    const item = element('div', 'ytl-toast')
    item.textContent = text
    toasts.append(item)
    requestAnimationFrame(() => item.classList.add('ytl-visible'))
    setTimeout(() => {
      item.classList.remove('ytl-visible')
      setTimeout(() => item.remove(), 300)
    }, TOAST_MS)
  }

  function notify(type, data) {
    if (!settings?.enabled) return
    if (type === 'connection' && settings.notifyConnection) {
      toast(data.online ? t('toastOnline') : t('toastOffline', formatTime(data.aheadSeconds)))
    } else if (type === 'loaded' && settings.notifyLoaded) {
      toast(t('toastLoaded'))
    } else if (type === 'warn') {
      toast(t('toastWarn', data.seconds))
    }
  }

  function configure(next) {
    settings = next
    setLanguage(next.language)
    update(status)
  }

  return { configure, update, notify }
}
