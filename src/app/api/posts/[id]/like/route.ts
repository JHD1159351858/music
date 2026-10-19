import { NextResponse } from 'next/server'
import { actor, apiRoute, dbCheck, readJson } from '@/lib/teaching-server'
import { readableCommunityPost } from '@/lib/community-server'

// POST /api/posts/:id/like  { user_id } — 点赞/取消点赞（幂等）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return apiRoute(async () => {
    const { id } = await params
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    const post = await readableCommunityPost(supabase, id, user)

    const { data: existing, error: e1 } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    dbCheck(e1)

    let liked: boolean
    let next: number
    if (existing) {
      const { error } = await supabase.from('post_likes').delete().eq('id', existing.id)
      dbCheck(error)
      liked = false
      next = Math.max(0, post.like_count - 1)
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: id, user_id: user.id })
      dbCheck(error)
      liked = true
      next = post.like_count + 1
    }
    const { error: e3 } = await supabase.from('posts').update({ like_count: next }).eq('id', id)
    dbCheck(e3)

    return NextResponse.json({ liked, like_count: next })
  })
}
