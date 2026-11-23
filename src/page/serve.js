import { PART, parseRequest, buildRequest, formatKey, withHeaderId } from './sabr.js'
import { createReader, partHeader, readParts } from './ump.js'
import {
  createSession, adopt, requestUrl, contextsOf, createConsumer, takeTurn, kindOf, streamId, candidates, settled, settle, sameTrack, SETTLE_MS
} from './session.js'
import { readBody, templateInit, signalOf } from './hooks.js'
import { labelOf, lowerThan } from './formats.js'
import { log } from './log.js'

const SERVE_MS = 30000
const SERVE_SEGMENTS = 16
const STRIKES_TO_STOP = 3
const IDLE_BACKOFF_MS = 2000
const KINDS = ['audio', 'video']

export function createServer(context) {
  const { cache, sessions } = context
  const streams = new Map()

  function sessionFor(videoId) {
    let session = sessions.get(videoId)
    if (!session) {
      session = createSession(videoId)
      sessions.set(videoId, session)
    }
    return session
  }

  function videoOf(parsed) {
    const formats = [
      ...parsed.initializedFormats,
      ...parsed.ranges.map(range => range.format).filter(Boolean),
      ...parsed.videoFormats,
      ...parsed.audioFormats
    ]
    for (const format of formats) {
      const owner = cache.owner(formatKey(format))
      if (owner) return owner
    }
    return null
  }

  function takesOver(session, stream) {
    if (!session.stream || session.stream === stream) return true
    const main = context.player.streamId()
    return !main || stream === main || session.stream !== main
  }

  async function handle(call) {
    let body
    let parsed
    try {
      body = await readBody(call)
      parsed = parseRequest(body)
    } catch (error) {
      log('unreadable SABR request, passing through', error)
      return context.nativeFetch(call.input, call.init)
    }
    const template = { url: call.url, init: templateInit(call), referrer: undefined }
    const stream = streamId(call.url)
    const videoId = streams.get(stream) || videoOf(parsed)
    if (videoId && !sessions.has(videoId) && videoId !== context.player.videoId() && !context.next.upcoming().includes(videoId)) {
      log('request for', videoId, 'which was let go, passes through')
      return context.nativeFetch(call.input, call.init)
    }
    const session = videoId ? sessionFor(videoId) : null
    if (session && !takesOver(session, stream)) {
      log('request from another player for', videoId, 'passes through')
      return context.nativeFetch(call.input, call.init)
    }
    log('player request', describeRequest(parsed), session ? session.videoId : 'new stream')
    if (!session) return forward(null, call, template, body, parsed)
    streams.set(stream, session.videoId)
    adopt(session, template, body, parsed)
    observe(session, parsed)
    if (session.videoId === context.player.videoId()) session.source = 'player'
    context.scheduler.wake()
    const plan = planFor(session, parsed)
    if (plan && (!plan.missing || (plan.segments.length && !context.network.online))) return reply(session, parsed, plan, call.url)
    return forward(session, call, template, body, parsed)
  }

  function observe(session, parsed) {
    if (followPlayer(session, parsed) || !parsed.ranges.length) session.lastServed = null
    checkServed(session, parsed)
  }

  function followPlayer(session, parsed) {
    const online = context.network.online
    const choice = `${parsed.audioTrackId}|${parsed.drc}`
    const picked = session.audioChoice !== null && session.audioChoice !== choice
    session.audioChoice = choice
    const audio = session.tracks.audio
    const playing = bufferOf(session, parsed, 'audio').format
    const elsewhere = playing && !sameTrack(playing, audio) && !parsed.ranges.some(range => range.format && sameTrack(range.format, audio))
    if (audio && (picked || elsewhere)) {
      log('player plays', picked ? parsed.audioTrackId || 'the default audio track' : labelOf(playing), parsed.drc ? 'with stable volume' : '', 'instead of', labelOf(audio))
      if (online) cache.dropTrack(session.videoId, formatKey(audio))
      session.tracks.audio = picked ? null : playing
      return true
    }
    if (!online) return false
    const resolutionChanged = parsed.manualResolution !== session.manualResolution
    session.manualResolution = parsed.manualResolution
    const video = session.tracks.video
    if (resolutionChanged && video) {
      const byHand = Date.now() - context.qualityLockedAt > 5000
      if (!byHand || context.settings.refetchOnQualityChange) cache.clearSegments(session.videoId, formatKey(video))
      session.tracks.video = null
      log('player switched quality', parsed.manualResolution ? `to ${parsed.manualResolution}p` : 'back to auto', byHand ? '(by hand)' : '(quality setting)')
      return true
    }
    const shown = bufferOf(session, parsed, 'video').format
    if (video && shown && !parsed.manualResolution && lowerThan(video, shown)) {
      log('player already shows', labelOf(shown), 'which is better than', labelOf(video))
      session.tracks.video = shown
    }
    return false
  }

  function checkServed(session, parsed) {
    const served = session.lastServed
    if (!served) return
    session.lastServed = null
    const jumped = Math.abs(parsed.playerTimeMs - served.timeMs) > 60000
    const accepted = served.tracks.every(({ key, first }) =>
      parsed.ranges.some(range => range.format && formatKey(range.format) === key && range.endSegment >= first))
    if (accepted || jumped) {
      session.strikes = 0
      return
    }
    session.strikes += 1
    log('player did not buffer the served segments', session.strikes)
    if (session.strikes >= STRIKES_TO_STOP) {
      session.serving = false
      log('serving from memory turned off for', session.videoId)
    }
  }

  function bufferOf(session, parsed, kind) {
    const time = parsed.playerTimeMs
    const ranges = parsed.ranges
      .filter(item => item.format && kindOf(cache, session, item.format) === kind)
      .sort((a, b) => a.startMs - b.startMs)
    let buffer = null
    for (const range of ranges) {
      const endMs = range.startMs + range.durationMs
      const reaches = buffer ? range.startMs <= buffer.endMs + 1000 : range.startMs <= time + 1000 && time <= endMs + 1000
      if (reaches && (!buffer || endMs > buffer.endMs)) buffer = { format: range.format, endSegment: range.endSegment, endMs }
    }
    return buffer || { format: null, endSegment: 0, endMs: time }
  }

  function firstSegment(session, track, buffer) {
    if (buffer.format && formatKey(buffer.format) === track.key) return buffer.endSegment + 1
    return cache.segmentAt(session.videoId, track.key, buffer.endMs)
  }

  function take(track, from) {
    const result = []
    let total = 0
    for (let number = from; result.length < SERVE_SEGMENTS; number++) {
      const segment = track.segments.get(number)
      if (!segment) break
      result.push(segment)
      total += segment.durationMs
      if (total >= SERVE_MS) break
    }
    return result
  }

  function playerVideo(session, parsed) {
    const buffer = bufferOf(session, parsed, 'video')
    if (buffer.format) return buffer.format
    const formats = parsed.initializedFormats.filter(format => kindOf(cache, session, format) === 'video')
    return formats[formats.length - 1] || null
  }

  function injectable(session, parsed, kind, track) {
    if (!context.network.online) return true
    if (kind === 'audio') return false
    if (parsed.manualResolution) return !context.settings.refetchOnQualityChange
    const current = playerVideo(session, parsed)
    return !current || !lowerThan(track.format, current)
  }

  function choose(session, parsed, kind, buffer) {
    const own = session.tracks[kind] && formatKey(session.tracks[kind])
    const online = context.network.online
    if (!own && online) return null
    const loose = !online || (kind === 'video' && !context.settings.refetchOnQualityChange)
    const shown = kind === 'video' && online && !parsed.manualResolution ? playerVideo(session, parsed) : null
    for (const track of candidates(cache, session, kind)) {
      if (track.key !== own && !loose) continue
      if (shown && lowerThan(track.format, shown)) continue
      const from = firstSegment(session, track, buffer)
      const segments = from ? take(track, from) : []
      if (!segments.length) continue
      const initialized = parsed.initializedFormats.some(item => formatKey(item) === track.key)
      if (!initialized && !(track.init && track.meta && injectable(session, parsed, kind, track))) continue
      return { track, from, segments, initialized }
    }
    return null
  }

  function planFor(session, parsed) {
    const online = context.network.online
    if (!session.serving || session.live || !session.policy || context.player.ad()) return null
    if (online && (session.blockedToken !== null || !settled(session))) return null
    if (!parsed.initializedFormats.length && online) return null
    const targets = context.readahead.targets(session)
    const plan = { inits: [], segments: [], served: [], missing: false }
    for (const kind of KINDS) {
      const buffer = bufferOf(session, parsed, kind)
      if (buffer.endMs - parsed.playerTimeMs >= targets[kind]) continue
      const own = session.tracks[kind] && cache.find(session.videoId, formatKey(session.tracks[kind]))
      if (own?.meta?.endSegment && firstSegment(session, own, buffer) > own.meta.endSegment) continue
      const choice = choose(session, parsed, kind, buffer)
      if (!choice) {
        plan.missing = true
        continue
      }
      if (!choice.initialized) plan.inits.push(choice.track)
      plan.segments.push(...choice.segments)
      plan.served.push({ key: choice.track.key, first: choice.from, last: choice.segments[choice.segments.length - 1].number })
    }
    return plan
  }

  function pushMedia(chunks, header, data, id) {
    const renamed = withHeaderId(header, id)
    chunks.push(partHeader(PART.MEDIA_HEADER, renamed.length), renamed)
    chunks.push(partHeader(PART.MEDIA, data.length + 1), Uint8Array.of(id), data)
    chunks.push(partHeader(PART.MEDIA_END, 1), Uint8Array.of(id))
  }

  function reply(session, parsed, plan, url) {
    const media = plan.segments.length > 0
    const policy = context.readahead.policy(session, session.policy, media ? 0 : IDLE_BACKOFF_MS)
    const chunks = [partHeader(PART.NEXT_REQUEST_POLICY, policy.length), policy]
    let id = 0
    for (const track of plan.inits) {
      chunks.push(partHeader(PART.FORMAT_INITIALIZATION_METADATA, track.meta.raw.length), track.meta.raw)
      pushMedia(chunks, track.init.header, track.init.data, id++)
    }
    for (const segment of [...plan.segments].sort((a, b) => a.startMs - b.startMs)) pushMedia(chunks, segment.header, segment.data, id++)
    if (media) {
      session.servedAt = Date.now()
      session.lastServed = { timeMs: parsed.playerTimeMs, tracks: plan.served }
      cache.touch(session.videoId)
      const served = plan.served.map(item => `${item.key.split(':')[0]}#${item.first}-${item.last}`).join(' ')
      const inits = plan.inits.map(track => labelOf(track.format)).join(', ')
      log('served from memory', served, inits ? `with init for ${inits}` : '')
    } else {
      log('nothing to serve yet, player waits', plan.missing ? '(not cached)' : '(buffer full)')
    }
    const response = new Response(new Blob(chunks), { status: 200, headers: { 'content-type': 'application/vnd.yt-ump' } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }

  function resolveNew(template, body, parsed, stream) {
    return videoId => {
      const current = videoId === context.player.videoId()
      if (!current && context.player.ad()) return null
      const session = sessionFor(videoId)
      if (!takesOver(session, stream)) return null
      streams.set(stream, videoId)
      if (!session.body || session.stream !== stream || (current && session.source !== 'player')) {
        adopt(session, template, body, parsed)
        session.manualResolution = parsed.manualResolution
        session.audioChoice = `${parsed.audioTrackId}|${parsed.drc}`
      }
      if (current) {
        session.source = 'player'
      } else if (session.source === 'player' && context.next.upcoming().includes(videoId)) {
        session.source = 'preload'
        session.autostart = true
        log('player preloads the next video', videoId)
      }
      context.scheduler.wake()
      return session
    }
  }

  function settleOn(session) {
    if (!session || session.settleUntil || session.videoId !== context.player.videoId()) return
    settle(session)
    log('YouTube picks the quality for', session.videoId, `during the next ${SETTLE_MS / 1000} s`)
  }

  async function forward(session, call, template, body, parsed) {
    const signal = signalOf(call)
    const turn = session ? await takeTurn(session, 'player') : null
    let response
    try {
      const url = session ? requestUrl(session) : call.url
      const payload = session
        ? buildRequest(body, { cookie: session.cookie, contexts: contextsOf(session), bandwidthEstimate: session.bandwidth || undefined })
        : body
      response = await context.nativeFetch(url, { ...template.init, body: payload, signal })
    } catch (error) {
      turn?.release()
      if (error.name === 'AbortError') throw error
      context.network.failed()
      const plan = session && planFor(session, parsed)
      if (!plan) throw error
      log('network failed, answering from memory')
      return reply(session, parsed, plan, call.url)
    }
    context.network.succeeded()
    if (!response.ok || !response.body) {
      turn?.release()
      if (!response.ok) log('player request failed with', response.status)
      return response
    }
    signal?.addEventListener('abort', () => turn?.release(), { once: true })
    const consume = createConsumer({ cache, session, resolve: resolveNew(template, body, parsed, streamId(call.url)), follow: true })
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    const piped = new Response(response.body.pipeThrough(tee(consume, turn, response.status)), {
      status: response.status,
      statusText: response.statusText,
      headers
    })
    Object.defineProperty(piped, 'url', { value: call.url })
    return piped
  }

  function tee(consume, turn, status) {
    let output = null
    const reader = createReader((type, payload) => {
      try {
        consume(type, payload)
      } catch (error) {
        log('could not read part', type, error)
      }
      const part = type === PART.NEXT_REQUEST_POLICY ? context.readahead.policy(consume.session(), payload) : payload
      output.enqueue(partHeader(type, part.length))
      output.enqueue(part)
      if (type === PART.NEXT_REQUEST_POLICY) turn?.release()
    })
    return new TransformStream({
      transform(chunk, controller) {
        output = controller
        reader.push(chunk)
      },
      flush(controller) {
        const rest = reader.rest()
        if (rest.length) controller.enqueue(rest)
        turn?.release()
        log('response', status, describeParts(consume))
        settleOn(consume.session())
        context.scheduler.wake()
      }
    })
  }

  function ingest(body, bytes) {
    try {
      const parsed = parseRequest(body instanceof Uint8Array ? body : new Uint8Array(body))
      const videoId = videoOf(parsed)
      const consume = createConsumer({ cache, session: videoId ? sessionFor(videoId) : null, resolve: sessionFor, follow: true })
      for (const part of readParts(bytes)) consume(part.type, part.payload)
    } catch (error) {
      log('could not read XHR response', error)
    }
  }

  return { handle, ingest }
}

function describeRequest(parsed) {
  const ranges = parsed.ranges.map(range => `${range.format?.itag}:${range.startSegment}-${range.endSegment}`).join(' ')
  const formats = parsed.initializedFormats.map(format => format.itag).join('/')
  const choices = [
    parsed.audioTrackId && `audio=${parsed.audioTrackId}`,
    parsed.manualResolution && `picked=${parsed.manualResolution}p`
  ].filter(Boolean).join(' ')
  return `t=${(parsed.playerTimeMs / 1000).toFixed(1)}s formats=${formats || '-'} ranges=${ranges || '-'}${choices ? ` ${choices}` : ''}`
}

function describeParts(consume) {
  const { parts, segments } = consume.summary
  const counts = Object.entries(parts).map(([type, count]) => `${type}x${count}`).join(' ')
  return `parts=${counts || '-'} segments=${segments.join(' ') || '-'}`
}
