import { NextResponse } from 'next/server'
import { getAnalysisHistory } from '@/lib/analysis-history'
import { actor, apiRoute } from '@/lib/teaching-server'

export async function GET(request: Request) {
  const response = await apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
    return NextResponse.json(await getAnalysisHistory(supabase, user.id, page))
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
