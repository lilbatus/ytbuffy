const LEVELS = { tiny: 144, small: 240, medium: 360, large: 480, hd720: 720, hd1080: 1080, hd1440: 1440, hd2160: 2160, highres: 4320 }

export function pickLevel(available, quality, fallback) {
  const levels = available.filter(level => LEVELS[level]).sort((a, b) => LEVELS[b] - LEVELS[a])
  if (!levels.length) return null
  if (quality === 'max') return levels[0]
  const want = Number(quality)
  const exact = levels.find(level => LEVELS[level] === want)
  if (exact) return exact
  const lower = levels.find(level => LEVELS[level] < want)
  const higher = [...levels].reverse().find(level => LEVELS[level] > want)
  return fallback === 'higher' ? higher || lower : lower || higher
}

function isShorts() {
  return location.pathname.startsWith('/shorts/')
}

export function createPlayer() {
  function element() {
    return document.getElementById(isShorts() ? 'shorts-player' : 'movie_player')
  }

  function api() {
    const found = element()
    return found && typeof found.getVideoData === 'function' ? found : null
  }

  function videoId() {
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v')
    if (isShorts()) return location.pathname.split('/')[2] || null
    const miniplayer = document.querySelector('ytd-app')?.hasAttribute('miniplayer-is-active')
    return miniplayer ? api()?.getVideoData()?.video_id || null : null
  }

  function autoplayId() {
    const toggle = document.querySelector('#movie_player .ytp-autonav-toggle-button')
    if (toggle && toggle.getAttribute('aria-checked') !== 'true') return null
    const href = document.querySelector('#movie_player .ytp-next-button')?.getAttribute('href')
    return href ? new URL(href, location.origin).searchParams.get('v') : null
  }

  return {
    element,
    shorts: isShorts,
    autoplayId,
    videoId,
    loaded: () => Boolean(api()?.getVideoData?.()?.video_id),
    title: () => api()?.getVideoData?.()?.title || document.title.replace(/ - YouTube$/, ''),
    time: () => api()?.getCurrentTime?.() || 0,
    duration: () => api()?.getDuration?.() || 0,
    playing: () => api()?.getPlayerState?.() === 1,
    paused: () => api()?.getPlayerState?.() === 2,
    ad: () => Boolean(element()?.classList.contains('ad-showing')),
    live: () => Boolean(api()?.getVideoData?.()?.isLive || api()?.getPlayerResponse?.()?.videoDetails?.isLive),
    levels: () => api()?.getAvailableQualityLevels?.() || [],
    setQuality: level => api()?.setPlaybackQualityRange?.(level, level),
    formats: () => api()?.getPlayerResponse?.()?.streamingData?.adaptiveFormats || [],
    playlist: () => ({ ids: api()?.getPlaylist?.() || [], index: api()?.getPlaylistIndex?.() ?? -1 })
  }
}
