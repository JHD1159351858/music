import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeImageAnalysis, parseNotation } from './score-analysis'
import { getScorePitchClasses } from './score-pitch-classes'

test('MusicXML text, ABC and transcribed image events count actual keys by pitch class', () => {
  const notes = [{ step: 'C', alter: 1, octave: 4 }, { step: 'D', alter: -1, octave: 5 }, { step: 'E', alter: 1, octave: 4 }]
  const xml = `<score-partwise><part><measure>${notes.map(({ step, alter, octave }) => `<note><pitch><step>${step}</step><alter>${alter}</alter><octave>${octave}</octave></pitch></note>`).join('')}</measure></part></score-partwise>`
  for (const result of [parseNotation(xml), parseNotation('X:1\nK:C\n^C _d ^E'), normalizeImageAnalysis({ notes })]) {
    const distribution = getScorePitchClasses(result)
    assert.ok(distribution)
    assert.deepEqual(distribution.classes.map(pitch => [pitch.name, pitch.key, pitch.count]), [
      ['C', 'white', 0], ['C♯/D♭', 'black', 2], ['D', 'white', 0], ['D♯/E♭', 'black', 0], ['E', 'white', 0], ['F', 'white', 1],
      ['F♯/G♭', 'black', 0], ['G', 'white', 0], ['G♯/A♭', 'black', 0], ['A', 'white', 0], ['A♯/B♭', 'black', 0], ['B', 'white', 0],
    ])
    assert.equal(distribution.microtones, 0)
  }
})

test('reopened legacy history can recover exact pitch classes from a complete sequence only', () => {
  const result = parseNotation('X:1\nK:C\n^F _G B')
  assert.equal(getScorePitchClasses(result)?.classes[6].count, 2)
  assert.equal(getScorePitchClasses({ ...result, pitchSequence: result.pitchSequence?.slice(0, 2) ?? null }), null)
  assert.equal(getScorePitchClasses({ ...result, pitchSequence: null }), null)
})

test('a complete stored chromatic histogram is accepted but missing buckets are unknown', () => {
  const result = parseNotation('X:1\nK:C\n^F _G B')
  const pitchHistogram = { C: 0, 'C♯/D♭': 0, D: 0, 'D♯/E♭': 0, E: 0, F: 0, 'F♯/G♭': 2, G: 0, 'G♯/A♭': 0, A: 0, 'A♯/B♭': 0, B: 1 }
  assert.equal(getScorePitchClasses({ ...result, pitchSequence: null, pitchHistogram })?.classes[6].count, 2)
  assert.equal(getScorePitchClasses({ ...result, pitchSequence: null, pitchHistogram: { ...pitchHistogram, B: 0 } }), null)
})

test('rest-only notation has twelve measured zeros while unrecognized images have unknown data', () => {
  assert.deepEqual(getScorePitchClasses(parseNotation('X:1\nK:C\nz4'))?.classes.map(pitch => pitch.count), Array(12).fill(0))
  assert.equal(getScorePitchClasses(normalizeImageAnalysis({ notes: [] })), null)
})

test('fractional MIDI values are reported separately from the twelve piano key classes', () => {
  const result = parseNotation('X:1\nK:C\nC')
  const distribution = getScorePitchClasses({ ...result, pitchSequence: [{ index: 1, midi: 60.5, note: 'C𝄲4' }] })
  assert.equal(distribution?.microtones, 1)
  assert.deepEqual(distribution?.classes.map(pitch => pitch.count), Array(12).fill(0))
})
