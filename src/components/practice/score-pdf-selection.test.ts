import assert from 'node:assert/strict'
import test from 'node:test'
import { formatScorePdfRange, inspectScorePdfPage, parseScorePdfRange, suggestScorePdfPages, type ScorePdfPageKind } from './score-pdf-selection'

function staffImage(starts: number[], lineWidth = 275, slope = 0) {
  const width = 360, height = 500
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const start of starts) {
    for (let line = 0; line < 5; line++) {
      for (let x = 42; x < 42 + lineWidth; x++) {
        const y = Math.round(start + line * 4 + slope * (x - width / 2))
        data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3)
      }
    }
  }
  return { width, height, data }
}

test('recognizes repeated wide staves on a slightly tilted page', () => {
  assert.equal(inspectScorePdfPage(staffImage([75, 108, 200, 233], 275, 0.022)), 'score')
})

test('keeps single staves uncertain and ignores short excerpt rows', () => {
  assert.equal(inspectScorePdfPage(staffImage([75])), 'uncertain')
  assert.equal(inspectScorePdfPage(staffImage([75, 108, 200], 65)), 'other')
})

test('suggests the dominant continuous run while bridging a single uncertain page', () => {
  const kinds = Array<ScorePdfPageKind>(24).fill('other')
  for (const page of [4, 5, 6, 8, 9, 10, 11, 17, 18, 20]) kinds[page - 1] = 'score'
  kinds[6] = 'uncertain'
  assert.deepEqual(suggestScorePdfPages(kinds), [4, 5, 6, 7, 8, 9, 10, 11])
  assert.deepEqual(suggestScorePdfPages(['other', 'uncertain']), [])
})

test('normalizes original PDF page ranges, supports gaps and retains natural order', () => {
  assert.deepEqual(parseScorePdfRange(' 15–17，12、16，20 ', 124), { pages: [12, 15, 16, 17, 20] })
  assert.equal(formatScorePdfRange([12, 15, 16, 17, 20]), '12, 15-17, 20')
})

test('rejects reversed, malformed and out-of-bounds page ranges', () => {
  for (const invalid of ['20-15', '0', '125', '15-', '15/20']) {
    assert.ok(parseScorePdfRange(invalid, 124).error, invalid)
  }
  assert.deepEqual(parseScorePdfRange('', 124), { pages: [] })
})
