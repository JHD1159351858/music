import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson } from '@/lib/teaching-server'
import { canReadCommunityPost, COMMUNITY_CATEGORIES, type CommunityPostAccess } from '@/lib/community-server'

// Public posts, private conversations, and the current teacher's lesson list.
export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const view = searchParams.get('view') ?? 'public'
    if (!['public', 'messages', 'focus'].includes(view)) throw new ApiError('无效的帖子视图')
    if (view === 'focus' && user.role !== 'teacher') throw new ApiError('仅教师可查看回课清单', 403)
    const marks = user.role === 'teacher' ? await supabase.from('lesson_marks').select('post_id').eq('teacher_id', user.id) : { data: [], error: null }
    dbCheck(marks.error)
    const markedIds = new Set((marks.data ?? []).map(mark => mark.post_id as string))

    let query = supabase
      .from('posts')
      .select(view === 'focus' ? '*,comments(id,content,created_at,profiles(nickname,role)),post_likes(user_id)' : '*,comments(id),post_likes(user_id)')
    if (view === 'public') query = query.is('recipient_teacher_id', null)
    if (view === 'messages') query = query.eq(user.role === 'teacher' ? 'recipient_teacher_id' : 'user_id', user.id)
    if (view === 'focus' || searchParams.get('marked') === 'true') {
      if (!markedIds.size) return NextResponse.json([])
      query = query.in('id', [...markedIds])
    }
    if (category && category !== 'all') query = query.eq('category', category)
    if (searchParams.get('ask_teacher') === 'true') query = query.eq('ask_teacher', true)
    if (searchParams.get('sort') === 'popular') query = query.order('like_count', { ascending: false })
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    if (view === 'public' && searchParams.get('marked') !== 'true' && searchParams.get('ask_teacher') !== 'true') {
      const requestedPage = Number(searchParams.get('page'))
      const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0
      query = query.range(page * 100, page * 100 + 99)
    }

    const { data, error } = await query
    dbCheck(error)
    // Check privacy again before enriching records, including teacher focus lists.
    const visible = (data ?? []).filter(post => canReadCommunityPost(post as CommunityPostAccess, user) && (view !== 'messages' || !!post.recipient_teacher_id))
    const profileIds = [...new Set(visible.flatMap(post => [post.user_id as string, ...(post.recipient_teacher_id ? [post.recipient_teacher_id as string] : [])]))]
    const profiles = profileIds.length ? await supabase.from('profiles').select('id,nickname').in('id', profileIds) : { data: [], error: null }
    dbCheck(profiles.error)
    const names = new Map((profiles.data ?? []).map(profile => [profile.id as string, profile.nickname as string]))
    return NextResponse.json(visible.map(post => ({ ...post, marked_for_lesson: markedIds.has(post.id as string), profiles: { nickname: names.get(post.user_id as string) ?? '未命名用户' }, recipient_nickname: post.recipient_teacher_id ? names.get(post.recipient_teacher_id as string) : null })))
  })
}

// POST /api/posts { user_id, title, content, category, ask_teacher }
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    if (typeof body.title !== 'string' || !body.title.trim() || typeof body.content !== 'string' || !body.content.trim() || typeof body.category !== 'string' || !body.category.trim()) {
      throw new ApiError('缺少必填字段')
    }
    if (!COMMUNITY_CATEGORIES.some(category => category === body.category)) throw new ApiError('请选择有效的帖子分类')
    if (body.title.trim().length > 200 || body.content.trim().length > 10000) throw new ApiError('标题最多 200 字，正文最多 10000 字')
    const recipient = body.recipient_teacher_id
    if (recipient !== undefined && recipient !== null && (typeof recipient !== 'string' || !recipient.trim())) throw new ApiError('请选择收件教师')
    if (typeof recipient === 'string') {
      const selected = await supabase.from('profiles').select('id,role').eq('id', recipient).maybeSingle()
      dbCheck(selected.error)
      if (!selected.data || selected.data.role !== 'teacher') throw new ApiError('收件教师不存在')
    }
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        title: body.title.trim(),
        content: body.content.trim(),
        category: body.category,
        ask_teacher: !!recipient || body.ask_teacher === true,
        recipient_teacher_id: recipient ?? null,
      })
      .select()
      .maybeSingle()
    dbCheck(error)
    return NextResponse.json(data)
  })
}
