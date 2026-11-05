'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronUp, Eye, FileMusic, MoreHorizontal, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { Profile, Score } from '@/lib/teaching-types'
import { SCORE_TYPES } from '@/lib/score-classification'
import { ScoreEditor } from '@/components/practice/score-editor'
import { ScorePreview } from '@/components/practice/score-preview'
import { ScoreCover } from '@/components/practice/score-cover'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import styles from './score-management.module.css'

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
  const [editor, setEditor] = useState<{ score: Score; revision: number } | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
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
      const owned = scoreData.filter(score => score.source === 'teacher' && score.owner_id === user.id)
      setScores(owned)
      setEditor(current => {
        const selected = owned.find(score => score.id === current?.score.id) ?? owned[0]
        return selected ? { score: selected, revision: current?.revision ?? 0 } : null
      })
      setClassNames([...new Set(profiles.filter(profile => profile.role === 'student').map(profile => profile.class_name).filter((name): name is string => Boolean(name)))].sort())
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (searchParams.get('upload') === '1') setUploadOpen(true) }, [searchParams])

  const filtered = useMemo(() => scores.filter(score =>
    (!query.trim() || `${score.title} ${score.composer}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (category === 'all' || score.category === category) &&
    (scoreType === 'all' || score.score_type === scoreType) &&
    (period === 'all' || score.period === period) &&
    (publication === 'all' || score.published === (publication === 'published'))
  ), [scores, query, category, scoreType, period, publication])
  const periods = [...new Set(scores.map(score => score.period).filter((value): value is string => Boolean(value)))].sort()

  function selectScore(score: Score) {
    if (editorSaving) return
    setEditor(current => current?.score.id === score.id ? current : { score, revision: 0 })
    setPanelExpanded(true)
    if (window.matchMedia('(max-width: 1279px)').matches) requestAnimationFrame(() => document.getElementById('teacher-score-editor')?.scrollIntoView({ block: 'start' }))
  }

  function savedScore(saved?: Score) {
    if (saved) setEditor(current => ({ score: saved, revision: (current?.revision ?? 0) + 1 }))
    void load()
  }

  async function changePublication(score: Score) {
    if (!user) return
    setBusyId(score.id)
    try {
      await teachingApi(`/api/scores/${score.id}`, { method: 'PATCH', ...jsonBody({ user_id: user.id, published: !score.published }) })
      setEditor(current => current?.score.id === score.id ? { score: { ...score, published: !score.published }, revision: current.revision + 1 } : current)
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
    { key: 'title', label: '曲目 / 作曲家', render: score => <button type="button" data-score-selected={editor?.score.id === score.id} aria-label={`编辑琴谱${score.title}`} aria-pressed={editor?.score.id === score.id} disabled={editorSaving} onClick={() => selectScore(score)} className="flex min-w-36 max-w-60 items-center gap-3 rounded-md text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"><div className="size-11 shrink-0 overflow-hidden rounded-md border border-border bg-muted"><ScoreCover score={score} /></div><div className="min-w-0"><p className="truncate font-medium">{score.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{score.composer}</p><p className="mt-1 hidden text-[10px] text-muted-foreground 2xl:block">上传于 {teachingDate(score.created_at)}</p></div></button> },
    { key: 'category', label: '类型 / 时期', render: score => <div className="min-w-20 text-xs leading-5"><p>{categories[score.category]} · {score.score_type ?? '类型未设置'}</p><p className="text-muted-foreground">{score.period ?? '时期未设置'}</p></div> },
    { key: 'published', label: '发布状态', render: score => <Badge variant={score.published ? 'default' : 'secondary'}>{score.published ? '已发布' : '未发布'}</Badge> },
    { key: 'classes', label: '可见班级', render: score => <span className="inline-block min-w-16 max-w-28 text-xs leading-5">{score.target_classes?.length ? score.target_classes.join('、') : '全部班级'}</span> },
    { key: 'actions', label: '操作', render: score => <div className="flex items-center gap-0.5"><Button size="icon" variant="ghost" aria-label={`编辑${score.title}`} disabled={editorSaving || busyId === score.id} onClick={() => selectScore(score)}><Pencil className="size-3.5" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`${score.title}的更多操作`} disabled={editorSaving || busyId === score.id}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setPreview(score)}><Eye className="size-4" />查看琴谱</DropdownMenuItem><DropdownMenuItem onSelect={() => void changePublication(score)}>{score.published ? '取消发布' : '发布琴谱'}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleting(score)}><Trash2 className="size-4" />删除琴谱</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div> },
  ]

  if (!user) return null
  return <div className="space-y-6">
    <AdminPageHeader title="琴谱管理" description="维护课堂曲库，分别上传封面与谱面，为学生提供清晰的练习内容。" actions={<Button disabled={loading || Boolean(error) || editorSaving} onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" />上传 / 批量上传</Button>} />
    <div className="admin-filter-bar flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索曲名或作曲家" className="pl-9" placeholder="搜索曲名或作曲家" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="分类筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem><SelectItem value="domestic">国内</SelectItem><SelectItem value="foreign">国外</SelectItem></SelectContent></Select>
      <Select value={scoreType} onValueChange={setScoreType}><SelectTrigger aria-label="类型筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem>{SCORE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
      <Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label="时期筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部时期</SelectItem>{periods.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Select value={publication} onValueChange={setPublication}><SelectTrigger aria-label="发布状态筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部发布状态</SelectItem><SelectItem value="published">已发布</SelectItem><SelectItem value="unpublished">未发布</SelectItem></SelectContent></Select>
    </div>
    <div className={styles.workspace}>
      <section className={styles.catalog} aria-label="课堂曲库"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">课堂曲库 <span className="ml-1 font-normal text-muted-foreground">{filtered.length} 首</span></h2><p className="text-xs text-muted-foreground">选择曲目，编辑属性与文件</p></div>{error ? <AdminNotice message={error} onRetry={() => void load()} /> : loading ? <p className="py-16 text-center text-muted-foreground">正在读取琴谱…</p> : <AdminTable rows={filtered} columns={columns} rowKey={score => score.id} emptyText={scores.length ? '没有符合筛选条件的琴谱' : '暂无琴谱，点击上传开始建立课堂曲库'} />}</section>
      <aside className={styles.panel} aria-label="曲目属性与文件"><button type="button" disabled={editorSaving} aria-expanded={panelExpanded} aria-controls="teacher-score-editor" className="mb-3 flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-medium xl:hidden" onClick={() => setPanelExpanded(value => !value)}><span className="truncate">{editor ? `编辑：${editor.score.title}` : '琴谱编辑面板'}</span>{panelExpanded ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}</button><div id="teacher-score-editor" className={`${styles.editor} ${panelExpanded ? 'block' : 'hidden xl:block'}`}>{editor ? <ScoreEditor key={`${editor.score.id}-${editor.revision}`} userId={user.id} score={editor.score} isTeacher embedded classNames={classNames} onSavingChange={setEditorSaving} headerActions={<Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={editorSaving || busyId === editor.score.id} onClick={() => setDeleting(editor.score)}><Trash2 className="size-3.5" />删除</Button>} onClose={() => setEditor(null)} onSaved={savedScore} /> : <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center"><FileMusic className="mb-3 size-8 text-primary/50" /><h2 className="text-sm font-medium">选择一首琴谱开始编辑</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">点击左侧曲目，维护封面、谱页与发布范围。</p>{!scores.length && <Button variant="outline" size="sm" className="mt-4" disabled={loading || Boolean(error)} onClick={() => setUploadOpen(true)}>上传第一首琴谱</Button>}</div>}</div></aside>
    </div>
    {uploadOpen && <ScoreEditor userId={user.id} score={null} isTeacher classNames={classNames} onClose={() => setUploadOpen(false)} onSaved={() => void load()} onSavingChange={setEditorSaving} />}
    {preview && <ScorePreview score={preview} onClose={() => setPreview(null)} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除琴谱</DialogTitle><DialogDescription>确定删除「{deleting?.title}」？删除后学生将无法继续从曲库中选用这份琴谱。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busyId === deleting?.id} onClick={() => void deleteScore()}>确认删除</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
