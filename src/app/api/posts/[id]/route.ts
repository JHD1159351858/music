import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { readableCommunityPost } from '@/lib/community-server'

// PATCH /api/posts/:id  { marked_for_lesson?: boolean }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return apiRoute(async () => {
    const { id } = await params
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    teacher(user)
    await readableCommunityPost(supabase, id, user)
    if (typeof body.marked_for_lesson !== 'boolean') throw new ApiError('回课标记必须为布尔值')
    const result = body.marked_for_lesson
      ? await supabase.from('lesson_marks').upsert({ post_id: id, teacher_id: user.id }, { onConflict: 'post_id,teacher_id', ignoreDuplicates: true })
      : await supabase.from('lesson_marks').delete().eq('post_id', id).eq('teacher_id', user.id)
    dbCheck(result.error)
    return NextResponse.json({ id, marked_for_lesson: body.marked_for_lesson })
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return apiRoute(async () => {
    const { id } = await params
    const { user, supabase } = await actor(request)
    const post = await readableCommunityPost(supabase, id, user)
    if (user.role !== 'teacher' && post.user_id !== user.id) throw new ApiError('只能删除本人发布的帖子', 403)
    const { error } = await supabase.from('posts').delete().eq('id', id)
    dbCheck(error)
    return NextResponse.json({ success: true })
  })
}
