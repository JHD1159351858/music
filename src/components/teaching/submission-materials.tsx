'use client'

import { useState } from 'react'
import { FileText, Headphones, Video, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { errorMessage, jsonBody, teachingApi, teachingDate, teachingDuration } from './api'
import type { TaskSubmission } from '@/lib/teaching-types'

export function SubmissionMaterials({ submission }: { submission: TaskSubmission }) {
  const record = submission.practice_records
  return <div className="space-y-5">
    {submission.audio_url && <div><p className="mb-2 flex items-center gap-2 text-sm font-medium"><Headphones className="h-4 w-4 text-primary" />练习录音</p><audio controls preload="metadata" src={submission.audio_url} className="w-full" /></div>}
    {submission.video_url && <div><p className="mb-2 flex items-center gap-2 text-sm font-medium"><Video className="h-4 w-4 text-primary" />演奏视频</p><video controls preload="metadata" src={submission.video_url} className="max-h-96 w-full rounded-lg bg-muted" /></div>}
    {(record || submission.record_text) && <div><p className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" />练习记录</p>{record && <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="font-medium">{record.piece_title}</p><p className="mt-1 text-sm text-muted-foreground">{teachingDate(record.started_at)} · {teachingDuration(record.duration_seconds)}</p>{record.audio_url && record.audio_url !== submission.audio_url && <audio controls preload="metadata" src={record.audio_url} className="mt-3 w-full" />}</div>}{submission.record_text && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{submission.record_text}</p>}</div>}
  </div>
}

export function SubmissionReview({ submission, userId, canReview, onSaved }: { submission: TaskSubmission; userId: string; canReview: boolean; onSaved: () => void }) {
  const [grade, setGrade] = useState(submission.grade?.toString() ?? '')
  const [feedback, setFeedback] = useState(submission.feedback ?? '')
  const [saving, setSaving] = useState(false)
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await teachingApi(`/api/submissions/${submission.id}`, { method: 'PATCH', ...jsonBody({ user_id: userId, grade: Number(grade), feedback: feedback.trim() }) })
      toast.success('评分与评语已回传学生')
      onSaved()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setSaving(false) }
  }
  return <div className="space-y-5 rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-lg">{submission.profiles?.nickname ?? '我的提交'}<span className="ml-2 text-xs font-sans text-muted-foreground">{submission.profiles?.class_name}</span></h3><p className="mt-1 text-xs text-muted-foreground">提交于 {teachingDate(submission.submitted_at)}</p></div><Badge variant="outline">{submission.reviewed_at ? '已评阅' : '待评阅'}</Badge></div>
    <SubmissionMaterials submission={submission} />
    {canReview ? <form onSubmit={save} className="space-y-4 border-t border-border pt-5"><div className="space-y-2"><Label htmlFor={`grade-${submission.id}`}>评分（0–100 分）</Label><Input id={`grade-${submission.id}`} className="w-36" type="number" min="0" max="100" step="1" required value={grade} onChange={(event) => setGrade(event.target.value)} /></div><div className="space-y-2"><Label htmlFor={`feedback-${submission.id}`}>教师评语</Label><Textarea id={`feedback-${submission.id}`} required rows={3} maxLength={10000} placeholder="对本次练习给出具体建议" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></div><Button disabled={saving}>{saving ? '保存中…' : '保存评阅'}</Button></form> : <div className="border-t border-border pt-4">{submission.reviewed_at ? <><p className="flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="h-4 w-4" />教师评分 <span className="text-xl tabular-nums">{submission.grade}</span> 分</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{submission.feedback || '教师未填写评语'}</p></> : <p className="text-sm text-muted-foreground">已提交成功，等待教师评阅。</p>}</div>}
  </div>
}
