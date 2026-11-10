export const SCORE_TYPES = ['练习曲', '复调', '奏鸣曲', '乐曲', '歌曲', '中小学音乐教材'] as const
export const SCORE_PERIODS = ['18世纪', '19世纪', '20世纪'] as const
export const SCORE_STYLES = ['文艺复兴', '巴洛克', '古典', '浪漫', '20世纪', '中国'] as const

export type ScoreType = typeof SCORE_TYPES[number]
export type ScorePeriod = typeof SCORE_PERIODS[number]
export type ScoreStyle = typeof SCORE_STYLES[number]

export function scoreClassificationValue<Value extends string>(options: readonly Value[], value: string | null | undefined): Value | null {
  return options.find(option => option === value) ?? null
}
