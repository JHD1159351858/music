import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// GET /api/posts?category=&ask_teacher=&marked=
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const askTeacher = searchParams.get('ask_teacher')
  const marked = searchParams.get('marked')

  let query = supabase
    .from('posts')
    .select('*, profiles(nickname), comments(id), post_likes(user_id)')
  if (category && category !== 'all') query = query.eq('category', category)
  if (askTeacher === 'true') query = query.eq('ask_teacher', true)
  if (marked === 'true') query = query.eq('marked_for_lesson', true)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/posts { user_id, title, content, category, ask_teacher }
export async function POST(request: Request) {
  const supabase = createSupabaseServer()
  const body = await request.json()
  if (!body?.user_id || !body?.title || !body?.content || !body?.category) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: body.user_id,
      title: body.title,
      content: body.content,
      category: body.category,
      ask_teacher: !!body.ask_teacher,
    })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
