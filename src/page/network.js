import { log } from './log.js'

const PROBE_URL = 'https://www.youtube.com/generate_204'
const FIRST_RETRY_MS = 2000

export function createNetwork(context, onChange) {
  let online = navigator.onLine
  let timer = 0

  function set(value) {
    if (value && !navigator.onLine) value = false
    if (value === online) return
    online = value
    log(online ? 'connection is back' : 'connection lost')
    if (online) clearTimeout(timer)
    else schedule(FIRST_RETRY_MS)
    onChange(online)
  }

  function schedule(delay = context.settings.retrySeconds * 1000) {
    clearTimeout(timer)
    timer = setTimeout(probe, delay)
  }

  async function probe() {
    try {
      await context.nativeFetch(PROBE_URL, { mode: 'no-cors', cache: 'no-store', credentials: 'omit' })
      set(true)
      if (!online) schedule()
    } catch {
      if (online) set(false)
      else schedule()
    }
  }

  if (!online) schedule(FIRST_RETRY_MS)
  window.addEventListener('offline', () => set(false))
  window.addEventListener('online', probe)

  return {
    get online() {
      return online
    },
    check: probe,
    failed: () => set(false),
    succeeded: () => set(true)
  }
}
