import { NextResponse } from 'next/server'
import { clearAuthCookies, validRequestOrigin } from '@/lib/auth-session'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  if (!validRequestOrigin(request)) return NextResponse.json({ error: '请求来源无效，请刷新页面重试' }, { status: 403 })
  const response = NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  clearAuthCookies(response, request)
  return response
}
