import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// GET /api/practice?user_id=
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  let query = supabase
    .from('practice_records')
    .select('*, profiles(nickname)')
  if (userId) query = query.eq('user_id', userId)

  const { data, error } = await query.order('started_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/practice  { user_id, score_id?, piece_title, source, started_at, duration_seconds, pause_count?, audio_url? }
export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const body = await request.json()
  if (!body?.user_id || !body?.piece_title || !body?.started_at || body?.duration_seconds == null) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('practice_records')
    .insert({
      user_id: body.user_id,
      score_id: body.score_id ?? null,
      piece_title: body.piece_title,
      source: body.source ?? 'teacher',
      practice_date: new Date(body.started_at).toISOString().slice(0, 10),
      started_at: body.started_at,
      duration_seconds: Math.round(body.duration_seconds),
      pause_count: body.pause_count ?? 0,
      audio_url: body.audio_url ?? null,
    })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
