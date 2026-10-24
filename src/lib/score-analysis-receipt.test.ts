import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createScoreAnalysisReceipt, verifyScoreAnalysisReceipt } from './score-analysis-receipt'

test('analysis receipts bind the complete result to its owner, content and expiration', () => {
  const previous = process.env.ZHIYIN_SESSION_SECRET
  process.env.ZHIYIN_SESSION_SECRET = 'music21-receipt-test-secret-at-least-32-characters'
  try {
    const result = {
      title: '练习', composer: null, key: null, range: 'C4 — C4（0半音）', noteCount: 1,
      chordColor: null, pitchHistogram: { C: 1 }, pitchSequence: [{ index: 1, midi: 60, note: 'C4' }],
      summary: '实际谱面', background: null, workBackground: null, composerBackground: null,
      creationYear: null, period: null, melody: null, provenance: 'musicxml', warnings: [],
      music21: { version: '10.5.1', partCount: 1, measureCount: 1, restCount: 0, timeSignatures: ['4/4'], tempos: [], declaredKeys: [], estimatedKey: null, notes: [{ index: 1, midi: 60, note: 'C4', part: '钢琴', measure: 1, beat: 1, offset: 0, duration: 1, voice: null }], chords: [] },
    }
    const analysisReceipt = createScoreAnalysisReceipt(result, 'student-a', 1000)
    const signed = { ...result, analysisReceipt }
    assert.equal(verifyScoreAnalysisReceipt(signed, 'student-a', 1001)?.noteCount, 1)
    assert.equal(verifyScoreAnalysisReceipt(signed, 'student-b', 1001), null)
    assert.equal(verifyScoreAnalysisReceipt(signed, 'student-a', 1000 + 2 * 60 * 60_000), null)
    assert.equal(verifyScoreAnalysisReceipt({ ...signed, noteCount: 99 }, 'student-a', 1001), null)
    assert.equal(verifyScoreAnalysisReceipt({ ...signed, analysisReceipt: `${analysisReceipt.slice(0, -1)}!` }, 'student-a', 1001), null)
    assert.equal(verifyScoreAnalysisReceipt(result, 'student-a', 1001), null)
  } finally {
    if (previous === undefined) delete process.env.ZHIYIN_SESSION_SECRET
    else process.env.ZHIYIN_SESSION_SECRET = previous
  }
})
