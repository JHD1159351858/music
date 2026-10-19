'use client'

import { useEffect, useState } from 'react'
import type { TaskDetail, TaskSubmission } from '@/lib/teaching-types'
import { errorMessage, teachingApi } from '@/components/teaching/api'
import { SubmissionReview } from '@/components/teaching/submission-materials'
import { AdminNotice } from '@/components/teacher/admin-table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function TeacherReviewDialog({ userId, taskId, submissionId, taskTitle, submission, onClose, onSaved }: {
  userId: string
  taskId: string
  submissionId: string
  taskTitle: string
  submission?: TaskSubmission
  onClose: () => void
  onSaved: () => void
}) {
  const [material, setMaterial] = useState<TaskSubmission | null>(submission ?? null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (submission) return
    let active = true
    setError('')
    void teachingApi<TaskDetail>(`/api/tasks/${encodeURIComponent(taskId)}?user_id=${encodeURIComponent(userId)}`).then(detail => {
      const found = detail.submissions.find(item => item.id === submissionId)
      if (!found) throw new Error('此提交已不存在，请刷新列表。')
      if (active) setMaterial(found)
    }).catch((cause: unknown) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [userId, taskId, submissionId, submission, attempt])
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>提交评阅</DialogTitle><DialogDescription>{taskTitle} · 查看学生材料并保存评分与评语。</DialogDescription></DialogHeader>{error ? <AdminNotice message={error} onRetry={() => setAttempt(value => value + 1)} /> : material ? <SubmissionReview submission={material} userId={userId} canReview onSaved={() => { onSaved(); onClose() }} /> : <p className="py-12 text-center text-muted-foreground">正在读取提交材料…</p>}</DialogContent></Dialog>
}
