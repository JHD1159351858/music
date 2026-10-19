import { NextResponse } from 'next/server'
import { AUTH_SESSION_COOKIE, AUTH_TEACHER_COOKIE, clearAuthCookies, readAuthToken, requestCookie, safeNextPath, setAuthCookie, signAuthToken, validRequestOrigin } from '@/lib/auth-session'
import { saveAuthProfile, teacherPasswordAllowed } from '@/lib/chaoxing-auth'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: '请求来源无效，请刷新页面重试' }, { status: 403 })
  try {
    const pending = await readAuthToken(requestCookie(request, AUTH_TEACHER_COOKIE), 'teacher')
    if (!pending) return NextResponse.json({ error: '教师认证已过期，请重新通过超星登录' }, { status: 401 })
    if (!process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD) return NextResponse.json({ error: '教师安全密码尚未配置，请联系管理员' }, { status: 503 })
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string' || body.password.length > 1024) return NextResponse.json({ error: '请输入教师安全密码' }, { status: 400 })
    if (!teacherPasswordAllowed(pending.userId, body.password)) return NextResponse.json({ error: '安全密码不正确或尝试次数过多，请稍后重试' }, { status: 403 })
    const user = await saveAuthProfile(pending.userId, 'teacher')
    const response = NextResponse.json({ user, redirectTo: safeNextPath(pending.next, '/teacher') }, { headers: { 'Cache-Control': 'no-store' } })
    clearAuthCookies(response, request)
    setAuthCookie(response, request, AUTH_SESSION_COOKIE, await signAuthToken({ kind: 'session', userId: pending.userId, role: 'teacher', expiresAt: Date.now() + 8 * 60 * 60_000 }))
    return response
  } catch (error: unknown) { return NextResponse.json({ error: error instanceof SyntaxError ? '请求格式无效' : '登录服务暂不可用，请稍后重试' }, { status: error instanceof SyntaxError ? 400 : 503 }) }
}
