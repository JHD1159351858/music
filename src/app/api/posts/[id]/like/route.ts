import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// POST /api/posts/:id/like  { user_id } — 点赞/取消点赞（幂等）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createSupabaseServer()
  const { user_id } = await request.json()
  if (!user_id) return NextResponse.json({ error: '缺少 user_id' }, { status: 400 })

  const { data: existing, error: e1 } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', id)
    .eq('user_id', user_id)
    .maybeSingle()
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // 取当前计数
  const { data: post, error: e2 } = await supabase
    .from('posts')
    .select('like_count')
    .eq('id', id)
    .maybeSingle()
  if (e2 || !post) return NextResponse.json({ error: e2?.message ?? '帖子不存在' }, { status: 404 })

  let liked: boolean
  let next: number
  if (existing) {
    const { error } = await supabase.from('post_likes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = false
    next = Math.max(0, post.like_count - 1)
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: id, user_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    liked = true
    next = post.like_count + 1
  }
  const { error: e3 } = await supabase.from('posts').update({ like_count: next }).eq('id', id)
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

  return NextResponse.json({ liked, like_count: next })
}
