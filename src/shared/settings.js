export const LANGUAGES = ['en', 'tr']

export const QUALITIES = ['off', '144', '240', '360', '480', '720', '1080', 'max']

export const DEFAULTS = {
  language: 'en',
  enabled: true,
  startMode: 'play',
  shorts: false,
  quality: 'off',
  qualityFallback: 'lower',
  refetchOnQualityChange: true,
  aheadMode: 'end',
  aheadMinutes: 30,
  delayMs: 50,
  whilePaused: true,
  onSeek: 'keep',
  boostReadahead: true,
  memoryMb: 500,
  onLimit: ['others', 'watched'],
  onSwitch: 'clear',
  keepVideos: 2,
  keepOnReload: true,
  trimCopy: false,
  trimCopyMinutes: 2,
  retrySeconds: 10,
  notifyConnection: true,
  warnSeconds: 30,
  nextEnabled: true,
  nextSource: 'both',
  nextAmount: 'minutes',
  nextMinutes: 5,
  progressBar: true,
  progressColor: '#3ea6ff',
  indicator: true,
  notifyLoaded: true,
  debug: false,
  mseVideoMb: 150,
  mseAudioMb: 12
}

export const CHOICES = {
  language: LANGUAGES,
  startMode: ['open', 'play', 'manual'],
  quality: QUALITIES,
  qualityFallback: ['lower', 'higher'],
  aheadMode: ['end', 'minutes'],
  onSeek: ['keep', 'restart'],
  onSwitch: ['clear', 'keep'],
  nextSource: ['both', 'playlist', 'autoplay'],
  nextAmount: ['all', 'minutes']
}

export const MULTI = {
  onLimit: ['others', 'watched']
}

export const RANGES = {
  aheadMinutes: [1, 600],
  delayMs: [0, 5000],
  memoryMb: [50, 4000],
  keepVideos: [1, 10],
  trimCopyMinutes: [1, 60],
  nextMinutes: [1, 120],
  retrySeconds: [2, 120],
  warnSeconds: [0, 600],
  mseVideoMb: [30, 4000],
  mseAudioMb: [2, 400]
}

export function normalize(input) {
  const result = { ...DEFAULTS }
  if (!input || typeof input !== 'object') return result
  for (const key of Object.keys(DEFAULTS)) {
    if (input[key] !== undefined) result[key] = clean(key, input[key])
  }
  return result
}

function clean(key, value) {
  const fallback = DEFAULTS[key]
  if (MULTI[key]) return Array.isArray(value) ? MULTI[key].filter(choice => value.includes(choice)) : fallback
  if (CHOICES[key]) return CHOICES[key].includes(value) ? value : fallback
  if (RANGES[key]) {
    const number = Number(value)
    if (value === '' || value === null || !Number.isFinite(number)) return fallback
    const [min, max] = RANGES[key]
    return Math.round(Math.min(max, Math.max(min, number)))
  }
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback
  if (key === 'progressColor') return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
  return fallback
}
