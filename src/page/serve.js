import { PART, parseRequest, buildRequest, formatKey, withHeaderId } from './sabr.js'
import { createReader, partHeader, readParts } from './ump.js'
import { createSession, adopt, requestUrl, contextsOf, createConsumer, takeTurn, kindOf } from './session.js'
import { readBody, templateInit, signalOf } from './hooks.js'
import { log } from './log.js'

const SERVE_MS = 30000
const SERVE_SEGMENTS = 16
const STRIKES_TO_STOP = 3
const IDLE_BACKOFF_MS = 2000
const KINDS = ['audio', 'video']

export function createServer(context) {
  const { cache, sessions } = context

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
      ...parsed.videoFormats,
      ...parsed.audioFormats,
      ...parsed.initializedFormats,
      ...parsed.ranges.map(range => range.format).filter(Boolean)
    ]
    for (const format of formats) {
      const owner = cache.owner(formatKey(format))
      if (owner) return owner
    }
    return null
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
    const videoId = videoOf(parsed)
    const session = videoId ? sessionFor(videoId) : null
    log('player request', describeRequest(parsed), session ? session.videoId : 'new stream')
    if (!session) return forward(null, call, template, body, parsed)
    observe(session, parsed)
    adopt(session, template, body, parsed)
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
    if (!context.network.online) return false
    const resolutionChanged = parsed.manualResolution !== session.manualResolution
    session.manualResolution = parsed.manualResolution
    const choices = { audio: parsed.audioFormats[0], video: parsed.videoFormats[0] || (resolutionChanged ? null : undefined) }
    const byHand = Date.now() - context.qualityLockedAt > 5000
    let changed = false
    for (const kind of KINDS) {
      const next = choices[kind]
      const current = session.tracks[kind]
      if (next === undefined || (!next && !current) || (next && current && formatKey(next) === formatKey(current))) continue
      if (current && byHand && !context.settings.refetchOnQualityChange) continue
      if (current) cache.clearSegments(session.videoId, formatKey(current))
      session.tracks[kind] = next
      changed = true
      log('player switched', kind, 'to', next ? next.itag : 'a new quality', byHand ? '(by hand)' : '(quality setting)')
    }
    return changed
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

  function planFor(session, parsed) {
    if (!session.serving || session.live || !session.policy || context.player.ad()) return null
    if (!parsed.initializedFormats.length && context.network.online) return null
    const targets = context.readahead.targets(session)
    const plan = { inits: [], segments: [], served: [], missing: false }
    for (const kind of KINDS) {
      const format = session.tracks[kind]
      const track = format && cache.find(session.videoId, formatKey(format))
      if (!track) {
        plan.missing = true
        continue
      }
      const buffer = bufferOf(session, parsed, kind)
      if (buffer.endMs - parsed.playerTimeMs >= targets[kind]) continue
      const from = firstSegment(session, track, buffer)
      if (track.meta?.endSegment && from > track.meta.endSegment) continue
      const segments = from ? take(track, from) : []
      const initialized = parsed.initializedFormats.some(item => formatKey(item) === track.key)
      if (!segments.length || (!initialized && !(track.init && track.meta))) {
        plan.missing = true
        continue
      }
      if (!initialized) plan.inits.push(track)
      plan.segments.push(...segments)
      plan.served.push({ key: track.key, first: from, last: segments[segments.length - 1].number })
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
      log('served from memory', served, plan.inits.length ? `with ${plan.inits.length} init` : '')
    } else {
      log('nothing to serve yet, player waits', plan.missing ? '(not cached)' : '(buffer full)')
    }
    const response = new Response(new Blob(chunks), { status: 200, headers: { 'content-type': 'application/vnd.yt-ump' } })
    Object.defineProperty(response, 'url', { value: url })
    return response
  }

  function resolveNew(template, body, parsed) {
    return videoId => {
      const current = videoId === context.player.videoId()
      if (!current && context.player.ad()) return null
      const session = sessionFor(videoId)
      if (!session.body || (current && session.source !== 'player')) {
        adopt(session, template, body, parsed)
        session.manualResolution = parsed.manualResolution
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
    const consume = createConsumer({ cache, session, resolve: resolveNew(template, body, parsed) })
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
        context.scheduler.wake()
      }
    })
  }

  function ingest(body, bytes) {
    try {
      const parsed = parseRequest(body instanceof Uint8Array ? body : new Uint8Array(body))
      const videoId = videoOf(parsed)
      const consume = createConsumer({ cache, session: videoId ? sessionFor(videoId) : null, resolve: sessionFor })
      for (const part of readParts(bytes)) consume(part.type, part.payload)
    } catch (error) {
      log('could not read XHR response', error)
    }
  }

  return { handle, ingest }
}

function describeRequest(parsed) {
  const ranges = parsed.ranges.map(range => `${range.format?.itag}:${range.startSegment}-${range.endSegment}`).join(' ')
  const formats = [...parsed.initializedFormats, ...parsed.audioFormats, ...parsed.videoFormats].map(format => format.itag).join('/')
  return `t=${(parsed.playerTimeMs / 1000).toFixed(1)}s formats=${formats || '-'} ranges=${ranges || '-'}`
}

function describeParts(consume) {
  const { parts, segments } = consume.summary
  const counts = Object.entries(parts).map(([type, count]) => `${type}x${count}`).join(' ')
  return `parts=${counts || '-'} segments=${segments.join(' ') || '-'}`
}
