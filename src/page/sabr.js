import {
  decode, encode, findAll, readInt, readBytes, readString, readMessage, readPacked, replace,
  makeVarint, makeBytes, makeString, makeMessage
} from './protobuf.js'

export const PART = {
  MEDIA_HEADER: 20,
  MEDIA: 21,
  MEDIA_END: 22,
  LIVE_METADATA: 31,
  NEXT_REQUEST_POLICY: 35,
  FORMAT_INITIALIZATION_METADATA: 42,
  SABR_REDIRECT: 43,
  SABR_ERROR: 44,
  SABR_SEEK: 45,
  RELOAD_PLAYER_RESPONSE: 46,
  SABR_CONTEXT_UPDATE: 57,
  STREAM_PROTECTION_STATUS: 58,
  SABR_CONTEXT_SENDING_POLICY: 59
}

export const ATTESTATION_REQUIRED = 3

const REQUEST = { abrState: 1, initializedFormats: 2, bufferedRanges: 3, audioFormats: 16, videoFormats: 17, streamerContext: 19 }
const ABR = { lastManualResolution: 16, bandwidthEstimate: 23, playerTimeMs: 28, enabledTrackTypes: 40 }
const STREAMER = { poToken: 2, cookie: 3, contexts: 5, unsentContexts: 6 }
const SABR_CONTEXT = { type: 1, value: 2 }
const RANGE = { format: 1, startMs: 2, durationMs: 3, startSegment: 4, endSegment: 5, timeRange: 6 }
const TIME_RANGE = { startTicks: 1, durationTicks: 2, timescale: 3 }
const FORMAT = { itag: 1, lmt: 2, xtags: 3 }
const HEADER = {
  id: 1, videoId: 2, itag: 3, lmt: 4, xtags: 5, isInit: 8, segment: 9,
  startMs: 11, durationMs: 12, format: 13, contentLength: 14, timeRange: 15
}
const POLICY = { targetAudioMs: 1, targetVideoMs: 2, backoffMs: 4, cookie: 7, videoId: 8 }
const FORMAT_INIT = { videoId: 1, format: 2, endTimeMs: 3, endSegment: 4, mimeType: 5 }
const CONTEXT_UPDATE = { type: 1, value: 3, sendByDefault: 4 }
const SENDING_POLICY = { start: 1, stop: 2, discard: 3 }
const REDIRECT = { url: 1 }
const ERROR = { type: 1, code: 2 }
const PROTECTION = { status: 1 }

export function formatKey({ itag, lmt, xtags }) {
  return `${itag}:${lmt}:${xtags || ''}`
}

export function parseFormat(bytes) {
  const fields = decode(bytes)
  return { itag: readInt(fields, FORMAT.itag), lmt: readInt(fields, FORMAT.lmt), xtags: readString(fields, FORMAT.xtags) }
}

export function encodeFormat({ itag, lmt, xtags }) {
  const fields = [makeVarint(FORMAT.itag, itag)]
  if (lmt) fields.push(makeVarint(FORMAT.lmt, lmt))
  if (xtags) fields.push(makeString(FORMAT.xtags, xtags))
  return encode(fields)
}

function parseRange(bytes) {
  const fields = decode(bytes)
  const format = readBytes(fields, RANGE.format)
  return {
    format: format ? parseFormat(format) : null,
    startMs: readInt(fields, RANGE.startMs),
    durationMs: readInt(fields, RANGE.durationMs),
    startSegment: readInt(fields, RANGE.startSegment),
    endSegment: readInt(fields, RANGE.endSegment)
  }
}

function encodeRange({ format, startMs, durationMs, startSegment, endSegment }) {
  return makeMessage(REQUEST.bufferedRanges, [
    makeBytes(RANGE.format, encodeFormat(format)),
    makeVarint(RANGE.startMs, startMs),
    makeVarint(RANGE.durationMs, durationMs),
    makeVarint(RANGE.startSegment, startSegment),
    makeVarint(RANGE.endSegment, endSegment),
    makeMessage(RANGE.timeRange, [
      makeVarint(TIME_RANGE.startTicks, startMs),
      makeVarint(TIME_RANGE.durationTicks, durationMs),
      makeVarint(TIME_RANGE.timescale, 1000)
    ])
  ])
}

function formatsOf(fields, number) {
  return findAll(fields, number).filter(field => field.type === 2).map(field => parseFormat(field.value))
}

export function parseRequest(body) {
  const fields = decode(body)
  const abr = readMessage(fields, REQUEST.abrState)
  const streamer = readMessage(fields, REQUEST.streamerContext)
  return {
    playerTimeMs: readInt(abr, ABR.playerTimeMs),
    bandwidthEstimate: readInt(abr, ABR.bandwidthEstimate),
    manualResolution: readInt(abr, ABR.lastManualResolution),
    enabledTrackTypes: readInt(abr, ABR.enabledTrackTypes),
    ranges: findAll(fields, REQUEST.bufferedRanges).filter(field => field.type === 2).map(field => parseRange(field.value)),
    initializedFormats: formatsOf(fields, REQUEST.initializedFormats),
    audioFormats: formatsOf(fields, REQUEST.audioFormats),
    videoFormats: formatsOf(fields, REQUEST.videoFormats),
    cookie: readBytes(streamer, STREAMER.cookie),
    hasPoToken: Boolean(readBytes(streamer, STREAMER.poToken)?.length)
  }
}

function formatFields(number, formats) {
  return formats.map(format => makeBytes(number, encodeFormat(format)))
}

export function buildRequest(body, changes) {
  let fields = decode(body)
  let abr = readMessage(fields, REQUEST.abrState)
  if (changes.playerTimeMs !== undefined) abr = replace(abr, ABR.playerTimeMs, makeVarint(ABR.playerTimeMs, Math.max(0, Math.round(changes.playerTimeMs))))
  if (changes.bandwidthEstimate) abr = replace(abr, ABR.bandwidthEstimate, makeVarint(ABR.bandwidthEstimate, changes.bandwidthEstimate))
  fields = replace(fields, REQUEST.abrState, makeMessage(REQUEST.abrState, abr))
  if (changes.ranges) fields = replace(fields, REQUEST.bufferedRanges, changes.ranges.map(encodeRange))
  if (changes.initializedFormats) fields = replace(fields, REQUEST.initializedFormats, formatFields(REQUEST.initializedFormats, changes.initializedFormats))
  if (changes.audioFormats) fields = replace(fields, REQUEST.audioFormats, formatFields(REQUEST.audioFormats, changes.audioFormats))
  if (changes.videoFormats) fields = replace(fields, REQUEST.videoFormats, formatFields(REQUEST.videoFormats, changes.videoFormats))
  if (changes.cookie || changes.contexts) {
    let streamer = readMessage(fields, REQUEST.streamerContext)
    if (changes.cookie) streamer = replace(streamer, STREAMER.cookie, makeBytes(STREAMER.cookie, changes.cookie))
    if (changes.contexts) {
      streamer = replace(streamer, STREAMER.contexts, changes.contexts.active.map(({ type, value }) =>
        makeMessage(STREAMER.contexts, [makeVarint(SABR_CONTEXT.type, type), makeBytes(SABR_CONTEXT.value, value)])))
      streamer = replace(streamer, STREAMER.unsentContexts, changes.contexts.unsent.map(type => makeVarint(STREAMER.unsentContexts, type)))
    }
    fields = replace(fields, REQUEST.streamerContext, makeMessage(REQUEST.streamerContext, streamer))
  }
  return encode(fields)
}

export function parseMediaHeader(bytes) {
  const fields = decode(bytes)
  const format = readBytes(fields, HEADER.format)
  const time = readMessage(fields, HEADER.timeRange)
  const timescale = readInt(time, TIME_RANGE.timescale)
  const ticksToMs = number => timescale ? Math.round(readInt(time, number) * 1000 / timescale) : 0
  return {
    id: readInt(fields, HEADER.id),
    videoId: readString(fields, HEADER.videoId),
    format: format
      ? parseFormat(format)
      : { itag: readInt(fields, HEADER.itag), lmt: readInt(fields, HEADER.lmt), xtags: readString(fields, HEADER.xtags) },
    isInit: readInt(fields, HEADER.isInit) === 1,
    segment: readInt(fields, HEADER.segment),
    startMs: readInt(fields, HEADER.startMs) || ticksToMs(TIME_RANGE.startTicks),
    durationMs: readInt(fields, HEADER.durationMs) || ticksToMs(TIME_RANGE.durationTicks),
    contentLength: readInt(fields, HEADER.contentLength)
  }
}

export function withHeaderId(bytes, id) {
  return encode(replace(decode(bytes), HEADER.id, makeVarint(HEADER.id, id)))
}

export function parsePolicy(bytes) {
  const fields = decode(bytes)
  return {
    targetAudioMs: readInt(fields, POLICY.targetAudioMs),
    targetVideoMs: readInt(fields, POLICY.targetVideoMs),
    backoffMs: readInt(fields, POLICY.backoffMs),
    cookie: readBytes(fields, POLICY.cookie),
    videoId: readString(fields, POLICY.videoId)
  }
}

function raise(fields, number, value) {
  return !value || readInt(fields, number) >= value ? fields : replace(fields, number, makeVarint(number, value))
}

export function rewritePolicy(bytes, { audioMs, videoMs, backoffMs }) {
  let fields = decode(bytes)
  fields = raise(fields, POLICY.targetAudioMs, audioMs)
  fields = raise(fields, POLICY.targetVideoMs, videoMs)
  if (backoffMs !== undefined) fields = replace(fields, POLICY.backoffMs, backoffMs ? makeVarint(POLICY.backoffMs, backoffMs) : [])
  return encode(fields)
}

export function parseFormatInit(bytes) {
  const fields = decode(bytes)
  const format = readBytes(fields, FORMAT_INIT.format)
  return {
    videoId: readString(fields, FORMAT_INIT.videoId),
    format: format ? parseFormat(format) : null,
    endTimeMs: readInt(fields, FORMAT_INIT.endTimeMs),
    endSegment: readInt(fields, FORMAT_INIT.endSegment),
    mimeType: readString(fields, FORMAT_INIT.mimeType)
  }
}

export function parseRedirect(bytes) {
  return readString(decode(bytes), REDIRECT.url)
}

export function parseError(bytes) {
  const fields = decode(bytes)
  return { type: readString(fields, ERROR.type), code: readInt(fields, ERROR.code) }
}

export function parseProtection(bytes) {
  return readInt(decode(bytes), PROTECTION.status)
}

export function parseContextUpdate(bytes) {
  const fields = decode(bytes)
  return {
    type: readInt(fields, CONTEXT_UPDATE.type),
    value: readBytes(fields, CONTEXT_UPDATE.value),
    sendByDefault: readInt(fields, CONTEXT_UPDATE.sendByDefault) === 1
  }
}

export function parseSendingPolicy(bytes) {
  const fields = decode(bytes)
  return {
    start: readPacked(fields, SENDING_POLICY.start),
    stop: readPacked(fields, SENDING_POLICY.stop),
    discard: readPacked(fields, SENDING_POLICY.discard)
  }
}
