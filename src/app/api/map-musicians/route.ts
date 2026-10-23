import { NextResponse } from 'next/server'
import { actor, apiRoute, ApiError, dbCheck, readJson, teacher } from '@/lib/teaching-server'
import { allMapMusicians, customMapMusician, mapMusicianSchema, validateMapAvatar, type MapMusicianRow } from '@/lib/map-musicians'
import { getTeachingFileUrl } from '@/lib/teaching-files'

export async function GET(request: Request) {
  return apiRoute(async () => {
    const { supabase } = await actor(request)
    const kind = new URL(request.url).searchParams.get('map_kind')
    if (kind !== null && kind !== 'china' && kind !== 'europe') throw new ApiError('地图类型无效')
    return NextResponse.json(await allMapMusicians(supabase, kind ?? undefined))
  })
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    const raw = await readJson(request)
    const { user, supabase } = await actor(request, raw)
    teacher(user)
    const body = mapMusicianSchema.parse(raw)
    await validateMapAvatar(supabase, user, body.avatar_file_id, body.avatar_receipt)
    const avatar = body.avatar_file_id ? (await getTeachingFileUrl(body.avatar_file_id)).url : ''
    const values = { ...body }
    Reflect.deleteProperty(values, 'avatar_receipt')
    const result = await supabase.from('map_musicians').insert({ ...values, teacher_id: user.id }).select().single()
    dbCheck(result.error)
    return NextResponse.json(customMapMusician(result.data as MapMusicianRow, avatar), { status: 201 })
  })
}
