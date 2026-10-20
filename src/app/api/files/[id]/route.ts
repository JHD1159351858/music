import { serveLocalFile } from '@/lib/local-files'
import { actor, apiRoute, ApiError, canAccessTeachingFile } from '@/lib/teaching-server'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Context) {
  return apiRoute(async () => {
    const { id } = await context.params
    const { user, supabase } = await actor(request)
    if (!await canAccessTeachingFile(supabase, user, `local:${id}`)) throw new ApiError('文件不存在或无权访问', 404)
    const response = await serveLocalFile(request, id)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  })
}

export async function HEAD(request: Request, context: Context) {
  return GET(request, context)
}
