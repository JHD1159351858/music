import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// GET /api/scores?source=teacher&owner=<id>&q=&difficulty=
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')
  const owner = searchParams.get('owner')
  const q = searchParams.get('q')
  const difficulty = searchParams.get('difficulty')

  let query = supabase.from('scores').select('*')
  if (source) query = query.eq('source', source)
  if (owner) query = query.eq('owner_id', owner)
  if (q) query = query.ilike('title', `%${q}%`)
  if (difficulty) query = query.eq('difficulty', difficulty)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/scores  { title, composer, difficulty, tips?, image_url?, source, owner_id }
export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const body = await request.json()
  if (!body?.title || !body?.composer || !body?.difficulty || !body?.source) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('scores')
    .insert({
      title: body.title,
      composer: body.composer,
      difficulty: body.difficulty,
      tips: body.tips ?? null,
      image_url: body.image_url ?? null,
      source: body.source,
      owner_id: body.owner_id ?? null,
    })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
