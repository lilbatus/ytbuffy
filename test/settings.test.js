import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, normalize } from '../src/shared/settings.js'
import { pickLevel } from '../src/page/player.js'

test('missing or broken input falls back to defaults', () => {
  assert.deepEqual(normalize(undefined), DEFAULTS)
  assert.deepEqual(normalize('nope'), DEFAULTS)
  assert.deepEqual(normalize({}), DEFAULTS)
})

test('numbers are clamped and rounded', () => {
  const result = normalize({ memoryMb: 999999, delayMs: -5, aheadMinutes: '12.6', keepVideos: 'x', warnSeconds: '' })
  assert.equal(result.memoryMb, 4000)
  assert.equal(result.delayMs, 0)
  assert.equal(result.aheadMinutes, 13)
  assert.equal(result.keepVideos, DEFAULTS.keepVideos)
  assert.equal(result.warnSeconds, DEFAULTS.warnSeconds)
})

test('choices, booleans and colors are validated', () => {
  const result = normalize({ startMode: 'never', quality: '720', debug: 'yes', enabled: false, progressColor: '#ABCDEF', unknown: 1 })
  assert.equal(result.startMode, DEFAULTS.startMode)
  assert.equal(result.quality, '720')
  assert.equal(result.debug, false)
  assert.equal(result.enabled, false)
  assert.equal(result.progressColor, '#abcdef')
  assert.equal('unknown' in result, false)
  assert.equal(normalize({ progressColor: 'red' }).progressColor, DEFAULTS.progressColor)
})

test('multiple choices keep only known values in a fixed order', () => {
  assert.deepEqual(normalize({ onLimit: ['watched', 'nope', 'others'] }).onLimit, ['others', 'watched'])
  assert.deepEqual(normalize({ onLimit: [] }).onLimit, [])
  assert.deepEqual(normalize({ onLimit: 'evict-watched' }).onLimit, DEFAULTS.onLimit)
  assert.equal(normalize({}).keepOnReload, true)
  assert.equal(normalize({}).trimCopy, false)
  assert.equal(normalize({ trimCopyMinutes: 500 }).trimCopyMinutes, 60)
  assert.equal(normalize({}).delayMs, 50)
})

test('quality lock picks the exact level or falls back in the chosen direction', () => {
  const levels = ['hd1080', 'hd720', 'large', 'medium', 'auto']
  assert.equal(pickLevel(levels, '720', 'lower'), 'hd720')
  assert.equal(pickLevel(levels, 'max', 'lower'), 'hd1080')
  assert.equal(pickLevel(['hd1080', 'large', 'medium'], '720', 'lower'), 'large')
  assert.equal(pickLevel(['hd1080', 'large', 'medium'], '720', 'higher'), 'hd1080')
  assert.equal(pickLevel(['large', 'medium'], '1080', 'higher'), 'large')
  assert.equal(pickLevel(['hd720'], '144', 'lower'), 'hd720')
  assert.equal(pickLevel([], '720', 'lower'), null)
})

test('the audio buffer default follows the browser', async () => {
  for (const [browser, megabytes] of [['chrome', 12], ['opera', 12], ['firefox', 20]]) {
    process.env.BROWSER = browser
    const { DEFAULTS } = await import(`../src/shared/settings.js?${browser}`)
    assert.equal(DEFAULTS.mseAudioMb, megabytes, browser)
  }
  delete process.env.BROWSER
})
