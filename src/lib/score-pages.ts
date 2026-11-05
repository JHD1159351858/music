import type { ScorePage } from './teaching-types'

export interface ScoreFiles {
  image_url?: string | null
  file_id?: string | null
  file_name?: string | null
  file_type?: string | null
  pages?: ScorePage[]
  cover_file_id?: string | null
  cover_url?: string | null
}

export function getScorePages(score: ScoreFiles): ScorePage[] {
  if (score.pages?.length) return score.pages
  if (!score.file_id && !score.image_url) return []
  return [{ image_url: score.image_url ?? null, file_id: score.file_id ?? null, file_name: score.file_name ?? null, file_type: score.file_type ?? null }]
}

export function scorePageFileIds(score: ScoreFiles): string[] {
  return [...new Set([score.file_id, ...getScorePages(score).map(page => page.file_id)].filter((id): id is string => !!id))]
}

export function scoreFileIds(score: ScoreFiles): string[] {
  return [...new Set([...scorePageFileIds(score), ...(score.cover_file_id ? [score.cover_file_id] : [])])]
}
