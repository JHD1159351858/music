import { createHash, timingSafeEqual } from 'node:crypto'
import { createSupabaseServer } from './supabase-server'
import type { AuthRole } from './auth-session'
import type { AuthProfile, SessionUser } from './auth-profile-types'

export interface ChaoxingIdentity { uid: string; fid: string; roles: { roleId: string; roleName: string }[]; name?: string | null; displayName?: string | null; orgName?: string | null }
export class AuthError extends Error {
  constructor(public reason: 'config' | 'expired' | 'verification' | 'role' | 'unavailable', public status = 400) { super(reason) }
}
export function ssoConfig(): { base: URL; secret: string } {
  const baseValue = process.env.CHAOXING_SSO_BASE_URL
  const secret = process.env.CHAOXING_SSO_SHARED_SECRET
  if (!baseValue || !secret) throw new AuthError('config', 503)
  let base: URL
  try { base = new URL(baseValue) } catch { throw new AuthError('config', 503) }
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new AuthError('config', 503)
  return { base, secret }
}
export async function verifyChaoxingTicket(ticket: string): Promise<ChaoxingIdentity> {
  const { base, secret } = ssoConfig()
  let response: Response
  try {
    response = await fetch(new URL('/api/sso/verify', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, secret }), redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  } catch { throw new AuthError('unavailable', 503) }
  if (!response.ok) throw new AuthError(response.status === 410 ? 'expired' : response.status === 401 ? 'config' : response.status >= 500 ? 'unavailable' : 'verification', response.status >= 500 ? 503 : 400)
  let value: unknown
  try { value = await response.json() } catch { throw new AuthError('verification') }
  if (!value || typeof value !== 'object' || !('uid' in value) || !('fid' in value) || !('roles' in value) || !Array.isArray(value.roles)) throw new AuthError('verification')
  const uid = identityId(value.uid)
  const fid = identityId(value.fid)
  if (!uid || !fid || value.roles.length > 100) throw new AuthError('verification')
  const roles: ChaoxingIdentity['roles'] = []
  for (const item of value.roles) {
    if (!item || typeof item !== 'object' || !('roleId' in item) || !('roleName' in item) || typeof item.roleName !== 'string') throw new AuthError('verification')
    const roleId = identityId(item.roleId)
    if (!roleId) throw new AuthError('verification')
    roles.push({ roleId, roleName: item.roleName })
  }
  return { uid, fid, roles, name: identityText('name' in value ? value.name : null, 100), displayName: identityText('displayName' in value ? value.displayName : null, 100), orgName: identityText('orgName' in value ? value.orgName : null, 200) }
}
function identityText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(text) ? text : null
}
function identityId(value: unknown): string | null {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value))) return null
  const id = String(value).trim()
  return id && id.length <= 256 && !/[\u0000-\u001f\u007f]/.test(id) ? id : null
}
export function chaoxingUserId(identity: Pick<ChaoxingIdentity, 'fid' | 'uid'>): string {
  const hash = createHash('sha256').update(JSON.stringify(['chaoxing', identity.fid, identity.uid])).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
export async function saveVerifiedIdentity(identity: ChaoxingIdentity): Promise<void> {
  // The broker may fall back from displayName to the account number or uid.
  const name = identityText(identity.displayName, 100)
  const accountNumber = identityText(identity.name, 100)
  const details: AuthProfile = {
    real_name: name && name !== accountNumber && name !== identity.uid ? name : null,
    account_number: accountNumber,
    school_name: identityText(identity.orgName, 200),
    provider_uid: identity.uid,
    provider_fid: identity.fid,
    roles: identity.roles,
    verified_at: new Date().toISOString(),
  }
  const { error } = await createSupabaseServer().from('auth_identities').upsert({ id: chaoxingUserId(identity), details }, { onConflict: 'id' })
  if (error) throw new AuthError('unavailable', 503)
}

export async function readSessionUser(id: string, role: AuthRole): Promise<SessionUser | null> {
  const database = createSupabaseServer()
  const current = await database.from('profiles').select('id,nickname,role,class_name').eq('id', id).maybeSingle()
  if (current.error) throw new AuthError('unavailable', 503)
  if (!current.data || current.data.role !== role) return null
  const identity = await database.from('auth_identities').select('details').eq('id', id).maybeSingle()
  if (identity.error) throw new AuthError('unavailable', 503)
  const saved = identity.data?.details as AuthProfile | undefined
  const details: AuthProfile | null = saved ? {
    real_name: saved.real_name, account_number: saved.account_number, school_name: saved.school_name,
    provider_uid: saved.provider_uid, provider_fid: saved.provider_fid,
    roles: saved.roles.map(item => ({ roleId: item.roleId, roleName: item.roleName })), verified_at: saved.verified_at,
  } : null
  return { id, nickname: current.data.nickname, role, class_name: current.data.class_name ?? null, display_name: details?.real_name || current.data.nickname, auth_profile: details }
}

export async function saveAuthProfile(id: string, role: AuthRole): Promise<SessionUser> {
  const database = createSupabaseServer()
  const current = await database.from('profiles').select('id,nickname,role').eq('id', id).maybeSingle()
  if (current.error) throw new AuthError('unavailable', 503)
  const nickname = typeof current.data?.nickname === 'string' ? current.data.nickname : `${role === 'teacher' ? '教师' : '学生'}${id.replaceAll('-', '').slice(0, 8)}`
  const saved = await database.from('profiles').upsert({ id, nickname, role }, { onConflict: 'id' })
  if (saved.error) throw new AuthError('unavailable', 503)
  const user = await readSessionUser(id, role)
  if (!user) throw new AuthError('unavailable', 503)
  return user
}
export function verifyTeacherPassword(password: string): boolean {
  const expected = process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD
  if (!expected || !password) return false
  const supplied = createHash('sha256').update(password).digest()
  const correct = createHash('sha256').update(expected).digest()
  return timingSafeEqual(supplied, correct)
}
const attempts = new Map<string, { failures: number; expiresAt: number }>()
export function teacherPasswordAllowed(userId: string, password: string): boolean {
  const now = Date.now()
  for (const [id, entry] of attempts) if (entry.expiresAt <= now) attempts.delete(id)
  const entry = attempts.get(userId) || { failures: 0, expiresAt: now + 10 * 60_000 }
  if (entry.failures >= 5) return false
  if (verifyTeacherPassword(password)) { attempts.delete(userId); return true }
  entry.failures++
  attempts.set(userId, entry)
  return false
}
