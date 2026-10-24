import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { authSecret } from './auth-session'
import { music21ResultSchema, type Music21Analysis } from './music21-analysis'

const DOMAIN = 'zhiyin:score-analysis:v1:'
const LIFETIME = 2 * 60 * 60_000
const digest = (analysis: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(analysis)).digest('hex')
const signature = (encoded: string) => createHmac('sha256', authSecret()).update(`${DOMAIN}${encoded}`).digest('base64url')

export function createScoreAnalysisReceipt(analysis: Record<string, unknown>, ownerId: string, now = Date.now()): string {
  const encoded = Buffer.from(JSON.stringify({ hash: digest(analysis), ownerId, expiresAt: now + LIFETIME })).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyScoreAnalysisReceipt(analysis: Record<string, unknown>, ownerId: string, now = Date.now()): Music21Analysis | null {
  const { analysisReceipt, ...result } = analysis
  if (typeof analysisReceipt !== 'string' || analysisReceipt.length > 1500) return null
  const parts = analysisReceipt.split('.')
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null
  const expected = signature(parts[0])
  if (expected.length !== parts[1].length || !timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return null
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object' || !('ownerId' in payload) || payload.ownerId !== ownerId || !('expiresAt' in payload) || typeof payload.expiresAt !== 'number' || payload.expiresAt <= now || !('hash' in payload) || payload.hash !== digest(result)) return null
    const parsed = music21ResultSchema.safeParse(result)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
