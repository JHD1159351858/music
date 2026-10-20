import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AUTH_LOGIN_COOKIE, clearAuthCookies, requestOrigin, safeNextPath, setAuthCookie, signAuthToken, validRequestOrigin } from '@/lib/auth-session'
import { ssoConfig } from '@/lib/chaoxing-auth'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: '请求来源无效，请刷新页面重试' }, { status: 403 })
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('role' in body) || (body.role !== 'student' && body.role !== 'teacher')) return NextResponse.json({ error: '请选择学生或教师身份' }, { status: 400 })
    const { base } = ssoConfig()
    if (body.role === 'teacher' && !process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD) throw new Error('config')
    const next = safeNextPath('next' in body ? body.next : undefined, body.role === 'teacher' ? '/teacher' : '/practice')
    const state = randomBytes(32).toString('base64url')
    const callback = new URL('/api/auth/callback', requestOrigin(request))
    callback.searchParams.set('state', state)
    const url = new URL('/api/auth/chaoxing', base)
    url.searchParams.set('return_to', callback.toString())
    const token = await signAuthToken({ kind: 'login', state, role: body.role, next, expiresAt: Date.now() + 10 * 60_000 })
    const response = NextResponse.json({ url: url.toString() }, { headers: { 'Cache-Control': 'no-store' } })
    clearAuthCookies(response, request)
    setAuthCookie(response, request, AUTH_LOGIN_COOKIE, token)
    return response
  } catch (error: unknown) {
    const response = NextResponse.json({ error: error instanceof SyntaxError ? '请求格式无效' : '超星认证服务尚未配置完整，请联系管理员', code: 'config' }, { status: error instanceof SyntaxError ? 400 : 503, headers: { 'Cache-Control': 'no-store' } })
    clearAuthCookies(response, request)
    return response
  }
}
