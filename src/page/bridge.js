export const CHANNEL = 'ytbuffy'

export function send(type, data, transfer = []) {
  window.postMessage({ channel: CHANNEL, to: 'content', type, data }, location.origin, transfer)
}

export function listen(handler) {
  window.addEventListener('message', event => {
    const message = event.data
    if (event.source !== window || message?.channel !== CHANNEL || message.to !== 'page') return
    handler(message.type, message.data)
  })
}
