import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createSupabaseServer()
  const body = await request.json()
  const { data, error } = await supabase
    .from('scores')
    .update({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.composer !== undefined && { composer: body.composer }),
      ...(body.difficulty !== undefined && { difficulty: body.difficulty }),
      ...(body.tips !== undefined && { tips: body.tips }),
      ...(body.image_url !== undefined && { image_url: body.image_url }),
    })
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
  const { error } = await supabase.from('scores').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
