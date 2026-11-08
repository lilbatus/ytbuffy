import { concat } from './protobuf.js'
import {
  PART, ATTESTATION_REQUIRED, formatKey, parseMediaHeader, parsePolicy, parseFormatInit, parseRedirect, parseError,
  parseProtection, parseContextUpdate, parseSendingPolicy
} from './sabr.js'
import { log } from './log.js'
import { kindOfItag } from './kinds.js'

const TURN_TIMEOUT_MS = 30000

export function createSession(videoId) {
  return {
    videoId,
    source: 'player',
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
    bandwidth: 0,
    servedAt: 0,
    lastServed: null,
    strikes: 0,
    serving: true,
    manualResolution: 0,
    waitUntil: 0,
    failure: '',
    failures: 0,
    retryAt: 0,
    stalls: 0,
    live: false,
    autostart: false,
    token: '',
    blockedToken: null,
    busy: null
  }
}

function streamId(url) {
  const params = new URL(url).searchParams
  return `${params.get('ei')}|${params.get('expire')}`
}

export function adopt(session, template, body, parsed) {
  if (!session.url || streamId(session.url) !== streamId(template.url)) {
    session.redirect = ''
    session.rn = 0
    session.cookie = null
    session.contexts.clear()
  }
  session.url = template.url
  session.init = template.init
  session.referrer = template.referrer
  session.body = body
  session.rn = Math.max(session.rn, Number(new URL(template.url).searchParams.get('rn')) || 0)
  session.failure = ''
  if (!parsed) return
  if (parsed.bandwidthEstimate && Date.now() - session.servedAt > 30000) session.bandwidth = parsed.bandwidthEstimate
  const token = parsed.poToken ? String.fromCharCode(...parsed.poToken) : ''
  if (session.blockedToken !== null && token !== session.blockedToken) {
    session.blockedToken = null
    log('session', session.videoId, 'got a new token from the player, loading resumes')
  }
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

export function control(session, type, payload, cache) {
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
    if (parseProtection(payload) !== ATTESTATION_REQUIRED || session.blockedToken !== null) return
    session.blockedToken = session.token
    fail(session, 'attestation required, waiting for the player to renew its token')
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
  log('session', session.videoId, 'uses', kind, 'format', format.itag)
}

export function createConsumer({ cache, session, resolve, onSegment }) {
  let target = session || null
  let resolved = Boolean(session)
  const pending = []
  const open = new Map()
  const summary = { parts: {}, segments: [] }

  function handle(type, payload) {
    summary.parts[type] = (summary.parts[type] || 0) + 1
    if (type === PART.MEDIA_HEADER) {
      const header = parseMediaHeader(payload)
      if (header.videoId && header.videoId !== target.videoId) return
      open.set(header.id, { header, raw: payload.slice(), chunks: [] })
      if (!header.isInit) claimTrack(cache, target, header.format)
    } else if (type === PART.MEDIA) {
      open.get(payload[0])?.chunks.push(payload.subarray(1))
    } else if (type === PART.MEDIA_END) {
      const entry = open.get(payload[0])
      if (!entry) return
      open.delete(payload[0])
      if (cache.add(target.videoId, entry.header, entry.raw, concat(entry.chunks))) {
        summary.segments.push(`${entry.header.format.itag}#${entry.header.segment}`)
        onSegment?.(entry.header)
      }
    } else {
      control(target, type, payload, cache)
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
