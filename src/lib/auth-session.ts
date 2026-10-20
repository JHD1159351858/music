import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { NextResponse } from 'next/server'
import { useLocalData as localDataEnabled } from './storage-mode'

export const AUTH_SESSION_COOKIE = 'zhiyin_session'
export const AUTH_LOGIN_COOKIE = 'zhiyin_login'
export const AUTH_TEACHER_COOKIE = 'zhiyin_teacher'
export type AuthRole = 'student' | 'teacher'
export interface AuthSession { userId: string; role: AuthRole; expiresAt: number }
export type AuthToken = (AuthSession & { kind: 'session' }) | { kind: 'login'; state: string; role: AuthRole; next: string; expiresAt: number } | { kind: 'teacher'; userId: string; role: 'teacher'; next: string; expiresAt: number }

export function authSecret(): string {
  const configured = process.env.ZHIYIN_SESSION_SECRET
  if (configured) {
    if (configured.length < 32) throw new Error('Authentication configuration is incomplete')
    return configured
  }
  const directory = path.resolve(process.env.ZHIYIN_DATA_DIR || path.join(process.cwd(), 'data'))
  mkdirSync(directory, { recursive: true })
  const file = path.join(directory, '.auth-secret')
  try { writeFileSync(file, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }) }
  catch (error: unknown) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
  const value = readFileSync(file, 'utf8').trim()
  if (value.length < 32) throw new Error('Authentication configuration is incomplete')
  return value
}

export async function signAuthToken(payload: AuthToken): Promise<string> {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${createHmac('sha256', authSecret()).update(encoded).digest('base64url')}`
}
export async function readAuthToken<K extends AuthToken['kind']>(token: string | undefined, kind: K): Promise<Extract<AuthToken, { kind: K }> | null> {
  if (!token || token.length > 4096) return null
  const pieces = token.split('.')
  if (pieces.length !== 2 || pieces.some(piece => !/^[A-Za-z0-9_-]+$/.test(piece))) return null
  const signature = createHmac('sha256', authSecret()).update(pieces[0]).digest('base64url')
  if (pieces[1].length !== signature.length || !timingSafeEqual(Buffer.from(pieces[1]), Buffer.from(signature))) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== kind || !('expiresAt' in value) || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || !('role' in value) || (value.role !== 'student' && value.role !== 'teacher')) return null
    if (kind === 'login') {
      if (!('state' in value) || typeof value.state !== 'string' || !/^[a-zA-Z0-9_-]{32,}$/.test(value.state) || !('next' in value) || typeof value.next !== 'string') return null
    } else if (!('userId' in value) || typeof value.userId !== 'string' || !value.userId || (kind === 'teacher' && (value.role !== 'teacher' || !('next' in value) || typeof value.next !== 'string'))) return null
    return value as Extract<AuthToken, { kind: K }>
  } catch { return null }
}
export function requestCookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.get('cookie') || '').split(';').map(cookie => cookie.trim()).filter(cookie => cookie.startsWith(`${name}=`))
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined
}
export function studentTestMode(): boolean {
  return process.env.ZHIYIN_STUDENT_TEST_MODE === 'true' && localDataEnabled()
}
export async function readAuthSession(request: Request): Promise<AuthSession | null> {
  if (studentTestMode()) return { userId: 's0000000-0000-0000-0000-000000000001', role: 'student', expiresAt: Date.now() + 8 * 60 * 60_000 }
  const session = await readAuthToken(requestCookie(request, AUTH_SESSION_COOKIE), 'session')
  return session ? { userId: session.userId, role: session.role, expiresAt: session.expiresAt } : null
}
export function safeNextPath(value: unknown, fallback = '/practice'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback
  let decoded: string
  try { decoded = decodeURIComponent(value) } catch { return fallback }
  if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith('//') || /^\/api(?:\/|\?|#|$)/i.test(decoded)) return fallback
  const normalized = new URL(decoded, 'http://zhiyin.invalid')
  if (normalized.origin !== 'http://zhiyin.invalid' || /^\/api(?:\/|$)/i.test(normalized.pathname)) return fallback
  return value
}
export function requestOrigin(request: Request): string {
  const configured = process.env.ZHIYIN_PUBLIC_ORIGIN
  if (configured === undefined) return new URL(request.url).origin
  const invalid = () => new Error('ZHIYIN_PUBLIC_ORIGIN must be a valid HTTP(S) origin without credentials, path, query, or fragment')
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(configured)) throw invalid()
  let url: URL
  try { url = new URL(configured) } catch { throw invalid() }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw invalid()
  return url.origin
}
export function validRequestOrigin(request: Request): boolean {
  const expected = requestOrigin(request)
  const origin = request.headers.get('origin')
  return origin !== null && origin === expected
}
export function setAuthCookie(response: NextResponse, request: Request, name: string, value: string): void {
  response.cookies.set(name, value, { httpOnly: true, sameSite: 'lax', secure: new URL(requestOrigin(request)).protocol === 'https:', path: '/' })
}
export function clearAuthCookie(response: NextResponse, request: Request, name: string): void {
  response.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', secure: new URL(requestOrigin(request)).protocol === 'https:', path: '/', maxAge: 0 })
}
export function clearAuthCookies(response: NextResponse, request: Request): void {
  for (const name of [AUTH_SESSION_COOKIE, AUTH_LOGIN_COOKIE, AUTH_TEACHER_COOKIE]) clearAuthCookie(response, request, name)
}
