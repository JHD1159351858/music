'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useRequireUser } from '@/lib/user-context'
import type { TeacherSubmissionSummary, TeacherSubmissionsResponse } from '@/lib/teacher-admin-types'
import { errorMessage, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { TeacherReviewDialog } from '@/components/teacher/review-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ReviewManagement() {
  return <Suspense fallback={<p className="py-16 text-center text-muted-foreground">正在读取提交…</p>}><ReviewManagementContent /></Suspense>
}

function ReviewManagementContent() {
  const { user } = useRequireUser()
  const searchParams = useSearchParams()
  const [data, setData] = useState<TeacherSubmissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [taskId, setTaskId] = useState(searchParams.get('task_id') || 'all')
  const [className, setClassName] = useState('all')
  const [status, setStatus] = useState(searchParams.get('status') === 'pending' ? 'pending' : searchParams.get('status') === 'reviewed' ? 'reviewed' : 'all')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [review, setReview] = useState<TeacherSubmissionSummary | null>(null)
  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(query.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    const params = new URLSearchParams({ status, page: String(page), page_size: '20' })
    if (taskId !== 'all') params.set('task_id', taskId)
    if (className !== 'all') params.set('class_name', className)
    if (search) params.set('q', search)
    setLoading(true)
    setError('')
    void teachingApi<TeacherSubmissionsResponse>(`/api/teacher/submissions?${params}`, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      setData(result)
      if (result.page !== page) setPage(result.page)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorMessage(cause)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [user, status, page, taskId, className, search, refresh])
  const columns = useMemo<AdminColumn<TeacherSubmissionSummary>[]>(() => [
    { key: 'student', label: '学生 / 班级', render: submission => <div className="min-w-28"><p className="font-medium">{submission.student_nickname}</p><p className="mt-1 text-xs text-muted-foreground">{submission.class_name || '未分班'}</p></div> },
    { key: 'task', label: '练习任务', render: submission => <Link href={`/teacher/tasks/${submission.task_id}`} className="inline-block min-w-36 max-w-56 font-medium hover:text-primary">{submission.task_title}</Link> },
    { key: 'materials', label: '提交材料', render: submission => <div className="flex min-w-32 flex-wrap gap-1.5">{submission.has_audio && <Badge variant="outline">录音</Badge>}{submission.has_record && <Badge variant="outline">练习记录</Badge>}{submission.has_video && <Badge variant="outline">视频</Badge>}</div> },
    { key: 'time', label: '提交时间', render: submission => <span className="whitespace-nowrap text-xs text-muted-foreground">{teachingDate(submission.submitted_at)}</span> },
    { key: 'status', label: '评阅状态', render: submission => <Badge variant={submission.reviewed_at ? 'secondary' : 'default'}>{submission.reviewed_at ? '已评阅' : '待评阅'}</Badge> },
    { key: 'grade', label: '评分', render: submission => submission.grade != null ? `${submission.grade} 分` : '—' },
    { key: 'actions', label: '操作', render: submission => <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => setReview(submission)}>{submission.reviewed_at ? '查看 / 修改评阅' : '查看材料并评阅'}</Button> },
  ], [])
  if (!user) return null
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)))
  return <div className="space-y-6"><AdminPageHeader title="提交评阅" description="汇总本人任务下的学生提交，按班级和评阅状态集中处理。" /><div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4"><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索学生或任务" className="pl-9" placeholder="搜索学生昵称或任务名称" value={query} onChange={event => setQuery(event.target.value)} /></div><Select value={taskId} onValueChange={value => { setTaskId(value); setPage(1) }}><SelectTrigger aria-label="任务筛选" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部任务</SelectItem>{data?.tasks.map(task => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}</SelectContent></Select><Select value={className} onValueChange={value => { setClassName(value); setPage(1) }}><SelectTrigger aria-label="班级筛选" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem>{data?.classes.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={value => { setStatus(value); setPage(1) }}><SelectTrigger aria-label="评阅状态筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部评阅状态</SelectItem><SelectItem value="pending">待评阅</SelectItem><SelectItem value="reviewed">已评阅</SelectItem></SelectContent></Select></div>{error ? <AdminNotice message={error} onRetry={() => setRefresh(value => value + 1)} /> : loading ? <p className="py-16 text-center text-muted-foreground">正在读取提交…</p> : <div className="space-y-3"><AdminTable rows={data?.items ?? []} columns={columns} rowKey={submission => submission.id} pagination={false} emptyText="暂无符合条件的学生提交" /><div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground"><span>共 {data?.total ?? 0} 条提交，每页 {data?.pageSize ?? 20} 条</span><div className="flex items-center gap-3"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" />上一页</Button><span className="tabular-nums">{page} / {totalPages}</span><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight className="h-4 w-4" /></Button></div></div></div>}{review && <TeacherReviewDialog key={review.id} userId={user.id} taskId={review.task_id} submissionId={review.id} taskTitle={review.task_title} onClose={() => setReview(null)} onSaved={() => setRefresh(value => value + 1)} />}</div>
}
