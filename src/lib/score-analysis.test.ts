import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseNotation, normalizeImageAnalysis } from './score-analysis'

test('MusicXML metrics use actual pitched notes, exclude rests, and preserve pitch order', () => {
  const result = parseNotation('<score-partwise><work><work-title>练习曲</work-title></work><part id="P1"><measure><attributes><key><fifths>0</fifths><mode>major</mode></key></attributes><note><pitch><step>C</step><octave>4</octave></pitch></note><note><rest/></note><note><pitch><step>G</step><octave>4</octave></pitch></note><note><pitch><step>C</step><alter>1</alter><octave>5</octave></pitch></note></measure></part></score-partwise>')
  assert.equal(result.noteCount, 3)
  assert.equal(result.key, 'C大调')
  assert.equal(result.range, 'C4 — C♯5（13半音）')
  assert.deepEqual(result.pitchSequence?.map(note => note.midi), [60, 67, 73])
  assert.deepEqual(result.pitchHistogram, { C: 2, D: 0, E: 0, F: 0, G: 1, A: 0, B: 0 })
  assert.equal(result.chordColor, null)
  assert.equal('rhythmDensity' in result, false)
})
test('ABC parser applies key signatures and accidentals within a measure', () => {
  const result = parseNotation('X:1\nT:连奏\nM:4/4\nK:G\nF =F F | F z G c')
  assert.equal(result.noteCount, 6)
  assert.deepEqual(result.pitchSequence?.map(note => note.midi), [66, 65, 65, 66, 67, 72])
  assert.equal(result.key, 'G大调')
})
test('MusicXML key signature without a mode does not assume a major key', () => {
  const result = parseNotation('<score-partwise><part><measure><attributes><key><fifths>0</fifths></key></attributes><note><pitch><step>A</step><octave>4</octave></pitch></note></measure></part></score-partwise>')
  assert.equal(result.key, null)
})
test('ABC tied accidental keeps its pitch across a measure boundary', () => {
  assert.deepEqual(parseNotation('X:1\nK:C\n^F-|F').pitchSequence?.map(note => note.midi), [66, 66])
})
test('unsupported or incomplete notation is rejected instead of reporting invented totals', () => {
  assert.throws(() => parseNotation('任意文本CDEFG'), /MusicXML|ABC/)
  assert.throws(() => parseNotation('X:1\nK:C\n[V:1] C D'), /多声部|暂不支持/)
  assert.throws(() => parseNotation('<score-partwise><part><measure><note><pitch><step>C</step></pitch></note></measure></part></score-partwise>'), /音高|八度/)
})
test('unrecognized image fields stay null; only validated transcribed notes generate metrics', () => {
  const missing = normalizeImageAnalysis({ title: '未知', noteCount: 888, pitchHistogram: { C: 123 }, rhythmDensity: '快' })
  assert.equal(missing.noteCount, null)
  assert.equal(missing.pitchHistogram, null)
  assert.equal(missing.pitchSequence, null)
  assert.equal('rhythmDensity' in missing, false)
  const parsed = normalizeImageAnalysis({ notes: [{ step: 'C', octave: 4, alter: 0 }, { step: 'E', octave: 4, alter: 0 }] })
  assert.equal(parsed.noteCount, 2)
  assert.equal(parsed.range, 'C4 — E4（4半音）')
  assert.equal(normalizeImageAnalysis({ notes: [{ step: 'C', octave: 4 }, { step: 'Z', octave: 9 }] }).noteCount, null)
})
