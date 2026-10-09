'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Pause, Play, Square, Music4, FileMusic, ZoomIn, ZoomOut, Maximize, X, GripHorizontal } from 'lucide-react'
import { toast } from 'sonner'

interface Score {
  id: string
  title: string
  composer: string
  difficulty: string
  tips: string | null
  image_url: string | null
  source: string
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function PracticeSessionPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useUser()
  const router = useRouter()

  const [score, setScore] = useState<Score | null>(null)
  const [elapsed, setElapsed] = useState(0) // 有效练习秒数（不含暂停）
  const [paused, setPaused] = useState(false)
  const [pauseCount, setPauseCount] = useState(0)
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [micDenied, setMicDenied] = useState(false)

  const startTimeRef = useRef<Date>(new Date())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // 加载琴谱信息
  useEffect(() => {
    fetch(`/api/scores?source=teacher`)
      .then((r) => r.json())
      .then((list: Score[]) => {
        const found = list.find((s) => s.id === id)
        if (found) setScore(found)
        else {
          // 可能在学生自己的谱里
          if (user) {
            fetch(`/api/scores?source=student&owner=${user.id}`)
              .then((r) => r.json())
              .then((mine: Score[]) => setScore(mine.find((s) => s.id === id) ?? null))
          }
        }
      })
      .catch(() => {})
  }, [id, user])

  // 进入页面自动开始计时 + 录音
  useEffect(() => {
    startTimeRef.current = new Date()
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s
        const rec = new MediaRecorder(s)
        chunksRef.current = []
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.start(1000)
        recorderRef.current = rec
        setRecording(true)
      })
      .catch(() => {
        setMicDenied(true)
        toast.warning('未获得麦克风权限，本次练习将不录音')
      })
    return () => {
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 计时器（暂停时不走）
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(t)
  }, [paused])

  const togglePause = useCallback(() => {
    setPaused((p) => {
      const next = !p
      const rec = recorderRef.current
      if (rec) {
        if (next && rec.state === 'recording') rec.pause()
        if (!next && rec.state === 'paused') rec.resume()
      }
      if (next) setPauseCount((c) => c + 1)
      return next
    })
  }, [])

  const finish = useCallback(async () => {
    if (!user || !score || saving) return
    setSaving(true)

    // 停止录音并上传
    const rec = recorderRef.current
    let audioUrl: string | null = null
    if (rec && rec.state !== 'inactive') {
      const stopped = new Promise<void>((resolve) => {
        rec.onstop = () => resolve()
      })
      rec.stop()
      await stopped
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      if (blob.size > 1000) {
        try {
          const fd = new FormData()
          fd.append('file', new File([blob], `practice_${Date.now()}.webm`, { type: blob.type }))
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          if (res.ok) audioUrl = (await res.json()).url
        } catch {
          toast.warning('录音上传失败，仅保存练习记录')
        }
      }
    }

    const res = await fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        score_id: score.id,
        piece_title: score.title,
        source: score.source,
        started_at: startTimeRef.current.toISOString(),
        duration_seconds: elapsed,
        pause_count: pauseCount,
        audio_url: audioUrl,
      }),
    })
    if (res.ok) {
      toast.success('练习记录已保存')
      router.replace('/practice')
    } else {
      toast.error('保存失败，请重试')
      setSaving(false)
    }
  }, [user, score, saving, elapsed, pauseCount, router])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between border-b border-border px-8 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Music4 className="h-5 w-5" />
          </div>
          <div>
            <div className="font-serif text-lg font-semibold text-foreground">
              {score?.title ?? '加载中…'}
            </div>
            <div className="text-xs text-muted-foreground">{score?.composer}</div>
          </div>
        </div>
        {/* 录音状态 */}
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
          {recording && !paused ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
              </span>
              <span className="text-foreground">录音中</span>
            </>
          ) : paused ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">已暂停</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
              <span className="text-muted-foreground">{micDenied ? '未录音' : '准备中'}</span>
            </>
          )}
        </div>
      </div>

      {/* 中部：计时器 + 谱面 */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
          {/* 大号计时器 */}
          <div className="text-center">
            <div className="font-mono text-7xl font-bold tabular-nums tracking-wider text-foreground md:text-8xl">
              {pad(h)}<span className="text-primary">:</span>{pad(m)}<span className="text-primary">:</span>{pad(s)}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              本次有效练习时长 · 已暂停 {pauseCount} 次
            </p>
          </div>
          {/* 控制按钮 */}
          <div className="flex items-center gap-4">
            <Button
              size="lg"
              variant="secondary"
              className="h-14 gap-2 rounded-full px-8 text-base"
              onClick={togglePause}
            >
              {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              {paused ? '继续练习' : '暂停'}
            </Button>
            <Button
              size="lg"
              className="h-14 gap-2 rounded-full px-8 text-base"
              onClick={finish}
              disabled={saving}
            >
              <Square className="h-5 w-5" />
              {saving ? '正在存档…' : '结束练习'}
            </Button>
          </div>
        </div>

        {/* 无谱面时的信息侧栏 */}
        {!score?.image_url && (
          <div className="hidden w-[420px] flex-col border-l border-border bg-card/40 md:flex">
            <div className="border-b border-border px-5 py-3 text-sm font-medium text-foreground">
              琴谱
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
                <Music4 className="mb-4 h-10 w-10 text-primary/50" />
                <p className="font-serif text-lg text-foreground">{score?.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{score?.composer}</p>
                {score?.tips && (
                  <div className="mt-6 rounded-lg bg-muted/50 p-4 text-left">
                    <div className="mb-1 text-xs font-medium text-primary">教学要点</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{score.tips}</p>
                  </div>
                )}
                <p className="mt-6 text-xs text-muted-foreground/60">
                  该曲目暂未上传谱面图片
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 悬浮谱面窗口：可拖动、可缩放 */}
      {score?.image_url && (
        <FloatingScore title={score.title} imageUrl={score.image_url} />
      )}
    </div>
  )
}

/** 可拖动 + 可缩放的悬浮谱面窗口 */
function FloatingScore({ title, imageUrl }: { title: string; imageUrl: string }) {
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [halfScreen, setHalfScreen] = useState(false)
  // 窗口拖动状态
  const winDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  // 谱面平移状态
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)
  const [panning, setPanning] = useState(false)

  const clampZoom = (z: number) => Math.min(4, Math.max(0.3, Number(z.toFixed(2))))

  // ---- 窗口拖动（标题栏） ----
  const onWinPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (halfScreen) return
    winDragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onWinPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = winDragRef.current
    if (!d) return
    setPos({ x: d.baseX + e.clientX - d.startX, y: d.baseY + e.clientY - d.startY })
  }
  const onWinPointerUp = () => {
    winDragRef.current = null
  }

  // ---- 谱面内容拖动平移 ----
  const onPanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    panDragRef.current = { startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPanning(true)
  }
  const onPanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = panDragRef.current
    if (!d) return
    setPan({ x: d.baseX + e.clientX - d.startX, y: d.baseY + e.clientY - d.startY })
  }
  const onPanPointerUp = () => {
    panDragRef.current = null
    setPanning(false)
  }

  const toggleHalfScreen = () => {
    setHalfScreen((v) => !v)
    setPos({ x: 0, y: 0 })
  }

  if (!open) {
    // 收起后保留一个悬浮入口按钮
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-full border border-primary/40 bg-card px-4 py-2.5 text-sm text-primary shadow-xl transition-transform hover:scale-105"
      >
        <FileMusic className="h-4 w-4" />
        打开琴谱
      </button>
    )
  }

  return (
    <div
      className={
        halfScreen
          ? 'fixed inset-y-0 right-0 z-[60] flex w-1/2 flex-col overflow-hidden border-l border-primary/30 bg-card shadow-2xl'
          : 'fixed bottom-6 right-6 z-[60] flex h-[70vh] w-[min(90vw,560px)] flex-col overflow-hidden rounded-xl border border-primary/30 bg-card shadow-2xl'
      }
      style={halfScreen ? undefined : { transform: `translate(${pos.x}px, ${pos.y}px)` }}
    >
      {/* 标题栏（拖动把手） */}
      <div
        className="flex cursor-grab touch-none items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 select-none active:cursor-grabbing"
        onPointerDown={onWinPointerDown}
        onPointerMove={onWinPointerMove}
        onPointerUp={onWinPointerUp}
        onPointerCancel={onWinPointerUp}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
        {/* 按钮区：阻止冒泡，避免触发窗口拖动 */}
        <div
          className="flex shrink-0 items-center gap-0.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - 0.25))}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + 0.25))}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleHalfScreen}
            className={`rounded p-1.5 hover:bg-muted ${
              halfScreen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={halfScreen ? '退出半屏' : '半屏显示'}
            title={halfScreen ? '退出半屏' : '半屏显示'}
          >
            <Maximize className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* 谱面内容区：拖拽平移 + 滚轮缩放（无需修饰键） */}
      <div
        className={`relative flex-1 touch-none overflow-hidden bg-muted/20 ${
          panning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
        onWheel={(e) => {
          setZoom((z) => clampZoom(z - Math.sign(e.deltaY) * 0.12))
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="max-w-[min(88vw,520px)] rounded-md select-none"
            draggable={false}
          />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          拖动谱面平移 · 滚轮缩放
        </div>
      </div>
    </div>
  )
}
