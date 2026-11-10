import type { AnalysisResult } from './score-analysis'

const pitchClasses = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B']

export function getScorePitchClasses(result: Pick<AnalysisResult, 'noteCount' | 'pitchSequence' | 'music21' | 'pitchHistogram'>) {
  const total = result.noteCount
  if (total === null || !Number.isSafeInteger(total) || total < 0) return null
  const classes = pitchClasses.map(name => ({ name, key: name.includes('/') ? 'black' as const : 'white' as const, count: 0 }))

  // Older snapshots may have only the first few notes or a seven-letter histogram.
  for (const notes of [result.music21?.notes, result.pitchSequence]) {
    if (!Array.isArray(notes) || notes.length !== total || !notes.every(note => Number.isFinite(note?.midi))) continue
    let microtones = 0
    for (const { midi } of notes) {
      if (Number.isSafeInteger(midi)) classes[(midi % 12 + 12) % 12].count++
      else microtones++
    }
    return { classes, microtones }
  }

  const histogram = result.pitchHistogram
  if (!histogram || Object.keys(histogram).length !== classes.length) return null
  for (const pitch of classes) {
    const count = histogram[pitch.name]
    if (!Number.isSafeInteger(count) || count < 0) return null
    pitch.count = count
  }
  return classes.reduce((sum, pitch) => sum + pitch.count, 0) === total ? { classes, microtones: 0 } : null
}
