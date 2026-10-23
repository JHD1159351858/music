export const SCORE_TYPES = ['协奏曲', '圆舞曲', '夜曲', '弹奏曲', '练习曲', '奏鸣曲', '前奏曲', '赋格', '变奏曲', '其他'] as const
export type ScoreType = typeof SCORE_TYPES[number]
export const SCORE_PERIOD_MAX_LENGTH = 100
