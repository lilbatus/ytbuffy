import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { STRINGS } from '../src/shared/strings.js'
import { CHOICES, DEFAULTS, LANGUAGES, MULTI } from '../src/shared/settings.js'

const STATES = ['loading', 'waiting', 'manual', 'held', 'paused', 'offline', 'done', 'target', 'limit', 'live', 'shorts', 'ad', 'error', 'idle', 'off', 'none']
const ROWS = ['live', 'estimate', 'export', 'import', 'reset']

function placeholders(text) {
  return [...text.matchAll(/\{(\d)\}/g)].map(match => match[1]).sort().join(',')
}

function sources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? sources(path) : path.endsWith('.js') || path.endsWith('.html') ? [readFileSync(path, 'utf8')] : []
  })
}

test('every language has the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS).sort(), [...LANGUAGES].sort())
  const keys = Object.keys(STRINGS.en).sort()
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(STRINGS[language]).sort(), keys, language)
    for (const key of keys) assert.equal(placeholders(STRINGS[language][key]), placeholders(STRINGS.en[key]), `${language}.${key}`)
  }
})

test('every setting, choice and state has its text', () => {
  const needed = [
    ...STATES.map(state => `state_${state}`),
    ...[...Object.keys(DEFAULTS).filter(key => key !== 'language'), ...ROWS].flatMap(key => [`opt_${key}`, `opt_${key}_desc`]),
    ...[...Object.entries(CHOICES), ...Object.entries(MULTI)].filter(([key]) => key !== 'language')
      .flatMap(([key, choices]) => choices.map(choice => `opt_${key}_${choice.replace(/-/g, '_')}`))
  ]
  for (const key of needed) assert.ok(STRINGS.en[key], key)
})

test('every key the code asks for exists', () => {
  const code = [...sources('src'), ...sources('static')].join('\n')
  const keys = [
    ...[...code.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(match => match[1]),
    ...[...code.matchAll(/data-i18n="([A-Za-z_]+)"/g)].map(match => match[1])
  ]
  assert.ok(keys.length > 20)
  for (const key of new Set(keys)) assert.ok(STRINGS.en[key], key)
})
