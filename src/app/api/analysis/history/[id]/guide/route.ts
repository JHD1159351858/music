import { NextResponse } from 'next/server'
import { getAnalysisHistoryResult, saveHistoryGuide } from '@/lib/analysis-history'
import { completeScoreGuide } from '@/lib/score-guide-server'
import type { ScoreGuide } from '@/lib/score-guide'
import { actor, apiRoute } from '@/lib/teaching-server'

const inFlight = new Map<string, Promise<ScoreGuide>>()

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { id } = await context.params
    const result = await getAnalysisHistoryResult(supabase, user.id, id)
    if (result.scoreGuide?.publicStatus === 'checked') return NextResponse.json({ scoreGuide: result.scoreGuide })

    const key = `${user.id}:${id}`
    let pending = inFlight.get(key)
    if (!pending) {
      pending = completeScoreGuide(result).then(async scoreGuide => {
        await saveHistoryGuide(supabase, user.id, result, scoreGuide)
        return scoreGuide
      }).finally(() => inFlight.delete(key))
      inFlight.set(key, pending)
    }
    return NextResponse.json({ scoreGuide: await pending })
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
