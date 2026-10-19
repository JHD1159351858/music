import { NextResponse } from 'next/server'
import { AUTH_TEACHER_COOKIE, readAuthSession, readAuthToken, requestCookie, clearAuthCookie, AUTH_SESSION_COOKIE, studentTestMode } from '@/lib/auth-session'
import { readSessionUser } from '@/lib/chaoxing-auth'
import type { SessionUser } from '@/lib/auth-profile-types'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  try {
    const session = await readAuthSession(request)
    const pending = studentTestMode() ? null : await readAuthToken(requestCookie(request, AUTH_TEACHER_COOKIE), 'teacher')
    let user: SessionUser | null = null
    if (session) {
      user = await readSessionUser(session.userId, session.role)
    }
    const response = NextResponse.json({ user, teacherPending: Boolean(pending) }, { headers: { 'Cache-Control': 'private, no-store' } })
    if (!user) clearAuthCookie(response, request, AUTH_SESSION_COOKIE)
    return response
  } catch { return NextResponse.json({ error: '登录服务暂不可用' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
