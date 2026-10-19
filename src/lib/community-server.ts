import type { TeachingProfile } from './teaching-types'
import { ApiError, dbCheck, type TeachingClient } from './teaching-server'

export const COMMUNITY_CATEGORIES = ['method', 'theory', 'repertoire', 'performance', 'other'] as const
export interface CommunityPostAccess {
  id: string
  user_id: string
  recipient_teacher_id: string | null
  like_count: number
}

export function canReadCommunityPost(post: CommunityPostAccess, user: TeachingProfile): boolean {
  return !post.recipient_teacher_id || post.user_id === user.id || post.recipient_teacher_id === user.id
}

export async function readableCommunityPost(client: TeachingClient, id: string, user: TeachingProfile): Promise<CommunityPostAccess> {
  const { data, error } = await client.from('posts').select('id,user_id,recipient_teacher_id,like_count').eq('id', id).maybeSingle()
  dbCheck(error)
  if (!data || !canReadCommunityPost(data as CommunityPostAccess, user)) throw new ApiError('帖子或留言不存在', 404)
  return data as CommunityPostAccess
}
