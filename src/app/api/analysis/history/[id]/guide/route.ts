import { NextResponse } from 'next/server'
import { getAnalysisHistoryResult } from '@/lib/analysis-history'
import { completeHistoryScoreGuide } from '@/lib/score-guide-server'
import { actor, apiRoute } from '@/lib/teaching-server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { id } = await context.params
    const result = await getAnalysisHistoryResult(supabase, user.id, id)
    return NextResponse.json({ scoreGuide: await completeHistoryScoreGuide(supabase, user.id, result) })
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
