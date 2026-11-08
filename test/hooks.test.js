import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installHooks } from '../src/page/hooks.js'

globalThis.location = { href: 'https://www.youtube.com/watch?v=abcdefghijk' }
globalThis.window = globalThis
globalThis.XMLHttpRequest = class {
  open() {}
  send() {}
}

const SABR_URL = 'https://rr1---sn-test.googlevideo.com/videoplayback?ei=E1&sabr=1&rn=1'
const OTHER_URL = 'https://www.youtube.com/api/stats/qoe'

function setup({ settingsNeverCome = false } = {}) {
  let settle
  const settled = new Promise(resolve => {
    settle = resolve
  })
  const calls = []
  const context = {
    loaded: false,
    settings: { enabled: true },
    active: () => context.loaded && context.settings.enabled,
    settled: () => settingsNeverCome ? Promise.resolve() : settled,
    nativeFetch: async url => {
      calls.push(['network', String(url)])
      return new Response('')
    },
    server: {
      handle: async call => {
        calls.push(['handled', call.url])
        return new Response('')
      }
    }
  }
  installHooks(context)
  function arrive() {
    context.loaded = true
    settle()
  }
  return { calls, arrive }
}

test('a SABR request made before the settings arrive waits for them and is handled', async () => {
  const { calls, arrive } = setup()
  const pending = window.fetch(SABR_URL, { method: 'POST', body: new Uint8Array(1) })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(calls, [])
  arrive()
  await pending
  assert.deepEqual(calls, [['handled', SABR_URL]])
})

test('other requests are not held back while the settings are on their way', async () => {
  const { calls } = setup()
  await window.fetch(OTHER_URL)
  assert.deepEqual(calls, [['network', OTHER_URL]])
})

test('when the settings never come the request goes out unchanged', async () => {
  const { calls } = setup({ settingsNeverCome: true })
  await window.fetch(SABR_URL, { method: 'POST', body: new Uint8Array(1) })
  assert.deepEqual(calls, [['network', SABR_URL]])
})
