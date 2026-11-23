import { concat } from './protobuf.js'
import {
  PART, ATTESTATION_REQUIRED, formatKey, parseMediaHeader, parsePolicy, parseFormatInit, parseRedirect, parseError,
  parseProtection, parseContextUpdate, parseSendingPolicy
} from './sabr.js'
import { log } from './log.js'
import { kindOfItag, labelOf, lowerThan } from './formats.js'

const TURN_TIMEOUT_MS = 30000
const BLOCK_MS = 120000
const BLOCK_MAX_MS = 900000

export function createSession(videoId) {
  return {
    videoId,
    source: 'player',
    stream: '',
    url: '',
    init: null,
    body: null,
    referrer: undefined,
    redirect: '',
    cookie: null,
    contexts: new Map(),
    policy: null,
    rn: 0,
    tracks: { audio: null, video: null },
    audioChoice: null,
    bandwidth: 0,
    servedAt: 0,
    lastServed: null,
    strikes: 0,
    serving: true,
    manualResolution: 0,
    settleUntil: 0,
    waitUntil: 0,
    nextAt: 0,
    failure: '',
    failures: 0,
    retryAt: 0,
    stalls: 0,
    live: false,
    autostart: false,
    token: '',
    blockedToken: null,
    blockedUntil: 0,
    blocks: 0,
    retired: false,
    busy: null
  }
}

export function streamId(url) {
  const params = new URL(url).searchParams
  return `${params.get('ei')}|${params.get('expire')}`
}

function restart(session, stream) {
  Object.assign(session, {
    stream,
    redirect: '',
    rn: 0,
    cookie: null,
    tracks: { audio: null, video: null },
    audioChoice: null,
    lastServed: null,
    strikes: 0,
    serving: true,
    settleUntil: 0,
    failure: '',
    failures: 0,
    retryAt: 0,
    stalls: 0,
    blockedToken: null,
    blockedUntil: 0,
    blocks: 0
  })
  session.contexts.clear()
}

export function adopt(session, template, body, parsed) {
  const stream = streamId(template.url)
  if (stream !== session.stream) {
    if (session.stream) log('session', session.videoId, 'moves to a new stream')
    restart(session, stream)
  }
  session.url = template.url
  session.init = template.init
  session.referrer = template.referrer
  session.body = body
  session.rn = Math.max(session.rn, Number(new URL(template.url).searchParams.get('rn')) || 0)
  if (!parsed) return
  if (parsed.bandwidthEstimate && Date.now() - session.servedAt > 30000) session.bandwidth = parsed.bandwidthEstimate
  const token = parsed.poToken ? String.fromCharCode(...parsed.poToken) : ''
  if (session.blockedToken !== null && token !== session.blockedToken) unblock(session, 'got a new token from the player')
  session.token = token
}

export function requestUrl(session) {
  const url = new URL(session.redirect || session.url)
  session.rn += 1
  url.searchParams.set('rn', String(session.rn))
  return url.href
}

export function contextsOf(session) {
  if (!session.contexts.size) return null
  const active = []
  const unsent = []
  for (const [type, entry] of session.contexts) {
    if (entry.active) active.push({ type, value: entry.value })
    else unsent.push(type)
  }
  return { active, unsent }
}

export function fail(session, reason) {
  session.failure = reason
  session.failures += 1
  session.retryAt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(session.failures, 5))
  log('session', session.videoId, 'paused:', reason)
}

export const SETTLE_MS = 15000

export function settled(session) {
  return session.settleUntil > 0 && Date.now() >= session.settleUntil
}

export function settle(session) {
  session.settleUntil = Date.now() + SETTLE_MS
}

export function blocked(session) {
  return session.blockedToken !== null && Date.now() < session.blockedUntil
}

function block(session) {
  const now = Date.now()
  if (session.blockedToken !== null && now < session.blockedUntil) return
  if (session.blockedToken === null) {
    session.blockedToken = session.token
    log('session', session.videoId, 'paused: attestation required, waiting for the player to renew its token')
  }
  session.blocks += 1
  session.blockedUntil = now + Math.min(BLOCK_MAX_MS, BLOCK_MS * 2 ** (session.blocks - 1))
}

export function unblock(session, reason) {
  if (session.blockedToken === null) return
  session.blockedToken = null
  session.blockedUntil = 0
  log('session', session.videoId, `${reason}, loading resumes`)
}

export function retire(session) {
  session.retired = true
  if (session.busy?.kind === 'prefetch') session.busy.controller.abort()
}

export async function takeTurn(session, kind) {
  while (session.busy) {
    const holder = session.busy
    if (kind === 'player' && holder.kind === 'prefetch') holder.controller.abort()
    const settled = await Promise.race([holder.done.then(() => true), sleep(TURN_TIMEOUT_MS).then(() => false)])
    if (!settled && session.busy === holder) session.busy = null
  }
  let finish
  const done = new Promise(resolve => {
    finish = resolve
  })
  const controller = new AbortController()
  const holder = { kind, controller, done }
  session.busy = holder
  return {
    signal: controller.signal,
    release() {
      if (session.busy === holder) session.busy = null
      finish()
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function control(session, type, payload, cache, summary) {
  if (type === PART.NEXT_REQUEST_POLICY) {
    const policy = parsePolicy(payload)
    session.policy = payload.slice()
    if (policy.cookie) session.cookie = policy.cookie.slice()
    session.waitUntil = policy.backoffMs ? Date.now() + Math.min(policy.backoffMs, 30000) : 0
  } else if (type === PART.FORMAT_INITIALIZATION_METADATA) {
    const meta = parseFormatInit(payload)
    if (!meta.format) return
    cache.describe(meta.videoId || session.videoId, meta, payload.slice())
    claimTrack(cache, session, meta.format)
  } else if (type === PART.SABR_REDIRECT) {
    session.redirect = parseRedirect(payload)
    log('session', session.videoId, 'redirected')
  } else if (type === PART.SABR_ERROR) {
    const error = parseError(payload)
    fail(session, `sabr error ${error.type} ${error.code}`)
  } else if (type === PART.STREAM_PROTECTION_STATUS) {
    const status = parseProtection(payload)
    if (summary) summary.protection = status
    if (status === ATTESTATION_REQUIRED) block(session)
  } else if (type === PART.RELOAD_PLAYER_RESPONSE) {
    fail(session, 'player reload requested')
  } else if (type === PART.SABR_CONTEXT_UPDATE) {
    const update = parseContextUpdate(payload)
    if (!update.value) return
    const active = update.sendByDefault || Boolean(session.contexts.get(update.type)?.active)
    session.contexts.set(update.type, { value: update.value.slice(), active })
  } else if (type === PART.SABR_CONTEXT_SENDING_POLICY) {
    const policy = parseSendingPolicy(payload)
    for (const item of policy.start) if (session.contexts.has(item)) session.contexts.get(item).active = true
    for (const item of policy.stop) if (session.contexts.has(item)) session.contexts.get(item).active = false
    for (const item of policy.discard) session.contexts.delete(item)
  } else if (type === PART.LIVE_METADATA) {
    session.live = true
  }
}

function videoIdOf(type, payload) {
  if (type === PART.MEDIA_HEADER) return parseMediaHeader(payload).videoId
  if (type === PART.FORMAT_INITIALIZATION_METADATA) return parseFormatInit(payload).videoId
  if (type === PART.NEXT_REQUEST_POLICY) return parsePolicy(payload).videoId
  return ''
}

export function kindOf(cache, session, format) {
  const key = formatKey(format)
  const mimeType = cache.find(session.videoId, key)?.meta?.mimeType || ''
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (session.tracks.audio && formatKey(session.tracks.audio) === key) return 'audio'
  if (session.tracks.video && formatKey(session.tracks.video) === key) return 'video'
  return kindOfItag(format.itag)
}

function claimTrack(cache, session, format) {
  const kind = kindOf(cache, session, format)
  if (!kind || session.tracks[kind]) return
  session.tracks[kind] = format
  log('session', session.videoId, 'uses', kind, labelOf(format))
}

export function followTrack(cache, session, format) {
  const kind = kindOf(cache, session, format)
  const current = kind && session.tracks[kind]
  if (!current) {
    claimTrack(cache, session, format)
    return
  }
  if (formatKey(current) === formatKey(format)) return
  const otherTrack = kind === 'audio' && (current.xtags || '') !== (format.xtags || '')
  if (!otherTrack && lowerThan(format, current)) return
  session.tracks[kind] = format
  if (otherTrack) cache.dropTrack(session.videoId, formatKey(current))
  log('session', session.videoId, 'follows the player:', kind, labelOf(current), '->', labelOf(format))
}

export function sameTrack(a, b) {
  return Boolean(a && b) && (a.xtags || '') === (b.xtags || '')
}

export function candidates(cache, session, kind) {
  const current = session.tracks[kind]
  const own = current && cache.find(session.videoId, formatKey(current))
  const others = cache.tracks(session.videoId)
    .filter(track => track !== own && kindOf(cache, session, track.format) === kind)
    .filter(track => kind === 'video' || sameTrack(track.format, current))
    .sort((a, b) => lowerThan(a.format, b.format) ? 1 : lowerThan(b.format, a.format) ? -1 : 0)
  return own ? [own, ...others] : others
}

export function createConsumer({ cache, session, resolve, onSegment, follow = false }) {
  let target = session || null
  let resolved = Boolean(session)
  const pending = []
  const open = new Map()
  const summary = { parts: {}, segments: [], protection: 0 }

  function handle(type, payload) {
    summary.parts[type] = (summary.parts[type] || 0) + 1
    if (type === PART.MEDIA_HEADER) {
      const header = parseMediaHeader(payload)
      if (header.videoId && header.videoId !== target.videoId) return
      open.set(header.id, { header, raw: payload.slice(), chunks: [] })
      if (header.isInit) return
      if (follow) followTrack(cache, target, header.format)
      else claimTrack(cache, target, header.format)
    } else if (type === PART.MEDIA) {
      open.get(payload[0])?.chunks.push(payload.subarray(1))
    } else if (type === PART.MEDIA_END) {
      const entry = open.get(payload[0])
      if (!entry) return
      open.delete(payload[0])
      if (cache.add(target.videoId, entry.header, entry.raw, concat(entry.chunks))) {
        summary.segments.push(`${entry.header.format.itag}#${entry.header.segment}`)
        onSegment?.(entry.header, target)
      }
    } else {
      control(target, type, payload, cache, summary)
    }
  }

  function consume(type, payload) {
    if (!resolved) {
      const videoId = videoIdOf(type, payload)
      if (!videoId) {
        pending.push([type, payload.slice()])
        return
      }
      resolved = true
      target = resolve(videoId)
      const queued = pending.splice(0)
      if (target) for (const [queuedType, queuedPayload] of queued) handle(queuedType, queuedPayload)
    }
    if (target) handle(type, payload)
  }

  consume.session = () => target
  consume.summary = summary
  return consume
}
