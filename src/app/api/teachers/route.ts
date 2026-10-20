import { NextResponse } from 'next/server'
import { actor, apiRoute, dbCheck } from '@/lib/teaching-server'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { supabase } = await actor(request)
    const { data, error } = await supabase.from('profiles').select('id,nickname').eq('role', 'teacher').order('nickname')
    dbCheck(error)
    return NextResponse.json(data)
  })
}
