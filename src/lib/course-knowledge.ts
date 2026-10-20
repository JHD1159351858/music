import { z } from 'zod'
import { createSupabaseServer } from './supabase-server'
import { dbCheck } from './teaching-server'

export interface CourseKnowledge {
  id: string; title: string; content: string; keywords: string[]
  source_url: string | null; teacher_id: string; created_at: string
}

export const knowledgeSchema = z.object({
  title: z.string().trim().min(1, '请填写知识标题').max(160),
  content: z.string().trim().min(1, '请填写知识内容').max(12000),
  keywords: z.array(z.string().trim().min(1).max(60)).max(16).default([]),
  source_url: z.string().url('参考链接格式无效').refine(value => /^https?:\/\//i.test(value), '参考链接须使用 HTTP(S)').nullable().optional().default(null),
})

export async function allCourseKnowledge(): Promise<CourseKnowledge[]> {
  const db = createSupabaseServer()
  const entries: CourseKnowledge[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('course_knowledge').select('*').order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
    dbCheck(result.error)
    entries.push(...(result.data ?? []) as CourseKnowledge[])
    if (!result.data || result.data.length < 500) return entries
  }
}

// Match explicit course terms and title fragments; unrelated questions never use model memory as a fallback.
export async function retrieveKnowledge(question: string): Promise<CourseKnowledge[]> {
  const query = question.toLocaleLowerCase().replace(/\s+/g, '')
  const entries = await allCourseKnowledge()
  return entries.map(entry => {
    const terms = [...entry.keywords, entry.title].map(term => term.toLocaleLowerCase().replace(/\s+/g, '')).filter(term => term.length >= 2)
    const score = terms.reduce((total, term) => total + (query.includes(term) ? term.length : 0), 0)
    return { entry, score }
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(match => match.entry)
}
