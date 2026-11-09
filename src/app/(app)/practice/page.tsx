'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Check, Clock3, ExternalLink, Eye, FileMusic, ListMusic, Loader2, Pencil, Play, Plus, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/lib/user-context'
import type { PracticeRecord, Profile, Score } from '@/lib/teaching-types'
import { SCORE_TYPES } from '@/lib/score-classification'
import { getScorePages } from '@/lib/score-pages'
import { ScoreEditor } from '@/components/practice/score-editor'
import { ScorePreview } from '@/components/practice/score-preview'
import { ScoreCover } from '@/components/practice/score-cover'
import { SemesterGoals } from '@/components/teaching/semester-goals'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const CATEGORY: Record<Score['category'], string> = { domestic: '国内', foreign: '国外' }

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h} 时 ${m} 分` : m ? `${m} 分 ${s} 秒` : `${s} 秒`
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body: unknown = await res.json()
  if (!res.ok) throw new Error(typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : '请求失败，请稍后重试')
  return body as T
}

export default function PracticePage() {
  return <Suspense fallback={<p className="py-12 text-center text-muted-foreground">正在打开曲谱库…</p>}><PracticeContent /></Suspense>
}

function PracticeContent() {
  const { user } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [scores, setScores] = useState<Score[]>([])
  const [queue, setQueue] = useState<Score[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null)
  const [category, setCategory] = useState('all')
  const [scoreType, setScoreType] = useState('all')
  const [period, setPeriod] = useState('all')
  const [editor, setEditor] = useState<{ score: Score | null } | null>(null)
  const [preview, setPreview] = useState<Score | null>(null)
  const [deleting, setDeleting] = useState<Score | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<PracticeRecord | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const isTeacher = user?.role === 'teacher'
  const activeTab = ['queue', 'history', ...(!isTeacher ? ['personal'] : [])].includes(searchParams.get('tab') ?? '') ? searchParams.get('tab')! : 'library'

  const load = useCallback(async () => {
    if (!user) return
    setError('')
    try {
      const id = encodeURIComponent(user.id)
      const [nextScores, nextQueue, nextRecords, profiles] = await Promise.all([
        api<Score[]>(`/api/scores?user_id=${id}`), api<Score[]>(`/api/practice-list?user_id=${id}`),
        api<PracticeRecord[]>(`/api/practice?user_id=${id}`),
        user.role === 'teacher' ? api<Profile[]>(`/api/profiles?user_id=${id}`) : Promise.resolve([]),
      ])
      setScores(nextScores)
      setQueue(nextQueue)
      setRecords(nextRecords)
      setClassNames([...new Set(profiles.filter(profile => profile.role === 'student').map(profile => profile.class_name).filter((name): name is string => !!name))].sort())
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '加载失败，请重试')
    } finally { setLoading(false) }
  }, [user])
  useEffect(() => { void load() }, [load])

  const queuedIds = useMemo(() => new Set(queue.map((score) => score.id)), [queue])
  const filtered = useMemo(() => (activeTab === 'queue' ? queue : scores).filter((score) =>
    (activeTab === 'queue' || (activeTab === 'personal' ? score.source === 'student' : score.source !== 'student')) && (category === 'all' || score.category === category) &&
    (scoreType === 'all' || score.score_type === scoreType) && (period === 'all' || score.period === period) &&
    (!query || `${score.title} ${score.composer}`.toLowerCase().includes(query.trim().toLowerCase()))
  ), [activeTab, queue, scores, category, scoreType, period, query])
  const selectedScore = filtered.find(score => score.id === selectedScoreId) ?? filtered[0] ?? null
  const periods = [...new Set([...scores, ...queue].map(score => score.period).filter((value): value is string => Boolean(value)))].sort()

  const toggleQueue = async (score: Score) => {
    if (!user) return
    setBusyId(score.id)
    const removing = queuedIds.has(score.id)
    try {
      await api('/api/practice-list', { method: removing ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, score_id: score.id }) })
      setQueue((all) => removing ? all.filter((s) => s.id !== score.id) : [...all, score])
      toast.success(removing ? '已移出我要练' : '已加入我要练')
    } catch (cause: unknown) { toast.error(cause instanceof Error ? cause.message : '操作失败') }
    finally { setBusyId(null) }
  }

  const deleteScore = async () => {
    if (!user || !deleting) return
    setBusyId(deleting.id)
    try {
      await api(`/api/scores/${deleting.id}?user_id=${user.id}`, { method: 'DELETE' })
      setDeleting(null)
      toast.success('琴谱已删除')
      await load()
    } catch (cause: unknown) { toast.error(cause instanceof Error ? cause.message : '删除失败') }
    finally { setBusyId(null) }
  }

  const deleteRecord = async () => {
    if (!user || !deletingRecord) return
    setBusyId(deletingRecord.id)
    try {
      await api(`/api/practice/${deletingRecord.id}?user_id=${user.id}`, { method: 'DELETE' })
      setRecords((all) => all.filter((r) => r.id !== deletingRecord.id))
      setDeletingRecord(null)
      toast.success('练习记录已删除')
    } catch (cause: unknown) { toast.error(cause instanceof Error ? cause.message : '删除失败') }
    finally { setBusyId(null) }
  }

  if (!user) return null

  return (
    <div className="repertoire-page @container min-w-0 space-y-6">
      <header className="repertoire-header">
        <div><p className="mb-2 text-xs tracking-[0.24em] text-primary">REPERTOIRE & PRACTICE</p><h1 className="font-serif text-3xl font-semibold text-foreground">曲库选谱</h1><p className="mt-2 text-sm text-muted-foreground">{isTeacher ? '整理课堂曲目，为每次练习留下一份清晰指引。' : '挑一首心仪的曲子，让今天的练习从这里开始。'}</p></div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => setEditor({ score: null })} className="gap-2"><Upload className="h-4 w-4" />{isTeacher ? '上传 / 批量上传' : '上传个人琴谱'}</Button>{!isTeacher && <Button asChild variant="outline" className="gap-2"><a href="https://imslp.org" target="_blank" rel="noopener noreferrer">查询曲库<ExternalLink className="h-4 w-4" /></a></Button>}</div>
      </header>
      {!isTeacher && <SemesterGoals userId={user.id} isTeacher={false} compact />}
      {!loading && activeTab !== 'history' && <section aria-label="选中曲目展示" className={`repertoire-hero${selectedScore ? '' : ' repertoire-hero-empty'}`}>
        <div className="repertoire-hero-image"><ScoreCover score={selectedScore ?? { title: '月光' }} priority /></div>
        <div className="repertoire-hero-copy">
          <p className="text-[11px] tracking-[.2em] text-primary">{selectedScore ? 'SELECTED REPERTOIRE' : 'YOUR MUSIC JOURNEY'}</p>
          <h2 aria-live="polite">{selectedScore?.title ?? '从一首心仪的曲子开始'}</h2>
          <p className="text-sm text-muted-foreground">{selectedScore?.composer ?? '上传个人琴谱，或从曲谱库选择曲目，开始今天的练习。'}</p>
          {selectedScore && <><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">{selectedScore.score_type ?? '类型未设置'}</Badge><Badge variant="outline">{selectedScore.period ?? '时期未设置'}</Badge></div>{selectedScore.tips && <p className="line-clamp-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{selectedScore.tips}</p>}<div className="mt-6 flex flex-wrap gap-2"><Button asChild><Link href={`/practice/session/${selectedScore.id}`}><Play className="size-4" />{isTeacher ? '试练' : '开始练习'}</Link></Button><Button variant="outline" disabled={busyId === selectedScore.id} onClick={() => void toggleQueue(selectedScore)}>{queuedIds.has(selectedScore.id) ? <Check className="size-4" /> : <Plus className="size-4" />}{queuedIds.has(selectedScore.id) ? '移出列表' : '我要练'}</Button><Button variant="ghost" onClick={() => setPreview(selectedScore)} aria-label={`查看选中曲目${selectedScore.title}琴谱`}><Eye className="size-4" /><span className="sr-only">查看琴谱</span></Button></div></>}
        </div>
        {selectedScore && <div className="repertoire-hero-cover-title" aria-hidden><strong>{selectedScore.title}</strong><span>{selectedScore.composer}</span></div>}
      </section>}
      <Tabs value={activeTab} onValueChange={(tab) => router.replace(tab === 'library' ? '/practice' : `/practice?tab=${tab}`, { scroll: false })} className="repertoire-tabs gap-6">
        <TabsList className="h-auto min-h-11 w-full flex-wrap justify-start sm:w-fit"><TabsTrigger value="library" className="gap-2 px-4"><BookOpen className="h-4 w-4" />琴谱库<span className="text-xs text-muted-foreground">{scores.filter(score => score.source !== 'student').length}</span></TabsTrigger><TabsTrigger value="queue" className="gap-2 px-4"><ListMusic className="h-4 w-4" />我要练<span className="text-xs text-muted-foreground">{queue.length}</span></TabsTrigger>{!isTeacher && <TabsTrigger value="personal" className="gap-2 px-4"><FileMusic className="h-4 w-4" />个人琴谱</TabsTrigger>}<TabsTrigger value="history" className="gap-2 px-4"><Clock3 className="h-4 w-4" />练习档案</TabsTrigger></TabsList>
        {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><p>{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>重新加载</Button></div>}
        {loading ? <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />正在载入琴谱…</div> : <>
          {activeTab !== 'history' && <div className="repertoire-filters">
            <div className="relative min-w-44 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索曲名或作曲家" className="pl-9" /></div>
            <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部分类</SelectItem><SelectItem value="domestic">国内</SelectItem><SelectItem value="foreign">国外</SelectItem></SelectContent></Select>
            <Select value={scoreType} onValueChange={setScoreType}><SelectTrigger aria-label="类型筛选" className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部类型</SelectItem>{SCORE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
            <Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label="时期筛选" className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部时期</SelectItem>{periods.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          </div>}
          {['library', 'queue', ...(!isTeacher ? ['personal'] : [])].map((tab) => <TabsContent key={tab} value={tab} className="min-w-0">
            {tab === 'personal' && <p className="mb-4 text-sm text-muted-foreground">个人上传仅本人可见，上传后自动加入「我要练」。</p>}
            <div className="grid gap-5 @min-[36rem]:grid-cols-2 @min-[58rem]:grid-cols-3">
              {filtered.map((score) => <article key={score.id} className={`repertoire-card group flex flex-col${selectedScore?.id === score.id ? ' is-selected' : ''}`}>
                <button type="button" onClick={() => setSelectedScoreId(score.id)} aria-label={`选择曲目${score.title}`} aria-pressed={selectedScore?.id === score.id} className="repertoire-card-cover">
                  <ScoreCover score={score} />
                  <span className="repertoire-cover-caption"><strong>{score.title}</strong><small>{score.composer}</small></span>
                  {selectedScore?.id === score.id && <Badge className="absolute left-3 top-3">已选中</Badge>}
                  {(isTeacher || score.source === 'student') && <Badge variant={score.published ? 'default' : 'secondary'} className="absolute right-3 top-3">{score.source === 'student' ? '仅本人可见' : score.published ? '已发布' : '未发布'}</Badge>}
                  {getScorePages(score).length > 1 && <Badge variant="secondary" className="absolute bottom-3 left-3">{getScorePages(score).length} 页琴谱</Badge>}
                </button>
                <div className="repertoire-card-body">
                  <div className="mb-3 flex flex-wrap gap-2"><Badge variant="secondary">{CATEGORY[score.category] ?? '待分类'}</Badge><Badge variant="outline" className="border-primary/30 text-primary">{score.score_type ?? '类型未设置'}</Badge><Badge variant="secondary">{score.period ?? '时期未设置'}</Badge></div>
                  <h2 className="font-serif text-xl font-medium text-foreground">{score.title}</h2><p className="mt-1 text-sm text-muted-foreground">{score.composer}</p>
                  {isTeacher && <p className="mt-2 text-xs text-muted-foreground">发布范围：{score.target_classes?.length ? score.target_classes.join('、') : '全部班级'}</p>}
                  {score.tips && <p className="mt-4 line-clamp-2 border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">{score.tips}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-5 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_a]:min-h-11 pointer-coarse:[&_button]:min-w-11">
                    <Button asChild size="sm" className="flex-1 gap-1.5"><Link href={`/practice/session/${score.id}`}><Play className="h-3.5 w-3.5" />{isTeacher ? '试练' : '开始练习'}</Link></Button>
                    <Button variant="outline" size="sm" disabled={busyId === score.id} onClick={() => void toggleQueue(score)} className="gap-1.5">{queuedIds.has(score.id) ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{queuedIds.has(score.id) ? '移出列表' : '我要练'}</Button>
                    <Button variant="ghost" size="icon" onClick={() => setPreview(score)} aria-label={`查看${score.title}`}><Eye className="h-4 w-4" /></Button>
                  </div>
                  {score.owner_id === user.id && <div className="mt-3 flex gap-4 border-t border-border pt-3"><button onClick={() => setEditor({ score })} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" />编辑 / 替换文件</button><button onClick={() => setDeleting(score)} className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" />删除</button></div>}
                </div>
              </article>)}
              {!filtered.length && <div className="col-span-full rounded-lg border border-dashed border-border py-16 text-center"><ListMusic className="mx-auto mb-4 h-9 w-9 text-primary/50" /><p className="text-sm text-muted-foreground">{activeTab === 'queue' ? '还没有待练曲目，在琴谱库点击「我要练」或上传个人琴谱即可加入。' : activeTab === 'personal' ? '暂无匹配的个人琴谱，可上传谱图开始练习。' : '暂无匹配的琴谱。'}</p>{activeTab === 'queue' && <Button variant="link" onClick={() => router.replace('/practice')}>前往琴谱库</Button>}</div>}
            </div>
            {!!filtered.length && <p className="repertoire-help mt-4">点击曲目封面，切换上方展示；点击查看图标阅读完整琴谱。</p>}
          </TabsContent>)}
          <TabsContent value="history" className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-xl">{isTeacher ? '学生练习档案' : '我的练习档案'}</h2><p className="mt-1 text-xs text-muted-foreground">每段琴声，都留下成长的痕迹。</p></div><Badge variant="outline" className="gap-2 border-primary/30 px-3 py-2 text-primary"><Clock3 className="h-4 w-4" />累计 {formatDuration(records.reduce((sum, r) => sum + r.duration_seconds, 0))}</Badge></div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground">{isTeacher && <th className="px-5 py-4 font-normal">学生</th>}<th className="px-5 py-4 font-normal">练习曲目</th><th className="px-5 py-4 font-normal">琴谱来源</th><th className="px-5 py-4 font-normal">日期 / 开始时间</th><th className="px-5 py-4 font-normal">有效时长</th><th className="px-5 py-4 font-normal">暂停</th><th className="px-5 py-4 font-normal">练习录音</th>{!isTeacher && <th className="px-5 py-4 font-normal">管理</th>}</tr></thead><tbody>{records.map((record) => { const linkedScore = record.score_id ? scores.find((item) => item.id === record.score_id) ?? queue.find((item) => item.id === record.score_id) : undefined; return <tr key={record.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">{isTeacher && <td className="whitespace-nowrap px-5 py-4">{record.profiles?.nickname ?? '—'}</td>}<td className="min-w-36 px-5 py-4 font-medium">{isTeacher ? record.piece_title : <div className="flex min-w-44 items-center gap-3">{linkedScore && <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-primary/20"><ScoreCover score={linkedScore} /></div>}<span>{record.piece_title}</span></div>}</td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{record.source === 'student' ? '自选上传' : '教师谱库'}</td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground"><span className="block">{record.practice_date}</span><span className="mt-1 block text-xs">{new Date(record.started_at).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></td><td className="whitespace-nowrap px-5 py-4 text-primary">{formatDuration(record.duration_seconds)}</td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{record.pause_count} 次</td><td className="px-5 py-4">{record.audio_url ? <audio controls preload="none" src={record.audio_url} className="h-8 w-52" /> : <span className="text-xs text-muted-foreground">未录音</span>}</td>{!isTeacher && <td className="px-5 py-4"><Button variant="ghost" size="icon" onClick={() => setDeletingRecord(record)} aria-label={`删除${record.piece_title}练习记录`}><Trash2 className="h-4 w-4" /></Button></td>}</tr>})}{!records.length && <tr><td colSpan={8} className="py-16 text-center text-muted-foreground">暂无练习记录，选择一首曲子开始练习吧。</td></tr>}</tbody></table></div>
          </TabsContent>
        </>}
      </Tabs>
      {editor && <ScoreEditor userId={user.id} score={editor.score} isTeacher={isTeacher} classNames={classNames} onClose={() => setEditor(null)} onSaved={() => void load()} />}
      {preview && <ScorePreview score={preview} onClose={() => setPreview(null)} />}
      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>删除琴谱</DialogTitle><DialogDescription>确认删除《{deleting?.title}》？已产生的练习记录会保留。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busyId === deleting?.id} onClick={() => void deleteScore()}>确认删除</Button></div></DialogContent></Dialog>
      <Dialog open={!!deletingRecord} onOpenChange={(open) => { if (!open) setDeletingRecord(null) }}><DialogContent><DialogHeader><DialogTitle>删除练习记录</DialogTitle><DialogDescription>确认删除《{deletingRecord?.piece_title}》的这次练习记录？</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeletingRecord(null)}>取消</Button><Button variant="destructive" disabled={busyId === deletingRecord?.id} onClick={() => void deleteRecord()}>确认删除</Button></div></DialogContent></Dialog>
    </div>
  )
}
