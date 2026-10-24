import type { Music21Analysis } from './music21-analysis'

export function scoreAnalysisContext(analysis: Music21Analysis, question: string) {
  const match = question.match(/第\s*(\d{1,5})\s*(?:[—–\-至到]\s*(\d{1,5}))?\s*小节/)
  const start = match ? Number(match[1]) : null
  const end = match ? Number(match[2] ?? match[1]) : null
  const inRange = (item: { measure: number | null }) => start === null || end === null || (item.measure !== null && item.measure >= start && item.measure <= end)
  const { notes, chords, ...structure } = analysis.music21
  const selectedNotes = notes.filter(inRange)
  const selectedChords = chords.filter(inRange)
  return {
    title: analysis.title, composer: analysis.composer, key: analysis.key, range: analysis.range,
    noteCount: analysis.noteCount, pitchHistogram: analysis.pitchHistogram, warnings: analysis.warnings,
    music21: structure, requestedMeasures: start === null ? null : [start, end],
    noteScope: { total: selectedNotes.length, shown: Math.min(selectedNotes.length, 60) },
    chordScope: { total: selectedChords.length, shown: Math.min(selectedChords.length, 40) },
    notes: selectedNotes.slice(0, 60), chords: selectedChords.slice(0, 40),
  }
}
