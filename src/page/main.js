import { DEFAULTS } from '../shared/settings.js'
import { listen, send } from './bridge.js'
import { createCache } from './cache.js'
import { installHooks } from './hooks.js'
import { learnKinds } from './kinds.js'
import { log, setDebug } from './log.js'
import { createMirror } from './mirror.js'
import { createNetwork } from './network.js'
import { createNext } from './next.js'
import { createPlayer, pickLevel } from './player.js'
import { createReadahead, trapInitialResponse } from './readahead.js'
import { formatKey } from './sabr.js'
import { createScheduler } from './scheduler.js'
import { createServer } from './serve.js'
import { createStatus } from './status.js'

const CLOSED_PRUNE_MS = 60000
const STUCK_TICKS = 3

start()

function start() {
  let settle
  const settled = new Promise(resolve => {
    settle = resolve
  })
  const context = {
    settings: DEFAULTS,
    loaded: false,
    settled: ms => Promise.race([settled, new Promise(resolve => setTimeout(resolve, ms))]),
    held: false,
    nativeFetch: window.fetch.bind(window),
    sessions: new Map(),
    manualIds: new Set(),
    playedIds: new Set(),
    limited: false,
    qualityLockedAt: 0,
    active: () => context.loaded && context.settings.enabled
  }
  context.player = createPlayer()
  context.mirror = createMirror(context)
  context.cache = createCache(context.mirror.events)
  context.readahead = createReadahead(context)
  context.network = createNetwork(context, online => {
    const status = context.status.compute()
    send('connection', { online, aheadSeconds: Math.floor((status.aheadMs || 0) / 1000) })
    if (online) context.scheduler.wake()
  })
  context.scheduler = createScheduler(context)
  context.next = createNext(context)
  context.server = createServer(context)
  context.status = createStatus(context)
  installHooks(context)

  let pendingResponse = null
  trapInitialResponse(response => {
    learnKinds(response?.streamingData?.adaptiveFormats || [])
    if (context.loaded) context.readahead.patch(response)
    else pendingResponse = response
  })

  let currentId = null
  let closedAt = 0
  let stuck = 0
  let replayAsked = false
  let qualityFor = ''

  listen((type, data) => {
    if (type === 'settings') applySettings(data)
    else if (type === 'load') loadNow()
    else if (type === 'hold') hold(true)
    else if (type === 'release') hold(false)
    else if (type === 'vault-ready') context.mirror.connect()
    else if (type === 'vault-lost') context.mirror.disconnect()
    else if (type === 'vault-restore') context.mirror.restore(data)
    else if (type === 'vault-restored') context.mirror.restored(data.videoId)
  })
  send('hello')

  function applySettings(next) {
    const previous = context.settings
    context.settings = next
    context.loaded = true
    settle()
    setDebug(next.debug)
    if (next.quality !== previous.quality || next.qualityFallback !== previous.qualityFallback) qualityFor = ''
    if (pendingResponse) {
      context.readahead.patch(pendingResponse)
      pendingResponse = null
    }
    if (!next.enabled && previous.enabled) {
      context.cache.clear()
      context.sessions.clear()
    }
    context.scheduler.wake()
    context.status.report()
  }

  function hold(value) {
    context.held = value
    log(value ? 'loading paused from the popup' : 'loading resumed from the popup')
    context.scheduler.wake()
    context.status.report()
  }

  function loadNow() {
    const id = context.player.videoId()
    if (!id) return
    context.manualIds.add(id)
    log('load requested for', id)
    context.scheduler.wake()
  }

  function switchVideo(id) {
    const previous = currentId
    currentId = id
    if (!id) {
      closedAt = Date.now()
      log('video closed', previous)
      return
    }
    closedAt = 0
    context.cache.touch(id)
    const session = context.sessions.get(id)
    if (session && session.source !== 'player') session.autostart = true
    if (previous) prune(id)
    log('video changed', previous, '->', id)
  }

  function prune(id) {
    const { settings, cache, sessions } = context
    const keep = new Set([id, ...context.next.upcoming()])
    const others = cache.ids().filter(other => !keep.has(other))
    const room = id ? settings.keepVideos - 1 : settings.keepVideos
    const kept = settings.onSwitch === 'keep' && room > 0 ? others.slice(-room) : []
    for (const other of others) {
      if (kept.includes(other)) continue
      cache.dropVideo(other)
      sessions.delete(other)
    }
    for (const other of [...sessions.keys()]) {
      if (!keep.has(other) && !kept.includes(other)) sessions.delete(other)
    }
  }

  function watchStuck(id) {
    const blocked = id && location.pathname === '/watch' && !context.player.loaded()
    stuck = blocked ? stuck + 1 : 0
    if (stuck < STUCK_TICKS || replayAsked || !context.settings.keepOnReload) return
    if (context.network.online) {
      if (stuck % STUCK_TICKS === 0) context.network.check()
      return
    }
    replayAsked = true
    log('the page cannot load the video without a connection, opening it from memory')
    send('replay', { videoId: id })
  }

  function applyQuality(id) {
    const { settings, player } = context
    if (!id || settings.quality === 'off' || qualityFor === id) return
    const level = pickLevel(player.levels(), settings.quality, settings.qualityFallback)
    if (!level) return
    player.setQuality(level)
    qualityFor = id
    context.qualityLockedAt = Date.now()
    log('quality locked to', level)
  }

  function tick() {
    if (!context.active()) {
      context.status.report()
      return
    }
    const id = context.player.videoId()
    if (id !== currentId) switchVideo(id)
    learnKinds(context.player.formats())
    watchStuck(id)
    if (closedAt && Date.now() - closedAt > CLOSED_PRUNE_MS) {
      closedAt = 0
      prune(null)
      log('memory released after the video was closed')
    }
    if (id && context.player.playing()) context.playedIds.add(id)
    applyQuality(id)
    context.mirror.tick()
    context.scheduler.wake()
    context.status.report()
  }

  document.addEventListener('seeked', event => {
    const { settings, player, cache, sessions } = context
    if (!context.active() || settings.onSeek !== 'restart') return
    if (!player.element()?.contains(event.target)) return
    const id = player.videoId()
    const video = id && sessions.get(id)?.tracks.video
    if (!video || cache.segmentAt(id, formatKey(video), player.time() * 1000)) return
    cache.clearSegments(id)
    log('jumped outside the cache, cleared', id)
  }, true)

  setInterval(tick, 1000)
}
