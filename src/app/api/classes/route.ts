import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listTeacherClasses, createTeacherClass } from '@/lib/class-server'
import { actor, apiRoute, readJson, teacher } from '@/lib/teaching-server'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    teacher(user)
    return NextResponse.json(await listTeacherClasses(supabase, user.id))
  })
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    const body = await readJson(request)
    const { user, supabase } = await actor(request, body)
    teacher(user)
    const { name } = z.object({ name: z.string().trim().min(1, '请输入班级名称').max(100, '班级名称不能超过 100 字') }).parse(body)
    return NextResponse.json(await createTeacherClass(supabase, user.id, name), { status: 201 })
  })
}
