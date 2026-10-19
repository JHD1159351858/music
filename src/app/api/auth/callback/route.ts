import { NextResponse } from 'next/server'
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, AUTH_TEACHER_COOKIE, clearAuthCookies, readAuthToken, requestCookie, requestOrigin, safeNextPath, setAuthCookie, signAuthToken } from '@/lib/auth-session'
import { AuthError, chaoxingUserId, saveAuthProfile, saveVerifiedIdentity, verifyChaoxingTicket } from '@/lib/chaoxing-auth'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const origin = requestOrigin(request)
  let next = '/practice'
  try {
    const url = new URL(request.url)
    const context = await readAuthToken(requestCookie(request, AUTH_LOGIN_COOKIE), 'login')
    if (!context || url.searchParams.get('state') !== context.state) throw new AuthError('expired')
    next = safeNextPath(context.next)
    const ticket = url.searchParams.get('ticket')
    if (!ticket || ticket.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(ticket)) throw new AuthError('verification')
    const identity = await verifyChaoxingTicket(ticket)
    const role = context.role
    const userId = chaoxingUserId(identity)
    await saveVerifiedIdentity(identity)
    if (role === 'teacher') {
      if (!process.env.ZHIYIN_TEACHER_SECURITY_PASSWORD) throw new AuthError('config', 503)
      const redirect = new URL('/', origin)
      redirect.searchParams.set('login', 'teacher')
      redirect.searchParams.set('next', next)
      const response = NextResponse.redirect(redirect, 303)
      clearAuthCookies(response, request)
      setAuthCookie(response, request, AUTH_TEACHER_COOKIE, await signAuthToken({ kind: 'teacher', userId, role, next, expiresAt: Date.now() + 5 * 60_000 }))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    await saveAuthProfile(userId, role)
    const response = NextResponse.redirect(new URL(next, origin), 303)
    clearAuthCookies(response, request)
    setAuthCookie(response, request, AUTH_SESSION_COOKIE, await signAuthToken({ kind: 'session', userId, role, expiresAt: Date.now() + 8 * 60 * 60_000 }))
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error: unknown) {
    const redirect = new URL('/', origin)
    redirect.searchParams.set('auth_error', error instanceof AuthError ? error.reason : 'unavailable')
    redirect.searchParams.set('next', next)
    const response = NextResponse.redirect(redirect, 303)
    clearAuthCookies(response, request)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
