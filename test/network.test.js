import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createNetwork } from '../src/page/network.js'

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true })
globalThis.window = new EventTarget()
mock.timers.enable({ apis: ['setTimeout'] })

function setup() {
  const calls = []
  const changes = []
  const context = {
    settings: { retrySeconds: 10 },
    nativeFetch: (url, init) => new Promise((resolve, reject) => calls.push({ url, init, resolve, reject }))
  }
  const network = createNetwork(context, online => changes.push(online))
  return { network, calls, changes }
}

test('a failed probe marks the connection lost and carries a timeout', async () => {
  const { network, calls, changes } = setup()
  const probing = network.check()
  calls[0].reject(new TypeError('Failed to fetch'))
  await probing
  assert.equal(network.online, false)
  assert.deepEqual(changes, [false])
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('the first retry after a drop comes quickly', async () => {
  const { network, calls } = setup()
  const probing = network.check()
  calls[0].reject(new TypeError('Failed to fetch'))
  await probing
  mock.timers.tick(2000)
  assert.equal(calls.length, 2)
})

test('an older probe that finishes late does not override a newer one', async () => {
  const { network, calls, changes } = setup()
  network.failed()
  const first = network.check()
  const second = network.check()
  calls[1].resolve({})
  await second
  calls[0].reject(new TypeError('Failed to fetch'))
  await first
  assert.equal(network.online, true)
  assert.deepEqual(changes, [false, true])
})
