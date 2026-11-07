import { log } from './log.js'

const INIT_KEYS = ['method', 'credentials', 'mode', 'cache', 'redirect', 'referrer', 'referrerPolicy', 'integrity', 'priority']
const XHR_SABR = Symbol('ytbuffy-sabr')

export function isSabr(url, method) {
  return method === 'POST' && url.includes('.googlevideo.com/videoplayback') && /[?&]sabr=1(&|$)/.test(url)
}

export function isPlayerApi(url) {
  return new URL(url).pathname === '/youtubei/v1/player'
}

export function describe(input, init) {
  const options = init || {}
  const request = input instanceof Request ? input : null
  const raw = request ? request.url : input instanceof URL ? input.href : String(input)
  const method = String(options.method || request?.method || 'GET').toUpperCase()
  return { input, init: options, request, url: new URL(raw, location.href).href, method }
}

export async function readBody({ request, init }) {
  const body = init.body ?? (request ? await request.clone().arrayBuffer() : null)
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
  if (typeof body === 'string') return new TextEncoder().encode(body)
  throw new TypeError('Unsupported request body')
}

export function templateInit({ request, init }) {
  const result = {}
  for (const key of INIT_KEYS) {
    const value = init[key] ?? request?.[key]
    if (value !== undefined) result[key] = value
  }
  result.method = 'POST'
  result.headers = Object.fromEntries(new Headers(init.headers ?? request?.headers ?? undefined))
  return result
}

export function signalOf({ request, init }) {
  return init.signal ?? request?.signal ?? undefined
}

export function installHooks(context) {
  const { nativeFetch } = context
  window.fetch = function (input, init) {
    if (!context.active()) return nativeFetch(input, init)
    const call = describe(input, init)
    if (isSabr(call.url, call.method)) return context.server.handle(call)
    if (isPlayerApi(call.url)) return nativeFetch(input, init).then(response => patchPlayerResponse(response, context))
    return nativeFetch(input, init)
  }
  watchXhr(context)
}

async function patchPlayerResponse(response, context) {
  if (!response.ok) return response
  try {
    const json = await response.clone().json()
    if (!context.readahead.patch(json)) return response
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(JSON.stringify(json), { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    log('player response left untouched', error)
    return response
  }
}

function watchXhr(context) {
  const open = XMLHttpRequest.prototype.open
  const send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this[XHR_SABR] = isSabr(new URL(String(url), location.href).href, String(method).toUpperCase())
    return open.call(this, method, url, ...rest)
  }
  XMLHttpRequest.prototype.send = function (body) {
    if (this[XHR_SABR] && context.active()) {
      log('SABR request over XHR, observed only')
      this.addEventListener('load', () => {
        if (this.response instanceof ArrayBuffer) context.server.ingest(body, new Uint8Array(this.response))
      })
    }
    return send.call(this, body)
  }
}
