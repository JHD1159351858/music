import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { z } from 'zod'

export interface PitchPoint { index: number; midi: number; note: string }
export interface Music21Details {
  version: string; partCount: number; measureCount: number; restCount: number
  timeSignatures: string[]; tempos: number[]; declaredKeys: string[]
  estimatedKey: { name: string; correlation: number | null } | null
  notes: Array<{ index: number; midi: number; note: string; part: string; measure: number | null; beat: number | null; offset: number; duration: number; voice: string | null }>
  chords: Array<{ measure: number | null; beat: number | null; offset: number; notes: string[]; name: string; romanNumeral: string | null }>
}
export interface AnalysisResult {
  title: string | null; composer: string | null; key: string | null; range: string | null
  noteCount: number | null; chordColor: string | null
  pitchHistogram: Record<string, number> | null; pitchSequence: PitchPoint[] | null
  summary: string | null; background: string | null
  workBackground: string | null; composerBackground: string | null
  creationYear: string | null; period: string | null; melody: string | null
  provenance: 'musicxml' | 'abc' | 'image-model'; warnings: string[]
  music21?: Music21Details
  analysisReceipt?: string
  sources?: Array<{ title: string; url: string | null }>
  fileName?: string
  historyId?: string
}
const pitchSchema = z.object({ step: z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']), octave: z.number().int().min(-1).max(9), alter: z.number().int().min(-2).max(2).default(0) })
type Pitch = z.infer<typeof pitchSchema>
const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const majorKeys = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
const minorKeys = ['a♭', 'e♭', 'b♭', 'f', 'c', 'g', 'd', 'a', 'e', 'b', 'f♯', 'c♯', 'g♯', 'd♯', 'a♯']
const blank = (provenance: AnalysisResult['provenance']): AnalysisResult => ({ title: null, composer: null, key: null, range: null, noteCount: null, chordColor: null, pitchHistogram: null, pitchSequence: null, summary: null, background: null, workBackground: null, composerBackground: null, creationYear: null, period: null, melody: null, provenance, warnings: [] })
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function array(value: unknown): unknown[] { return value === undefined ? [] : Array.isArray(value) ? value : [value] }
function text(value: unknown): string | null {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : typeof object(value)['#text'] === 'string' ? String(object(value)['#text']).trim() : ''
  return raw && !['null', '未识别', '未知'].includes(raw) ? raw.slice(0, 1600) : null
}
function midi(pitch: Pitch): number { return (pitch.octave + 1) * 12 + semitones[pitch.step] + pitch.alter }
function noteName(pitch: Pitch): string { return `${pitch.step}${pitch.alter > 0 ? '♯'.repeat(pitch.alter) : '♭'.repeat(-pitch.alter)}${pitch.octave}` }
function setMetrics(result: AnalysisResult, pitches: Pitch[]) {
  if (!pitches.length) return
  if (pitches.some(pitch => midi(pitch) < 0 || midi(pitch) > 127)) throw new Error('音高超出可解析范围')
  const histogram = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 }
  const sequence = pitches.map((pitch, index) => { histogram[pitch.step]++; return { index: index + 1, midi: midi(pitch), note: noteName(pitch) } })
  const ordered = [...pitches].sort((a, b) => midi(a) - midi(b))
  result.noteCount = pitches.length
  result.range = `${noteName(ordered[0])} — ${noteName(ordered[ordered.length - 1])}（${midi(ordered[ordered.length - 1]) - midi(ordered[0])}半音）`
  result.pitchHistogram = histogram
  result.pitchSequence = sequence
}
function xmlAnalysis(input: string): AnalysisResult {
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(input)) throw new Error('暂不支持包含自定义实体的 MusicXML')
  if (XMLValidator.validate(input) !== true) throw new Error('MusicXML 格式无效，请检查完整 XML 文件')
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false })
  const parsed: unknown = parser.parse(input)
  const root = object(object(parsed)['score-partwise'])
  if (!Object.keys(root).length) throw new Error('暂不支持此 MusicXML 结构，请使用 score-partwise 格式')
  const result = blank('musicxml')
  result.title = text(object(root.work)['work-title']) ?? text(root['movement-title'])
  const creator = array(object(root.identification).creator).find(value => object(value)['@_type'] === 'composer')
  result.composer = text(creator)
  const pitches: Pitch[] = []
  const keys = new Set<string>()
  for (const part of array(root.part)) for (const measure of array(object(part).measure)) {
    const key = object(object(object(measure).attributes).key)
    if (key.fifths !== undefined) {
      const fifths = Number(key.fifths)
      const mode = text(key.mode)
      if (mode && Number.isInteger(fifths) && fifths >= -7 && fifths <= 7 && ['minor', 'major'].includes(mode)) keys.add(`${(mode === 'minor' ? minorKeys : majorKeys)[fifths + 7]}${mode === 'minor' ? '小调' : '大调'}`)
    }
    for (const value of array(object(measure).note)) {
      const note = object(value)
      if ('rest' in note) continue
      if (!('pitch' in note)) throw new Error('存在未识别的音高，无法可靠统计；请使用带完整音高的谱面')
      const pitch = object(note.pitch)
      const checked = pitchSchema.safeParse({ step: pitch.step, octave: pitch.octave, alter: pitch.alter ?? 0 })
      if (!checked.success) throw new Error('音高或八度信息不完整，无法可靠解析')
      pitches.push(checked.data)
    }
  }
  result.key = keys.size === 1 ? [...keys][0] : keys.size > 1 ? [...keys].join(' → ') : null
  setMetrics(result, pitches)
  result.summary = pitches.length ? `从 MusicXML 实际读取 ${pitches.length} 个有音高的谱面音符，休止符不计入；反复段落不展开。` : '未识别到有音高的音符。'
  result.warnings.push('音高走向按声部与谱面顺序展示，多声部不代表单一旋律时间线。和弦色彩及未标注背景不作推断。')
  return result
}
function abcAnalysis(input: string): AnalysisResult {
  const lines = input.replace(/%[^\n]*/g, '').split(/\r?\n/)
  const keyIndex = lines.findIndex(line => /^K:/.test(line.trim()))
  if (keyIndex < 0 || !lines.some(line => /^X:/.test(line.trim()))) throw new Error('请提供完整 MusicXML 或带 X:、K: 头部的 ABC 记谱')
  if (lines.filter(line => /^K:/.test(line.trim())).length > 1 || /(?:^|\n)\s*[VU]:|\[[A-Za-z]:/.test(input)) throw new Error('暂不支持多声部、行内换调或宏记谱，请转换为 MusicXML')
  const keyText = lines[keyIndex].trim().slice(2).trim()
  const keyMatch = /^([A-G])([#b]?)(m|min|minor|maj|major)?$/i.exec(keyText)
  if (!keyMatch) throw new Error('暂不支持该 ABC 调式或自定义调号，请转换为 MusicXML')
  const minor = ['m', 'min', 'minor'].includes((keyMatch[3] ?? '').toLowerCase())
  const tonic = keyMatch[1].toUpperCase() + keyMatch[2].replace('#', '♯').replace('b', '♭')
  const keyNames = minor ? minorKeys : majorKeys
  const keyPosition = keyNames.findIndex(name => name.toUpperCase() === tonic.toUpperCase())
  if (keyPosition < 0) throw new Error('未识别 ABC 调号')
  const fifths = keyPosition - 7
  const signature: Record<string, number> = {}
  const order = fifths > 0 ? 'FCGDAEB' : 'BEADGCF'
  for (let index = 0; index < Math.abs(fifths); index++) signature[order[index]] = Math.sign(fifths)
  const body = lines.slice(keyIndex + 1).filter(line => !/^\s*[A-Za-z]:/.test(line)).join(' ').replace(/"[^"\n]*"|![^!\n]*!|\+[^+\n]*\+/g, '')
  if (/\]\s*-/.test(body)) throw new Error('暂不支持 ABC 和弦延音，请转换为 MusicXML')
  const pitches: Pitch[] = []
  const accidentals = new Map<string, number>()
  let tiedPitch: Pitch | null = null
  let canTie = false
  let position = 0
  while (position < body.length) {
    const remaining = body.slice(position)
    const pitchMatch = /^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)(?:\d+(?:\/\d*)?|\/+\d*)?/.exec(remaining)
    if (pitchMatch) {
      const step = pitchMatch[2].toUpperCase() as Pitch['step']
      const octave = (pitchMatch[2] === step ? 4 : 5) + [...pitchMatch[3]].reduce((total, mark) => total + (mark === "'" ? 1 : -1), 0)
      const id = `${step}${octave}`
      if (pitchMatch[1]) accidentals.set(id, pitchMatch[1] === '=' ? 0 : pitchMatch[1].startsWith('^') ? pitchMatch[1].length : -pitchMatch[1].length)
      if (tiedPitch && (tiedPitch.step !== step || tiedPitch.octave !== octave)) throw new Error('ABC 延音的前后音高不一致，请检查记谱')
      const alter = tiedPitch && !pitchMatch[1] ? tiedPitch.alter : accidentals.get(id) ?? signature[step] ?? 0
      const pitch = pitchSchema.safeParse({ step, octave, alter })
      if (!pitch.success) throw new Error('ABC 音高超出可解析范围')
      if (tiedPitch && midi(tiedPitch) !== midi(pitch.data)) throw new Error('ABC 延音的前后音高不一致，请检查记谱')
      tiedPitch = null; canTie = true
      pitches.push(pitch.data); position += pitchMatch[0].length; continue
    }
    const rest = /^(?:[zxZX]\d*(?:\/\d*)?|\(\d+(?::\d*){0,2}|\[\d+(?:,\d+)*)/.exec(remaining)
    if (rest) {
      if (/^[zxZX]/.test(rest[0])) { if (tiedPitch) throw new Error('ABC 延音后缺少对应音符'); canTie = false }
      position += rest[0].length; continue
    }
    const character = body[position]
    if (character === '-') {
      if (!canTie || !pitches.length) throw new Error('ABC 延音缺少前置音符')
      tiedPitch = pitches[pitches.length - 1]; canTie = false
    }
    if (character === '|') accidentals.clear()
    if (!/[\s|:\[\](){}\-~.<>\\]/.test(character)) throw new Error(`暂不支持 ABC 符号“${character}”，请转换为 MusicXML`)
    position++
  }
  if (tiedPitch) throw new Error('ABC 延音缺少后续音符')
  const result = blank('abc')
  result.title = text(lines.find(line => /^T:/.test(line.trim()))?.trim().slice(2))
  result.composer = text(lines.find(line => /^C:/.test(line.trim()))?.trim().slice(2))
  result.key = `${keyNames[keyPosition]}${minor ? '小调' : '大调'}`
  setMetrics(result, pitches)
  result.summary = pitches.length ? `从 ABC 实际读取 ${pitches.length} 个有音高的谱面音符，休止符不计入；反复段落不展开。` : '未识别到有音高的音符。'
  result.warnings.push('支持常用大小调、升降还原记号及八度；复杂多声部或宏请使用 MusicXML。和弦色彩不作推断。')
  return result
}
export function parseNotation(input: string): AnalysisResult {
  return input.trim().startsWith('<') ? xmlAnalysis(input.trim()) : abcAnalysis(input.trim())
}
export function normalizeImageAnalysis(value: unknown): AnalysisResult {
  const data = object(value)
  const result = blank('image-model')
  for (const key of ['title', 'composer', 'key', 'chordColor', 'summary'] as const) result[key] = text(data[key])
  const checked = z.array(pitchSchema).max(20000).safeParse(data.notes)
  if (checked.success && checked.data.length) {
    try { setMetrics(result, checked.data) }
    catch { result.noteCount = null; result.range = null; result.pitchHistogram = null; result.pitchSequence = null }
  }
  result.warnings.push('图片结果来自模型逐音识别，可能遗漏或误读，请结合原谱复核；无法识别的指标显示未识别，不采用模型估计总数。')
  return result
}
