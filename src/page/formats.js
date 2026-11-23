const catalog = new Map()
const tracks = new Map()

export function learnFormats(list) {
  for (const item of list) {
    const kind = item.mimeType?.split('/')[0]
    if (kind !== 'audio' && kind !== 'video') continue
    catalog.set(item.itag, {
      kind,
      pixels: (item.width || 0) * (item.height || 0),
      bitrate: item.averageBitrate || item.bitrate || 0,
      label: item.qualityLabel || ''
    })
    if (item.audioTrack?.id || item.isDrc) tracks.set(item.xtags || '', [item.audioTrack?.id, item.isDrc ? 'drc' : ''].filter(Boolean).join(' '))
  }
}

export function kindOfItag(itag) {
  return catalog.get(itag)?.kind || ''
}

export function lowerThan(format, other) {
  const a = catalog.get(format.itag)
  const b = catalog.get(other.itag)
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'video') return a.pixels < b.pixels
  return a.bitrate < b.bitrate * 0.9
}

export function labelOf(format) {
  if (!format) return '-'
  return [format.itag, catalog.get(format.itag)?.label, tracks.get(format.xtags || '')].filter(Boolean).join(' ')
}
