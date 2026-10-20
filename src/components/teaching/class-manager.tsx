'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage, jsonBody, teachingApi } from './api'
import type { Profile } from '@/lib/teaching-types'

export function ClassManager({ userId, students, onSaved }: { userId: string; students: Profile[]; onSaved: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  async function save(student: Profile) {
    setSavingId(student.id)
    try {
      await teachingApi('/api/profiles', { method: 'PATCH', ...jsonBody({ user_id: userId, student_id: student.id, class_name: (drafts[student.id] ?? student.class_name ?? '').trim() || null }) })
      toast.success('班级归属已更新')
      onSaved()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setSavingId(null) }
  }
  return <section className="space-y-4"><div><h2 className="font-serif text-xl">学生班级</h2><p className="mt-1 text-sm text-muted-foreground">维护学生班级归属，发布任务时可按班级选择范围。</p></div><div className="rounded-xl border border-border bg-card p-5">{students.length === 0 ? <p className="text-sm text-muted-foreground">暂无学生身份。</p> : <div className="grid gap-4 md:grid-cols-2">{students.map((student) => <div key={student.id} className="flex flex-wrap items-center gap-2"><span className="min-w-20 text-sm">{student.nickname}</span><Input aria-label={`${student.nickname}的班级`} className="min-w-28 flex-1" placeholder="未分班" maxLength={100} value={drafts[student.id] ?? student.class_name ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [student.id]: event.target.value }))} /><Button variant="outline" size="sm" disabled={savingId !== null} onClick={() => void save(student)}>{savingId === student.id ? '保存中…' : '保存'}</Button></div>)}</div>}</div></section>
}
