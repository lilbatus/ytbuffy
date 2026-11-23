import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))

test('both manifests carry the package version', () => {
  const { version } = read('package.json')
  assert.equal(read('static/manifest.json').version, version)
  assert.equal(read('static/manifest.firefox.json').version, version)
})

test('the Firefox manifest keeps the same scripts and pages as the Chromium one', () => {
  const chromium = read('static/manifest.json')
  const firefox = read('static/manifest.firefox.json')
  for (const key of ['name', 'description', 'icons', 'action', 'options_ui', 'content_scripts']) assert.deepEqual(firefox[key], chromium[key], key)
})
