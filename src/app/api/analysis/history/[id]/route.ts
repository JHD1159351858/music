import { NextResponse } from 'next/server'
import { getAnalysisHistoryResult } from '@/lib/analysis-history'
import { actor, apiRoute } from '@/lib/teaching-server'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { id } = await context.params
    return NextResponse.json(await getAnalysisHistoryResult(supabase, user.id, id))
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
