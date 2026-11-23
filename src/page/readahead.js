import { formatKey, parsePolicy, rewritePolicy } from './sabr.js'
import { heightOf } from '../shared/estimate.js'
import { log } from './log.js'

const MIB = 1048576
const QUOTA_SHARE = 0.8
const LONG_MS = 3 * 3600000
const SERVER_DEFAULT_MS = 120000
const DEFAULT_VIDEO_BPS = 2600000
const DEFAULT_AUDIO_BPS = 160000

export function createReadahead(context) {
  function wantedMs() {
    const { settings } = context
    return settings.aheadMode === 'minutes' ? settings.aheadMinutes * 60000 : LONG_MS
  }

  function capMs(megabytes, bitsPerSecond) {
    return Math.floor(megabytes * MIB * 8 * QUOTA_SHARE / bitsPerSecond * 1000)
  }

  function boosting() {
    return context.settings.enabled && context.settings.boostReadahead
  }

  function bitrate(session, kind) {
    const format = session?.tracks[kind]
    const track = format && context.cache.find(session.videoId, formatKey(format))
    if (!track) return 0
    let bytes = 0
    let ms = 0
    for (const segment of track.segments.values()) {
      bytes += segment.data.length
      ms += segment.durationMs
    }
    return ms > 10000 ? Math.round(bytes * 8000 / ms) : 0
  }

  function targets(session) {
    const { settings } = context
    if (!boosting()) {
      const server = session?.policy ? parsePolicy(session.policy) : {}
      return { audio: server.targetAudioMs || SERVER_DEFAULT_MS, video: server.targetVideoMs || SERVER_DEFAULT_MS }
    }
    return {
      audio: Math.min(wantedMs(), capMs(settings.mseAudioMb, bitrate(session, 'audio') || DEFAULT_AUDIO_BPS)),
      video: Math.min(wantedMs(), capMs(settings.mseVideoMb, bitrate(session, 'video') || DEFAULT_VIDEO_BPS))
    }
  }

  function policy(session, payload, backoffMs) {
    if (!boosting()) return backoffMs === undefined ? payload : rewritePolicy(payload, { backoffMs })
    const { audio, video } = targets(session)
    return rewritePolicy(payload, { audioMs: audio, videoMs: video, backoffMs })
  }

  function patch(response) {
    const config = response?.playerConfig?.mediaCommonConfig?.dynamicReadaheadConfig
    if (!config || !boosting()) return false
    const { settings } = context
    const limit = settings.quality === 'off' ? 1080 : heightOf(settings.quality)
    const formats = response.streamingData?.adaptiveFormats || []
    const best = (kind, fits) => Math.max(0, ...formats
      .filter(format => format.mimeType?.startsWith(kind) && fits(format))
      .map(format => format.averageBitrate || format.bitrate || 0))
    const videoBps = best('video/', format => (format.height || 0) <= limit) || DEFAULT_VIDEO_BPS
    const audioBps = best('audio/', () => true) || DEFAULT_AUDIO_BPS
    const target = Math.min(wantedMs(), capMs(settings.mseVideoMb, videoBps), capMs(settings.mseAudioMb, audioBps))
    if ((config.maxReadAheadMediaTimeMs || 0) >= target) return false
    log('player readahead', config.maxReadAheadMediaTimeMs, '->', target)
    config.maxReadAheadMediaTimeMs = target
    return true
  }

  return { targets, policy, patch }
}

export function trapInitialResponse(onValue) {
  let value
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    configurable: true,
    enumerable: true,
    get: () => value,
    set(next) {
      value = next
      onValue(next)
    }
  })
}
