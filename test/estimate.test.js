import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heightOf, minutesFor } from '../src/shared/estimate.js'
import { formatMegabytes, formatTime } from '../src/shared/format.js'

test('500 MB holds roughly 25 minutes of 1080p and 45 minutes of 720p', () => {
  assert.equal(minutesFor(500, 1080), 25)
  assert.equal(minutesFor(500, 720), 45)
})

test('lower qualities always fit more minutes', () => {
  const heights = [2160, 1080, 720, 480, 360, 240, 144]
  const minutes = heights.map(height => minutesFor(500, height))
  for (let index = 1; index < minutes.length; index++) assert.ok(minutes[index] > minutes[index - 1])
})

test('quality names map to heights', () => {
  assert.equal(heightOf('480'), 480)
  assert.equal(heightOf('max'), 2160)
})

test('times and sizes format for display', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(75.9), '1:15')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(formatMegabytes(212 * 1048576), '212 MB')
})
