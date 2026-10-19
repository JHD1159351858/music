import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actor, apiRoute, dbCheck, readJson, validateScoreReference } from '@/lib/teaching-server'
import type { TeachingScore } from '@/lib/teaching-types'
import { canReadScore } from '@/lib/teaching-validation'
import { refreshScoreFiles } from '@/lib/teaching-files'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { data, error } = await supabase.from('practice_list').select('score:scores(*,genre:score_genres(id,name,teacher_id))').eq('user_id', user.id).order('created_at', { ascending: false })
    dbCheck(error)
    const scores = (data ?? []).map(row => row.score as unknown as TeachingScore | null).filter((score): score is TeachingScore => !!score && canReadScore(user, score))
    return NextResponse.json(await refreshScoreFiles(scores))
  })
}
const listSchema = z.object({ user_id: z.string().min(1), score_id: z.string().min(1) })
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = listSchema.parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    await validateScoreReference(supabase, body.score_id, user)
    const { error } = await supabase.from('practice_list').upsert({ user_id: user.id, score_id: body.score_id }, { onConflict: 'user_id,score_id', ignoreDuplicates: true })
    dbCheck(error)
    return NextResponse.json({ success: true })
  })
}
export async function DELETE(request: Request) {
  return apiRoute(async () => {
    const params = new URL(request.url).searchParams
    const body = listSchema.parse(request.headers.get('content-type')?.includes('application/json') ? await readJson(request) : { user_id: params.get('user_id'), score_id: params.get('score_id') })
    const { user, supabase } = await actor(request, body)
    const { error } = await supabase.from('practice_list').delete().eq('user_id', user.id).eq('score_id', body.score_id)
    dbCheck(error)
    return NextResponse.json({ success: true })
  })
}
