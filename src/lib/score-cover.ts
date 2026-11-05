export interface CoverScore {
  id?: string
  title?: string
  composer?: string
  cover_url?: string | null
}

export const SCORE_COVER_IMAGES = ['/covers/moonlight.png', '/covers/nocturne.png', '/covers/pastoral.png'] as const

export function getDefaultScoreCover(score: CoverScore): string {
  const title = score.title ?? ''
  if (/月光|moonlight/i.test(title)) return SCORE_COVER_IMAGES[0]
  if (/夜曲|nocturne/i.test(title)) return SCORE_COVER_IMAGES[1]
  if (/牧童|田园|pastoral/i.test(title)) return SCORE_COVER_IMAGES[2]
  const key = `${title}|${score.composer ?? ''}|${score.id ?? ''}`
  let hash = 0
  for (const character of key) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return SCORE_COVER_IMAGES[hash % SCORE_COVER_IMAGES.length]
}

export function getScoreCover(score: CoverScore): string {
  return score.cover_url || getDefaultScoreCover(score)
}
