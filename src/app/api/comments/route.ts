import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// GET /api/comments?post_id=
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('post_id')
  if (!postId) return NextResponse.json({ error: '缺少 post_id' }, { status: 400 })
  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles(nickname, role)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/comments { post_id, user_id, content }
export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const body = await request.json()
  if (!body?.post_id || !body?.user_id || !body?.content) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: body.post_id, user_id: body.user_id, content: body.content })
    .select('*, profiles(nickname, role)')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
