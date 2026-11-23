export function createNext(context) {
  function upcoming() {
    const { settings, player } = context
    if (!settings.enabled || !settings.nextEnabled || player.shorts()) return []
    const currentId = player.videoId()
    if (!currentId) return []
    let id = null
    if (settings.nextSource !== 'autoplay') {
      const { ids, index } = player.playlist()
      if (ids.length && index >= 0) id = ids[index + 1] || null
    }
    if (!id && settings.nextSource !== 'playlist') id = player.autoplayId()
    return id && id !== currentId ? [id] : []
  }

  return { upcoming }
}
