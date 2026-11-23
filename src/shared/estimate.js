const VIDEO_MBPS = { 144: 0.08, 240: 0.18, 360: 0.35, 480: 0.7, 720: 1.4, 1080: 2.6, 2160: 13 }
const AUDIO_MBPS = 0.13

export function heightOf(quality) {
  return quality === 'max' ? 2160 : Number(quality)
}

export function minutesFor(memoryMb, height) {
  const megabits = memoryMb * 1048576 * 8 / 1e6
  return Math.floor(megabits / (VIDEO_MBPS[height] + AUDIO_MBPS) / 60)
}
