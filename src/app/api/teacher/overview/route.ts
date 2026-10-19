import { NextResponse } from 'next/server'
import { actor, apiRoute, teacher } from '@/lib/teaching-server'
import { teacherOverview } from '@/lib/teacher-overview'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { user, supabase } = await actor(request)
    teacher(user)
    return NextResponse.json(await teacherOverview(supabase, user.id, new URL(request.url).searchParams))
  })
}
