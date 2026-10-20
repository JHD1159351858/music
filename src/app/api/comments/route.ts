import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson } from '@/lib/teaching-server'
import { readableCommunityPost } from '@/lib/community-server'

// GET /api/comments?post_id=
export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('post_id')
    if (!postId) throw new ApiError('缺少 post_id')
    await readableCommunityPost(supabase, postId, user)
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles(nickname, role)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    dbCheck(error)
    return NextResponse.json(data)
  })
}

// POST /api/comments { post_id, user_id, content }
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    if (typeof body.post_id !== 'string' || !body.post_id.trim() || typeof body.content !== 'string' || !body.content.trim()) {
      throw new ApiError('缺少必填字段')
    }
    if (body.content.trim().length > 10000) throw new ApiError('评论最多 10000 字')
    await readableCommunityPost(supabase, body.post_id, user)
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: body.post_id, user_id: user.id, content: body.content.trim() })
      .select('*, profiles(nickname, role)')
      .maybeSingle()
    dbCheck(error)
    return NextResponse.json(data)
  })
}
