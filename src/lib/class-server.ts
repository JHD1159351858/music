import { randomInt, randomUUID } from 'node:crypto'
import { ApiError, dbCheck, type TeachingClient } from './teaching-server'
import type { Classroom } from './class-types'

type ClassRow = Omit<Classroom, 'student_count'>
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export async function listTeacherClasses(supabase: TeachingClient, teacherId: string): Promise<Classroom[]> {
  const classes: ClassRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('classes').select('id,name,join_code,teacher_id,created_at').eq('teacher_id', teacherId).order('created_at', { ascending: false }).order('id').range(offset, offset + 999)
    dbCheck(page.error)
    classes.push(...(page.data ?? []) as ClassRow[])
    if (!page.data || page.data.length < 1000) break
  }
  if (!classes.length) return []
  const counts = new Map<string, number>()
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('profiles').select('id,class_name').eq('role', 'student').order('id').range(offset, offset + 999)
    dbCheck(page.error)
    for (const student of page.data ?? []) {
      if (typeof student.class_name === 'string') counts.set(student.class_name, (counts.get(student.class_name) ?? 0) + 1)
    }
    if (!page.data || page.data.length < 1000) break
  }
  return classes.map(row => ({ ...row, student_count: counts.get(row.name) ?? 0 }))
}

export async function createTeacherClass(supabase: TeachingClient, teacherId: string, name: string): Promise<Classroom> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const joinCode = Array.from({ length: 8 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('')
    const result = await supabase.from('classes').insert({ id: randomUUID(), name, join_code: joinCode, teacher_id: teacherId }).select('id,name,join_code,teacher_id,created_at').single()
    if (result.error?.code === '23505') {
      const existing = await supabase.from('classes').select('id').eq('name', name).maybeSingle()
      dbCheck(existing.error)
      if (existing.data) throw new ApiError('班级名称已存在，请使用其他名称', 409)
      continue
    }
    dbCheck(result.error)
    const count = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('class_name', name)
    dbCheck(count.error)
    return { ...result.data as ClassRow, student_count: count.count ?? 0 }
  }
  throw new ApiError('班级代码生成失败，请重试', 503)
}
