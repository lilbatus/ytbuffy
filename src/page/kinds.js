const kinds = new Map()

export function learnKinds(formats) {
  for (const format of formats) {
    const kind = format.mimeType?.split('/')[0]
    if (kind === 'audio' || kind === 'video') kinds.set(format.itag, kind)
  }
}

export function kindOfItag(itag) {
  return kinds.get(itag) || ''
}
