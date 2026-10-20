import { NextRequest, NextResponse } from 'next/server'
import { readAuthSession, requestOrigin, validRequestOrigin } from '@/lib/auth-session'

export async function proxy(request: NextRequest) {
  const origin = requestOrigin(request)
  const pathname = request.nextUrl.pathname
  if (pathname === '/analysis' || pathname.startsWith('/analysis/')) return NextResponse.redirect(new URL('/practice', origin))
  if (pathname.startsWith('/api/auth/')) return NextResponse.next()
  const api = pathname.startsWith('/api/')
  const session = await readAuthSession(request).catch(() => null)
  if (!session) {
    if (api) return NextResponse.json({ error: '请先登录' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    const redirect = new URL('/', origin)
    redirect.searchParams.set('login', '1')
    if (pathname === '/teacher' || pathname.startsWith('/teacher/')) redirect.searchParams.set('role', 'teacher')
    redirect.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(redirect)
  }
  if ((pathname === '/teacher' || pathname.startsWith('/teacher/') || pathname.startsWith('/api/teacher/')) && session.role !== 'teacher') {
    if (api) return NextResponse.json({ error: '仅教师可访问' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.redirect(new URL('/practice', origin))
  }
  if (api && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !validRequestOrigin(request)) return NextResponse.json({ error: '请求来源无效' }, { status: 403 })
  if (!api && session.role === 'teacher') {
    const target = pathname === '/practice' ? (request.nextUrl.searchParams.get('tab') === 'history' ? '/teacher/records' : '/teacher/scores')
      : pathname === '/tasks' || pathname.startsWith('/tasks/') ? `/teacher${pathname}`
      : pathname === '/knowledge' ? '/teacher/knowledge'
      : pathname === '/community' ? '/teacher/community'
      : pathname === '/stats' ? '/teacher' : null
    if (target) { const redirect = new URL(target, origin); redirect.search = request.nextUrl.search; return NextResponse.redirect(redirect) }
  }
  return NextResponse.next()
}
export const config = { matcher: ['/teacher/:path*', '/practice/:path*', '/tasks/:path*', '/analysis/:path*', '/community/:path*', '/map/:path*', '/stats/:path*', '/knowledge/:path*', '/api/:path*'] }
