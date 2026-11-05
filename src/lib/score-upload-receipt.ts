import { createHmac, timingSafeEqual } from 'node:crypto'
import { authSecret } from './auth-session'

const DOMAIN = 'zhiyin:score-upload-receipt:v1:'
const LIFETIME_MS = 7 * 24 * 60 * 60_000

interface ReceiptFile {
  fileId: string
  ownerId: string
  fileType: string
  purpose?: 'map-avatar' | 'score-cover'
}

interface ReceiptTarget {
  fileId: string
  ownerId: string
  purpose?: 'map-avatar' | 'score-cover'
}

interface ReceiptPayload {
  v: 1
  f: string
  o: string
  t: string
  e: number
  p?: 'map-avatar' | 'score-cover'
}

function signature(encoded: string): string {
  return createHmac('sha256', authSecret()).update(`${DOMAIN}${encoded}`).digest('base64url')
}

export function createScoreUploadReceipt(file: ReceiptFile, now = Date.now()): string {
  const payload: ReceiptPayload = { v: 1, f: file.fileId, o: file.ownerId, t: file.fileType, e: now + LIFETIME_MS, ...(file.purpose ? { p: file.purpose } : {}) }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyScoreUploadReceipt(receipt: string | null | undefined, target: ReceiptTarget, now = Date.now()): string | null {
  if (!receipt || receipt.length > 10_000) return null
  const pieces = receipt.split('.')
  if (pieces.length !== 2 || pieces.some(piece => !/^[A-Za-z0-9_-]+$/.test(piece))) return null
  const expected = signature(pieces[0])
  if (pieces[1].length !== expected.length || !timingSafeEqual(Buffer.from(pieces[1]), Buffer.from(expected))) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object') return null
    const payload = value as Partial<ReceiptPayload>
    if (payload.v !== 1 || payload.f !== target.fileId || payload.o !== target.ownerId || typeof payload.t !== 'string' || !payload.t || typeof payload.e !== 'number' || !Number.isFinite(payload.e) || payload.e <= now) return null
    if (target.purpose && payload.p !== target.purpose) return null
    return payload.t
  } catch { return null }
}
