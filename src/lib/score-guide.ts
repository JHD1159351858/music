import type { AnalysisResult } from './score-analysis'

export const guideLabels = {
  workBackground: '作品背景',
  composerBackground: '作曲家背景',
  creationYear: '创作年代',
  period: '所属时期',
  melody: '乐曲曲调',
} as const

export type GuideField = keyof typeof guideLabels
export type GuideSource = { title: string; url: string | null }
export type GuideEntry = { text: string; kind: 'course' | 'score' | 'public'; source: GuideSource }
export type ScoreGuide = {
  fields: Record<GuideField, GuideEntry | null>
  publicStatus: 'pending' | 'checked' | 'unavailable'
}

export function identity(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function baselineScoreGuide(
  result: AnalysisResult,
  sources?: Partial<Record<GuideField, GuideSource>>,
): ScoreGuide {
  const findSource = (name: string | null) => name
    ? result.sources?.find(source => identity(source.title) === identity(name))
    : undefined
  const courseEntry = (field: GuideField): GuideEntry | null => result[field]
    ? { text: result[field], kind: 'course', source: sources?.[field] ??
      findSource(field === 'composerBackground' ? result.composer : result.title) ??
      { title: '教师收录课程资料', url: null } }
    : null
  const music = result.music21
  const measures = music?.timeSignatures.slice(0, 6).join('、')
  const parts = music?.partCount ?? 0
  const facts = [
    result.range && `音域为 ${result.range}`,
    result.noteCount !== null && `识别到 ${result.noteCount} 个有音高的谱面音符`,
    measures && `谱中拍号为 ${measures}`,
    parts > 1 && `共 ${parts} 个声部，建议分声部查看音符走向`,
    music?.chords.length && `和声表中有 ${music.chords.length} 条算法分析候选，可结合谱面核对`,
  ].filter(Boolean).join('。')
  const melody: GuideEntry | null = facts ? {
    text: `${facts}。${result.provenance === 'image-model' ? '图片识别可能存在误读，请结合原谱复核。' : ''}`,
    kind: 'score',
    source: { title: music ? '当前乐谱的 music21 解析' : result.provenance === 'image-model' ? '当前乐谱的图片识别' : '当前乐谱的记谱解析', url: null },
  } : null
  return {
    fields: {
      workBackground: courseEntry('workBackground'),
      composerBackground: courseEntry('composerBackground'),
      creationYear: courseEntry('creationYear'),
      period: courseEntry('period'),
      melody: courseEntry('melody') ?? melody,
    },
    publicStatus: 'pending',
  }
}
