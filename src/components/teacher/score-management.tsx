'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, Pencil, Plus, Search, Settings2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import type { Genre, Profile, Score } from '@/lib/teaching-types'
import { ScoreEditor } from '@/components/practice/score-editor'
import { ScorePreview } from '@/components/practice/score-preview'
import { errorMessage, jsonBody, teachingApi, teachingDate } from '@/components/teaching/api'
import { AdminNotice, AdminPageHeader, AdminTable, type AdminColumn } from '@/components/teacher/admin-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const categories = { domestic: '国内', foreign: '国外' }
const difficulties = { beginner: '入门', intermediate: '一般', advanced: '困难' }

export function ScoreManagement() {
  return <Suspense fallback={<p className="py-16 text-center text-muted-foreground">正在读取琴谱…</p>}><ScoreManagementContent /></Suspense>
}

function ScoreManagementContent() {
  const { user } = useRequireUser()
  const searchParams = useSearchParams()
  const [scores, setScores] = useState<Score[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [genreId, setGenreId] = useState('all')
  const [publication, setPublication] = useState('all')
  const [editor, setEditor] = useState<{ score: Score | null } | null>(null)
  const [preview, setPreview] = useState<Score | null>(null)
  const [deleting, setDeleting] = useState<Score | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [genreOpen, setGenreOpen] = useState(false)
  const [genreName, setGenreName] = useState('')
  const [genreBusy, setGenreBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const id = encodeURIComponent(user.id)
      const [scoreData, genreData, profiles] = await Promise.all([
        teachingApi<Score[]>(`/api/scores?user_id=${id}&source=teacher&owner=${id}`),
        teachingApi<Genre[]>(`/api/genres?user_id=${id}`),
        teachingApi<Profile[]>(`/api/profiles?user_id=${id}`),
      ])
      setScores(scoreData.filter(score => score.source === 'teacher' && score.owner_id === user.id))
      setGenres(genreData)
      setClassNames([...new Set(profiles.filter(profile => profile.role === 'student').map(profile => profile.class_name).filter((name): name is string => Boolean(name)))].sort())
    } catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (searchParams.get('upload') === '1') setEditor({ score: null }) }, [searchParams])

  const filtered = useMemo(() => scores.filter(score =>
    (!query.trim() || `${score.title} ${score.composer}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (category === 'all' || score.category === category) &&
    (difficulty === 'all' || score.difficulty === difficulty) &&
    (genreId === 'all' || score.genre_id === genreId) &&
    (publication === 'all' || score.published === (publication === 'published'))
  ), [scores, query, category, difficulty, genreId, publication])

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

  async function addGenre(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !genreName.trim()) return
    setGenreBusy(true)
    try {
      const genre = await teachingApi<Genre>('/api/genres', { method: 'POST', ...jsonBody({ user_id: user.id, name: genreName.trim() }) })
      setGenres(all => [...all, genre])
      setGenreName('')
      toast.success('曲风已录入')
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setGenreBusy(false) }
  }

  async function deleteGenre(genre: Genre) {
    if (!user) return
    setGenreBusy(true)
    try {
      await teachingApi(`/api/genres/${genre.id}?user_id=${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      setGenres(all => all.filter(item => item.id !== genre.id))
      toast.success('曲风已移除')
    } catch (cause: unknown) { toast.error(errorMessage(cause)) }
    finally { setGenreBusy(false) }
  }

  const columns: AdminColumn<Score>[] = [
    { key: 'title', label: '曲名 / 作曲家', render: score => <div className="min-w-40"><p className="font-medium">{score.title}</p><p className="mt-1 text-xs text-muted-foreground">{score.composer}</p></div> },
    { key: 'category', label: '分类 / 难度', render: score => <div className="flex flex-wrap gap-1.5"><Badge variant="secondary">{categories[score.category]}</Badge><Badge variant="outline">{difficulties[score.difficulty]}</Badge></div> },
    { key: 'genre', label: '曲风', render: score => score.genre?.name ?? genres.find(genre => genre.id === score.genre_id)?.name ?? <span className="text-muted-foreground">未设置</span> },
    { key: 'published', label: '发布状态', render: score => <Badge variant={score.published ? 'default' : 'secondary'}>{score.published ? '已发布' : '未发布'}</Badge> },
    { key: 'classes', label: '可见班级', render: score => <span className="inline-block max-w-44 text-xs leading-5">{score.target_classes?.length ? score.target_classes.join('、') : '全部班级'}</span> },
    { key: 'created', label: '上传时间', render: score => <span className="whitespace-nowrap text-xs text-muted-foreground">{teachingDate(score.created_at)}</span> },
    { key: 'actions', label: '操作', render: score => <div className="flex min-w-64 items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setPreview(score)}><Eye className="h-3.5 w-3.5" />查看</Button><Button size="sm" variant="ghost" onClick={() => setEditor({ score })}><Pencil className="h-3.5 w-3.5" />编辑</Button><Button size="sm" variant="ghost" disabled={busyId === score.id} onClick={() => void changePublication(score)}>{score.published ? '取消发布' : '发布'}</Button><Button size="icon" variant="ghost" aria-label={`删除琴谱${score.title}`} className="text-destructive" disabled={busyId === score.id} onClick={() => setDeleting(score)}><Trash2 className="h-3.5 w-3.5" /></Button></div> },
  ]

  if (!user) return null
  return <div className="space-y-6">
    <AdminPageHeader title="琴谱管理" description="维护本人上传的课堂琴谱，统一属性、发布范围与教学提醒。" actions={<><Button variant="outline" onClick={() => setGenreOpen(true)}><Settings2 className="h-4 w-4" />曲风管理</Button><Button disabled={loading || Boolean(error)} onClick={() => setEditor({ score: null })}><Upload className="h-4 w-4" />上传 / 批量上传</Button></>} />
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
      <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索曲名或作曲家" className="pl-9" placeholder="搜索曲名或作曲家" value={query} onChange={event => setQuery(event.target.value)} /></div>
      <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="分类筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem><SelectItem value="domestic">国内</SelectItem><SelectItem value="foreign">国外</SelectItem></SelectContent></Select>
      <Select value={difficulty} onValueChange={setDifficulty}><SelectTrigger aria-label="难度筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部难度</SelectItem><SelectItem value="beginner">入门</SelectItem><SelectItem value="intermediate">一般</SelectItem><SelectItem value="advanced">困难</SelectItem></SelectContent></Select>
      <Select value={genreId} onValueChange={setGenreId}><SelectTrigger aria-label="曲风筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部曲风</SelectItem>{genres.map(genre => <SelectItem key={genre.id} value={genre.id}>{genre.name}</SelectItem>)}</SelectContent></Select>
      <Select value={publication} onValueChange={setPublication}><SelectTrigger aria-label="发布状态筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部发布状态</SelectItem><SelectItem value="published">已发布</SelectItem><SelectItem value="unpublished">未发布</SelectItem></SelectContent></Select>
    </div>
    {error ? <AdminNotice message={error} onRetry={() => void load()} /> : loading ? <p className="py-16 text-center text-muted-foreground">正在读取琴谱…</p> : <AdminTable rows={filtered} columns={columns} rowKey={score => score.id} emptyText={query ? '没有符合筛选条件的琴谱' : '暂无琴谱，点击上传开始建立课堂曲库'} />}
    {editor && <ScoreEditor userId={user.id} score={editor.score} genres={genres} isTeacher classNames={classNames} onClose={() => setEditor(null)} onSaved={() => void load()} />}
    {preview && <ScorePreview score={preview} onClose={() => setPreview(null)} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除琴谱</DialogTitle><DialogDescription>确定删除「{deleting?.title}」？删除后学生将无法继续从曲库中选用这份琴谱。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busyId === deleting?.id} onClick={() => void deleteScore()}>确认删除</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={genreOpen} onOpenChange={setGenreOpen}><DialogContent><DialogHeader><DialogTitle>曲风管理</DialogTitle><DialogDescription>请先由任课教师确认取值，再统一录入。正在被琴谱使用的曲风不能删除。</DialogDescription></DialogHeader><form onSubmit={event => void addGenre(event)} className="space-y-2"><Label htmlFor="teacher-genre-name">曲风名称</Label><div className="flex gap-2"><Input id="teacher-genre-name" required maxLength={100} value={genreName} onChange={event => setGenreName(event.target.value)} placeholder="输入已确认的曲风" /><Button disabled={genreBusy || !genreName.trim()}><Plus className="h-4 w-4" />录入</Button></div></form><div className="max-h-72 space-y-2 overflow-y-auto">{genres.length === 0 ? <p className="py-5 text-sm text-muted-foreground">尚未录入曲风。</p> : genres.map(genre => <div key={genre.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"><span className="text-sm">{genre.name}</span>{genre.teacher_id === user.id ? <Button variant="ghost" size="sm" className="text-destructive" disabled={genreBusy} onClick={() => void deleteGenre(genre)}>移除</Button> : <span className="text-xs text-muted-foreground">其他教师维护</span>}</div>)}</div></DialogContent></Dialog>
  </div>
}
