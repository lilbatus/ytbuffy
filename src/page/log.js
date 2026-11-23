let debug = false

export function setDebug(value) {
  debug = value
}

export function log(...args) {
  if (debug) console.log('[ytbuffy]', ...args)
}
