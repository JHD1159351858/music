import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// PATCH /api/posts/:id  { marked_for_lesson?: boolean }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createSupabaseServer()
  const body = await request.json()
  const { data, error } = await supabase
    .from('posts')
    .update({ marked_for_lesson: !!body.marked_for_lesson })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createSupabaseServer()
  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
