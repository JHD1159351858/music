'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FileMusic, Loader2, Maximize, MicOff, Minimize, Pause, Play, RotateCcw, Sparkles, Square, X, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/lib/user-context'
import type { Score } from '@/lib/teaching-types'
import { getScorePages } from '@/lib/score-pages'
import { Button } from '@/components/ui/button'
import { ChatPanel } from '@/components/chat-panel'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { savePracticeDraft, type PracticeSaveDraft } from '@/components/practice/practice-save'
import { ScoreViewport, type ScoreViewportPage } from '@/components/practice/score-viewport'
import { ScorePageNavigation } from '@/components/practice/score-page-navigation'
import { ScoreCover } from '@/components/practice/score-cover'
import { getScoreSpread, INITIAL_SCORE_VIEW, MAX_SCORE_ZOOM, MIN_SCORE_ZOOM, zoomScoreAt, type ScoreSpreadSize, type ScoreView } from '@/components/practice/score-viewport-math'

type MicStatus = 'preparing' | 'recording' | 'denied' | 'stopped'
const pad = (n: number) => String(n).padStart(2, '0')

async function jsonResponse<T>(res: Response): Promise<T> {
  const data: unknown = await res.json()
  if (!res.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : '请求失败，请重试')
  return data as T
}

export default function PracticeSessionPage() {
  return <Suspense fallback={<p className="py-12 text-center text-muted-foreground">正在准备练习…</p>}><PracticeSession /></Suspense>
}

function PracticeSession() {
  const { id } = useParams<{ id: string }>()
  const { user } = useUser()
  const router = useRouter()
  const params = useSearchParams()
  const taskId = params.get('task_id')
  const [score, setScore] = useState<Score | null>(null)
  const [loadError, setLoadError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pauseCount, setPauseCount] = useState(0)
  const [mic, setMic] = useState<MicStatus>('preparing')
  const [micError, setMicError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ended, setEnded] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [scoreView, setScoreView] = useState(INITIAL_SCORE_VIEW)
  const [rightScoreView, setRightScoreView] = useState(INITIAL_SCORE_VIEW)
  const [pageIndex, setPageIndex] = useState(0)
  const [spreadSize, setSpreadSize] = useState<ScoreSpreadSize>(1)
  const [scoreFocused, setScoreFocused] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const micGenerationRef = useRef(0)
  const pausedRef = useRef(false)
  const endedRef = useRef(false)
  const savingRef = useRef(false)
  const clockRef = useRef({ startedAt: '', runningSince: 0, accumulatedMs: 0, recordId: '' })
  const saveDraftRef = useRef<PracticeSaveDraft>({ audioBlob: null, audioUrl: null, audioFileId: null, recordId: null })
  const cancelMicRequest = useCallback(() => { micGenerationRef.current += 1 }, [])
  const resetScoreViews = useCallback(() => {
    setScoreView(INITIAL_SCORE_VIEW)
    setRightScoreView(INITIAL_SCORE_VIEW)
  }, [])

  const pages = score ? getScorePages(score) : []
  const page = pages[pageIndex] ?? pages[0]
  const pdf = page?.file_type === 'application/pdf' || /\.pdf(?:\?|$)/i.test(page?.file_name ?? page?.image_url ?? '')
  const size = pdf ? 1 : spreadSize
  const { start, end, previous, next } = getScoreSpread(pageIndex, pages.length, size)
  const doubleView = end - start === 2 && Boolean(pages[start]?.image_url && pages[start + 1]?.image_url)

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    fetch(`/api/scores/${id}?user_id=${user.id}`, { signal: controller.signal })
      .then((res) => jsonResponse<Score>(res))
      .then((loaded) => { setScore(loaded); setPageIndex(0); resetScoreViews() })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : '琴谱加载失败')
      })
    return () => controller.abort()
  }, [id, user, resetScoreViews])

  const startMic = useCallback(async () => {
    if (endedRef.current) return
    const generation = ++micGenerationRef.current
    setMic('preparing')
    setMicError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持在线录音，请使用支持麦克风的浏览器。')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (generation !== micGenerationRef.current || endedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (event: BlobEvent) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onerror = () => { setMic('denied'); setMicError('录音发生错误，可重新启用麦克风。') }
      recorder.start(1000)
      if (pausedRef.current) recorder.pause()
      setMic('recording')
    } catch (cause: unknown) {
      if (generation !== micGenerationRef.current) return
      setMic('denied')
      setMicError(cause instanceof Error && cause.name !== 'NotAllowedError' ? cause.message : '未获得麦克风权限。允许访问后可重新启用，计时仍会保留。')
    }
  }, [])

  useEffect(() => {
    if (!score) return
    const now = Date.now()
    clockRef.current = { startedAt: new Date(now).toISOString(), runningSince: now, accumulatedMs: 0, recordId: crypto.randomUUID() }
    endedRef.current = false
    pausedRef.current = false
    void startMic()
    const interval = setInterval(() => {
      if (endedRef.current || pausedRef.current) return
      const clock = clockRef.current
      setElapsed(Math.floor((clock.accumulatedMs + Date.now() - clock.runningSince) / 1000))
    }, 250)
    return () => {
      clearInterval(interval)
      cancelMicRequest()
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [score, startMic, cancelMicRequest])

  useEffect(() => {
    if (!scoreFocused) return
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setScoreFocused(false)
      if (!doubleView) resetScoreViews()
    }
    document.addEventListener('keydown', exit)
    return () => document.removeEventListener('keydown', exit)
  }, [scoreFocused, doubleView, resetScoreViews])

  const togglePause = () => {
    if (endedRef.current) return
    const next = !pausedRef.current
    const clock = clockRef.current
    if (next) {
      clock.accumulatedMs += Date.now() - clock.runningSince
      clock.runningSince = 0
      setPauseCount((count) => count + 1)
      setElapsed(Math.floor(clock.accumulatedMs / 1000))
    } else { clock.runningSince = Date.now() }
    pausedRef.current = next
    setPaused(next)
    const recorder = recorderRef.current
    if (next && recorder?.state === 'recording') recorder.pause()
    if (!next && recorder?.state === 'paused') recorder.resume()
  }

  const captureRecording = async () => {
    if (saveDraftRef.current.audioBlob) return
    const recorder = recorderRef.current
    ++micGenerationRef.current
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.stop()
      })
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' })
    if (blob.size) saveDraftRef.current.audioBlob = blob
    setMic('stopped')
  }

  const finish = async () => {
    if (!user || !score || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    setLeaveOpen(false)
    const clock = clockRef.current
    if (!endedRef.current) {
      if (!pausedRef.current) clock.accumulatedMs += Date.now() - clock.runningSince
      clock.runningSince = 0
      endedRef.current = true
      setEnded(true)
      setElapsed(Math.floor(clock.accumulatedMs / 1000))
    }
    try {
      await captureRecording()
      const recordId = await savePracticeDraft(saveDraftRef.current, async (blob) => {
        const body = new FormData()
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        body.append('file', new File([blob], `practice_${clock.recordId}.${extension}`, { type: blob.type }))
        body.append('user_id', user.id)
        return jsonResponse<{ url: string; fileId: string }>(await fetch('/api/upload', { method: 'POST', body }))
      }, async (audio) => jsonResponse<{ id: string }>(await fetch('/api/practice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: clock.recordId, user_id: user.id, score_id: score.id, piece_title: score.title, source: score.source,
          started_at: clock.startedAt, duration_seconds: Math.floor(clock.accumulatedMs / 1000), pause_count: pauseCount, ...audio }),
      })))
      toast.success(saveDraftRef.current.audioUrl ? '练习与录音已存档' : '练习记录已存档（本次未录音）')
      router.replace(taskId ? `/tasks/${encodeURIComponent(taskId)}?record_id=${encodeURIComponent(recordId)}` : '/practice?tab=history')
    } catch (cause: unknown) {
      setSaveError(cause instanceof Error ? cause.message : '保存失败，请重试')
      toast.error('存档未完成，录音保留在当前页面，可重试保存')
      savingRef.current = false
      setSaving(false)
    }
  }

  const toggleScoreFocus = () => {
    setScoreFocused((focused) => !focused)
    if (!doubleView) resetScoreViews()
    setAssistantOpen(false)
  }

  const leave = async () => {
    endedRef.current = true
    ++micGenerationRef.current
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    router.replace(taskId ? `/tasks/${encodeURIComponent(taskId)}` : '/practice')
  }

  const changePage = useCallback((index: number) => { setPageIndex(index); resetScoreViews() }, [resetScoreViews])
  const spreadPages = (from: number | null, to: number): ScoreViewportPage[] => from === null ? [] : pages.slice(from, to).flatMap((item, offset) => item.image_url ? [{
    src: item.image_url,
    alt: `${score?.title}${pages.length > 1 ? `第 ${from + offset + 1} 页` : ''}完整琴谱`,
  }] : [])
  const time = `${pad(Math.floor(elapsed / 3600))}:${pad(Math.floor((elapsed % 3600) / 60))}:${pad(elapsed % 60)}`

  if (loadError) return <div className="space-y-4 py-16 text-center"><p role="alert" className="text-destructive">{loadError}</p><Button onClick={() => router.replace('/practice')}>返回琴谱库</Button></div>

  const zoomControls = (view: ScoreView, setView: Dispatch<SetStateAction<ScoreView>>, side?: '左页' | '右页') => <div role="group" aria-label={side ? `${side}缩放` : '谱面缩放'} className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-1">
    {side && <span className="pl-1 text-xs text-muted-foreground">{side}</span>}
    <Button variant="ghost" size={side ? 'icon-sm' : 'icon'} aria-label={`缩小${side ?? ''}谱面`} onClick={() => setView(current => zoomScoreAt(current, current.zoom - 0.25, { x: 0, y: 0 }))} disabled={view.zoom <= MIN_SCORE_ZOOM}><ZoomOut className="h-4 w-4" /></Button>
    <button type="button" onClick={() => setView(INITIAL_SCORE_VIEW)} aria-label={side ? `${side}适应半屏` : undefined} className={`flex flex-col items-center px-1 py-1 text-xs text-muted-foreground ${side ? 'min-w-12' : 'min-w-20'}`} title={side ? `完整显示${side}并居中` : '完整显示曲谱并居中'}>
      <span>{side ? '适应' : '适应屏幕'}</span><span className="font-mono text-[10px] tabular-nums">{Math.round(view.zoom * 100)}%</span>
    </button>
    <Button variant="ghost" size={side ? 'icon-sm' : 'icon'} aria-label={`放大${side ?? ''}谱面`} onClick={() => setView(current => zoomScoreAt(current, current.zoom + 0.25, { x: 0, y: 0 }))} disabled={view.zoom >= MAX_SCORE_ZOOM}><ZoomIn className="h-4 w-4" /></Button>
  </div>
  const scoreZoomControls = doubleView ? <>{zoomControls(scoreView, setScoreView, '左页')}{zoomControls(rightScoreView, setRightScoreView, '右页')}</> : zoomControls(scoreView, setScoreView)
  const pageControls = <>
    <ScorePageNavigation index={pageIndex} count={pages.length} size={size} onChange={changePage} />
    {!pdf && pages.length > 1 && <div role="group" aria-label="琴谱显示模式" className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
      {([1, 2] as const).map(mode => <Button key={mode} type="button" size="sm" variant={size === mode ? 'secondary' : 'ghost'} aria-pressed={size === mode} onClick={() => {
        if (mode !== size) { setSpreadSize(mode); resetScoreViews() }
      }}>{mode === 1 ? '单页' : '双页'}</Button>)}
    </div>}
  </>

  return (
    <div className={`fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-background text-foreground ${user?.role === 'student' ? 'concert-practice' : ''}`}>
      <header className={`concert-practice-header ${scoreFocused ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 md:px-6`}>
        <Button variant="ghost" size="icon" disabled={saving} onClick={() => setLeaveOpen(true)} aria-label="返回琴谱库"><ArrowLeft className="h-5 w-5" /></Button>
        {score && user?.role === 'student' && <ScoreCover score={score} className="concert-practice-cover" />}
        <div className="min-w-0 flex-1 basis-3/4 sm:basis-auto"><h1 className="truncate font-serif text-lg font-semibold">{score?.title ?? '正在准备琴谱…'}</h1><p className="truncate text-xs text-muted-foreground">{score?.composer}{score && ` · ${score.score_type ?? '类型未设置'} · ${score.period ?? '时期未设置'}`}{taskId ? ' · 任务练习' : ' · 沉浸练习'}</p></div>
        {pageControls}
        {scoreZoomControls}
        <Button variant="outline" size="sm" aria-label="全屏看谱" onClick={toggleScoreFocus} className="gap-2"><Maximize className="h-4 w-4" /><span className="hidden sm:inline">全屏看谱</span></Button>
        <Button variant={assistantOpen ? 'secondary' : 'ghost'} size="sm" onClick={() => setAssistantOpen((v) => !v)} className="gap-2"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">AI 助教</span></Button>
      </header>
      {!scoreFocused && score?.tips && <div className="shrink-0 border-b border-border bg-primary/5 px-5 py-2 text-xs leading-relaxed text-primary">教师提醒：{score.tips}</div>}
      <div className="relative flex min-h-0 flex-1">
        <section aria-label="琴谱显示区域" className="concert-score-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/20">
          {scoreFocused && <div role="toolbar" aria-label="全屏看谱控制" className="z-20 m-2 flex shrink-0 flex-wrap items-center justify-end gap-2 self-end rounded-lg bg-card/95 p-1 shadow-sm">{pageControls}{scoreZoomControls}<Button variant="outline" size="sm" onClick={toggleScoreFocus} className="gap-2" title="退出全屏看谱（Esc）"><Minimize className="h-4 w-4" />退出全屏</Button></div>}
          <div className="min-h-0 flex-1">
          {!score ? <div className="flex h-full items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />正在加载琴谱…</div> : page?.image_url ? pdf ? <iframe src={`${page.image_url.split('#')[0]}#${scoreView.zoom === 1 ? 'view=Fit&zoom=page-fit' : `zoom=${Math.round(scoreView.zoom * 100)}`}`} title={`${score.title}完整 PDF 琴谱`} className="h-full min-h-full w-full border-0" /> : <ScoreViewport key={`${score.id}-${start}-${size}`} spread={{
            current: spreadPages(start, end),
            previous: spreadPages(previous, start),
            next: spreadPages(next, end + size),
            onTurn: direction => {
              const destination = direction === 1 ? next : previous
              if (destination !== null) changePage(destination)
            },
          }} view={scoreView} onChange={setScoreView} rightPane={doubleView ? { view: rightScoreView, onChange: setRightScoreView } : undefined} /> : <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 p-8 text-center"><FileMusic className="h-14 w-14 text-primary/40" /><h2 className="font-serif text-2xl">{score.title}</h2><p className="max-w-md text-sm leading-relaxed text-muted-foreground">该曲目暂未上传谱面文件。可继续计时练习，或请教师补充琴谱。</p></div>}
          </div>
        </section>
        {assistantOpen && <aside className="absolute inset-y-0 right-0 z-10 flex w-80 max-w-full flex-col border-l border-border bg-background p-3 shadow-xl md:static md:w-96 md:shrink-0"><div className="mb-2 flex items-center justify-between text-sm"><span className="text-primary">知音 · AI 助教</span><Button variant="ghost" size="icon" onClick={() => setAssistantOpen(false)} aria-label="关闭 AI 助教"><X className="h-4 w-4" /></Button></div><ChatPanel className="min-h-0 flex-1" context={{ kind: 'score', name: score?.title }} placeholder="询问指法、节奏与练习方法…" /></aside>}
      </div>
      {!scoreFocused && micError && !ended && <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-2"><p className="text-xs text-muted-foreground">{micError}</p><Button size="sm" variant="outline" onClick={() => void startMic()} className="shrink-0 gap-2"><RotateCcw className="h-3.5 w-3.5" />启用录音</Button></div>}
      {saveError && <div role="alert" className="shrink-0 border-t border-destructive/30 bg-destructive/5 px-5 py-3 text-sm text-destructive">存档未完成：{saveError}。练习已停止计时，录音仍保留在当前页面，请点击「重试保存」。</div>}
      <footer className={`concert-practice-footer ${scoreFocused ? 'hidden' : 'flex'} shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 md:px-6`}>
        <div className="flex items-center gap-5"><div><p className="text-[10px] tracking-wider text-muted-foreground">有效练习时长</p><div role="timer" aria-label="有效练习时长" className="font-mono text-3xl font-semibold tabular-nums tracking-wide text-primary">{time}</div></div><div className="space-y-1"><p className="flex items-center gap-2 text-sm">{mic === 'recording' && !ended ? <><span className={`h-2 w-2 rounded-full ${paused ? 'bg-primary' : 'animate-pulse bg-destructive'}`} />{paused ? '录音暂停' : '正在录音'}</> : <><MicOff className="h-4 w-4 text-muted-foreground" />{ended ? '已结束' : mic === 'preparing' ? '准备录音…' : '未录音'}</>}</p><p className="text-[10px] text-muted-foreground">{paused && !ended ? '计时已暂停' : `已暂停 ${pauseCount} 次`}</p></div></div>
        <div className="flex items-center gap-2"><Button variant="outline" onClick={togglePause} disabled={!score || ended || saving} className="gap-2">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? '继续' : '暂停'}</Button><Button onClick={() => void finish()} disabled={!score || saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveError ? <RotateCcw className="h-4 w-4" /> : <Square className="h-4 w-4" />}{saving ? '正在存档…' : saveError ? '重试保存' : '结束并保存'}</Button></div>
      </footer>
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}><DialogContent><DialogHeader><DialogTitle>本次练习尚未存档</DialogTitle><DialogDescription>返回将放弃当前录音与计时。如需保留，请结束并保存。</DialogDescription></DialogHeader><div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setLeaveOpen(false)}>继续练习</Button><Button variant="outline" onClick={() => void leave()}>放弃并返回</Button><Button onClick={() => void finish()} disabled={!score}>结束并保存</Button></div></DialogContent></Dialog>
    </div>
  )
}
