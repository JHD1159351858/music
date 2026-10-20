import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actor, apiRoute, dbCheck, readJson, teacher } from '@/lib/teaching-server'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { supabase } = await actor(request)
    const { data, error } = await supabase.from('score_genres').select('*').order('name')
    dbCheck(error)
    return NextResponse.json(data ?? [])
  })
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = z.object({ user_id: z.string().min(1), name: z.string().trim().min(1).max(100) }).parse(await readJson(request))
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const { data, error } = await supabase.from('score_genres').insert({ name: body.name, teacher_id: user.id }).select().single()
    if (error?.code === '23505') return NextResponse.json({ error: '此曲风已存在，请直接选择' }, { status: 409 })
    dbCheck(error)
    return NextResponse.json(data, { status: 201 })
  })
}
