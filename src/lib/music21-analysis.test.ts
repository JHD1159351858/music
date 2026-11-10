import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeMusicXml, readMusicXmlUpload } from './music21-analysis'
import { getScorePitchClasses } from './score-pitch-classes'

export const simpleMusicXml = `<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><work><work-title>接口验证谱</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><rest/><duration>2</duration><type>half</type></note></measure></part></score-partwise>`

function upload(file: File): Request {
  const body = new FormData()
  body.append('file', file)
  return new Request('http://localhost/api/analysis', { method: 'POST', body })
}

test('music21 bridge runs the actual parser and returns measured pitches and rhythm', async () => {
  const result = await analyzeMusicXml(Buffer.from(simpleMusicXml), '练习.musicxml')
  assert.equal(result.title, '接口验证谱')
  assert.equal(result.noteCount, 2)
  assert.deepEqual(result.pitchSequence?.map(point => point.midi), [60, 64])
  assert.equal(result.music21.partCount, 1)
  assert.equal(result.music21.restCount, 1)
  assert.deepEqual(result.music21.timeSignatures, ['4/4'])
  assert.deepEqual(result.music21.notes.map(note => note.duration), [1, 1])
  assert.match(result.music21.version, /^10\./)
})

test('music21 file analysis and reopened detailed events count enharmonic keys together', async () => {
  const xml = simpleMusicXml.replace('<step>C</step>', '<step>C</step><alter>1</alter>').replace('<step>E</step>', '<step>D</step><alter>-1</alter>')
  const result = await analyzeMusicXml(Buffer.from(xml), 'enharmonic.musicxml')
  assert.deepEqual(result.pitchSequence?.map(note => note.midi), [61, 61])
  for (const snapshot of [result, { ...result, pitchSequence: null }]) {
    const histogram = getScorePitchClasses(snapshot)
    assert.equal(histogram?.classes[1].count, 2)
    assert.equal(histogram?.classes.reduce((sum, pitch) => sum + pitch.count, 0), 2)
  }
})

test('Unicode score metadata and part labels survive the Python to JavaScript boundary', async () => {
  const title = '🎵'.repeat(1600)
  const part = '🎹'.repeat(80)
  const xml = simpleMusicXml.replace('接口验证谱', title).replace('<part-name>Piano</part-name>', `<part-name>${part}</part-name>`)
  const result = await analyzeMusicXml(Buffer.from(xml), 'unicode.musicxml')
  assert.equal(result.title, title)
  assert.equal(result.music21.notes[0].part, part)
})

test('multipart accepts a MusicXML file regardless of browser MIME and rejects PDF or empty files', async () => {
  const result = await readMusicXmlUpload(upload(new File([simpleMusicXml], 'PIANO.XML', { type: 'application/octet-stream' })))
  assert.equal(result.name, 'PIANO.XML')
  assert.equal(result.content.toString(), simpleMusicXml)
  await assert.rejects(readMusicXmlUpload(upload(new File(['%PDF'], 'score.pdf'))), /MusicXML/)
  await assert.rejects(readMusicXmlUpload(upload(new File([], 'empty.xml'))), /非空/)
})

test('multipart enforces the actual streamed size and rejects more than one file', async () => {
  const body = new FormData()
  body.append('file', new File([simpleMusicXml], 'one.xml'))
  body.append('file', new File([simpleMusicXml], 'two.xml'))
  await assert.rejects(readMusicXmlUpload(new Request('http://localhost/api/analysis', { method: 'POST', body })), /一个/)
  await assert.rejects(readMusicXmlUpload(upload(new File([Buffer.alloc(8 * 1024 * 1024 + 1)], 'large.xml'))), /8MB/)
})

test('invalid XML is rejected and a missing Python runtime has a recoverable service error', async () => {
  await assert.rejects(analyzeMusicXml(Buffer.from('<not-a-score/>'), 'fake.xml'), /MusicXML|乐谱/)
  const previous = process.env.ZHIYIN_MUSIC21_PYTHON
  process.env.ZHIYIN_MUSIC21_PYTHON = 'nonexistent-music21-python-for-test'
  try {
    await assert.rejects(analyzeMusicXml(Buffer.from(simpleMusicXml), 'valid.xml'), error => error instanceof Error && 'status' in error && error.status === 503)
  } finally {
    if (previous === undefined) delete process.env.ZHIYIN_MUSIC21_PYTHON
    else process.env.ZHIYIN_MUSIC21_PYTHON = previous
  }
})
