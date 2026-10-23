'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { Profile, Score } from '@/lib/teaching-types'
import { SCORE_TYPES } from '@/lib/score-classification'
import { ScoreEditor } from '@/components/practice/score-editor'
import { ScorePreview } from '@/components/practice/score-preview'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const categories = { domestic: '国内', foreign: '国外' }

export function ScoreManagement() {
  return <Suspense fallback={<p className="py-16 text-center text-muted-foreground">正在读取琴谱…</p>}><ScoreManagementContent /></Suspense>
}

function ScoreManagementContent() {
  const { user } = useRequireUser()
  const searchParams = useSearchParams()
  const [scores, setScores] = useState<Score[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [scoreType, setScoreType] = useState('all')
  const [period, setPeriod] = useState('all')
  const [publication, setPublication] = useState('all')
  const [editor, setEditor] = useState<{ score: Score | null } | null>(null)
  const [preview, setPreview] = useState<Score | null>(null)
  const [deleting, setDeleting] = useState<Score | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const id = encodeURIComponent(user.id)
      const [scoreData, profiles] = await Promise.all([
        teachingApi<Score[]>(`/api/scores?user_id=${id}&source=teacher&owner=${id}`),
        teachingApi<Profile[]>(`/api/profiles?user_id=${id}`),
      ])
      setScores(scoreData.filter(score => score.source === 'teacher' && score.owner_id === user.id))
      setClassNames([...new Set(profiles.filter(profile => profile.role === 'student').map(profile => profile.class_name).filter((name): name is string => Boolean(name)))].sort())
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (searchParams.get('upload') === '1') setEditor({ score: null }) }, [searchParams])

  const filtered = useMemo(() => scores.filter(score =>
    (!query.trim() || `${score.title} ${score.composer}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (category === 'all' || score.category === category) &&
    (scoreType === 'all' || score.score_type === scoreType) &&
    (period === 'all' || score.period === period) &&
    (publication === 'all' || score.published === (publication === 'published'))
  ), [scores, query, category, scoreType, period, publication])
  const periods = [...new Set(scores.map(score => score.period).filter((value): value is string => Boolean(value)))].sort()

  async function changePublication(score: Score) {
    if (!user) return
    setBusyId(score.id)
    try {
      await teachingApi(`/api/scores/${score.id}`, { method: 'PATCH', ...jsonBody({ user_id: user.id, published: !score.published }) })
      toast.success(score.published ? '琴谱已设为未发布' : '琴谱已发布')
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusyId(null) }
  }

  async function deleteScore() {
    if (!user || !deleting) return
    setBusyId(deleting.id)
    try {
      await teachingApi(`/api/scores/${deleting.id}?user_id=${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      setDeleting(null)
      toast.success('琴谱已删除')
      await load()
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setBusyId(null) }
  }

  const columns: AdminColumn<Score>[] = [
    { key: 'title', label: '曲名 / 作曲家', render: score => <div className="min-w-40"><p className="font-medium">{score.title}</p><p className="mt-1 text-xs text-muted-foreground">{score.composer}</p></div> },
    { key: 'category', label: '分类 / 类型', render: score => <div className="flex flex-wrap gap-1.5"><Badge variant="secondary">{categories[score.category]}</Badge><Badge variant="outline">{score.score_type ?? '类型未设置'}</Badge></div> },
    { key: 'period', label: '时期', render: score => score.period ?? <span className="text-muted-foreground">未设置</span> },
    { key: 'published', label: '发布状态', render: score => <Badge variant={score.published ? 'default' : 'secondary'}>{score.published ? '已发布' : '未发布'}</Badge> },
    { key: 'classes', label: '可见班级', render: score => <span className="inline-block max-w-44 text-xs leading-5">{score.target_classes?.length ? score.target_classes.join('、') : '全部班级'}</span> },
    { key: 'created', label: '上传时间', render: score => <span className="whitespace-nowrap text-xs text-muted-foreground">{teachingDate(score.created_at)}</span> },
    { key: 'actions', label: '操作', render: score => <div className="flex min-w-64 items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setPreview(score)}><Eye className="h-3.5 w-3.5" />查看</Button><Button size="sm" variant="ghost" onClick={() => setEditor({ score })}><Pencil className="h-3.5 w-3.5" />编辑</Button><Button size="sm" variant="ghost" disabled={busyId === score.id} onClick={() => void changePublication(score)}>{score.published ? '取消发布' : '发布'}</Button><Button size="icon" variant="ghost" aria-label={`删除琴谱${score.title}`} className="text-destructive" disabled={busyId === score.id} onClick={() => setDeleting(score)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ]

  if (!user) return null
  return <div className="space-y-6">
    <AdminPageHeader title="琴谱管理" description="维护本人上传的课堂琴谱，统一属性、发布范围与教学提醒。" actions={<Button disabled={loading || Boolean(error)} onClick={() => setEditor({ score: null })}><Upload className="h-4 w-4" />上传 / 批量上传</Button>} />
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索曲名或作曲家" className="pl-9" placeholder="搜索曲名或作曲家" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="分类筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem><SelectItem value="domestic">国内</SelectItem><SelectItem value="foreign">国外</SelectItem></SelectContent></Select>
      <Select value={scoreType} onValueChange={setScoreType}><SelectTrigger aria-label="类型筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem>{SCORE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
      <Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label="时期筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部时期</SelectItem>{periods.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Select value={publication} onValueChange={setPublication}><SelectTrigger aria-label="发布状态筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部发布状态</SelectItem><SelectItem value="published">已发布</SelectItem><SelectItem value="unpublished">未发布</SelectItem></SelectContent></Select>
    </div>
    {error ? <AdminNotice message={error} onRetry={() => void load()} /> : loading ? <p className="py-16 text-center text-muted-foreground">正在读取琴谱…</p> : <AdminTable rows={filtered} columns={columns} rowKey={score => score.id} emptyText={query ? '没有符合筛选条件的琴谱' : '暂无琴谱，点击上传开始建立课堂曲库'} />}
    {editor && <ScoreEditor userId={user.id} score={editor.score} isTeacher classNames={classNames} onClose={() => setEditor(null)} onSaved={() => void load()} />}
    {preview && <ScorePreview score={preview} onClose={() => setPreview(null)} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除琴谱</DialogTitle><DialogDescription>确定删除「{deleting?.title}」？删除后学生将无法继续从曲库中选用这份琴谱。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busyId === deleting?.id} onClick={() => void deleteScore()}>确认删除</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
