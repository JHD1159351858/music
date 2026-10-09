'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Play, Plus, Search, Trash2, Clock, Music4, Pencil, Upload } from 'lucide-react'
import { toast } from 'sonner'

interface Score {
  id: string
  title: string
  composer: string
  difficulty: string
  tips: string | null
  image_url: string | null
  source: string
  owner_id: string | null
}

interface PracticeRecord {
  id: string
  piece_title: string
  source: string
  practice_date: string
  duration_seconds: number
  pause_count: number
  audio_url: string | null
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: '初级',
  intermediate: '中级',
  advanced: '高级',
}

export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h} 时 ${m} 分`
  if (m > 0) return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

export default function PracticePage() {
  const { user } = useUser()
  const router = useRouter()
  const [scores, setScores] = useState<Score[]>([])
  const [myScores, setMyScores] = useState<Score[]>([])
  const [records, setRecords] = useState<PracticeRecord[]>([])
  const [q, setQ] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Score | null>(null)
  const [form, setForm] = useState({ title: '', composer: '', difficulty: 'beginner', tips: '', image_url: '' })
  const [uploading, setUploading] = useState(false)
  const [enteringId, setEnteringId] = useState<string | null>(null)

  const isTeacher = user?.role === 'teacher'

  const load = () => {
    if (!user) return
    fetch('/api/scores?source=teacher').then((r) => r.json()).then(setScores).catch(() => {})
    if (!isTeacher) {
      fetch(`/api/scores?source=student&owner=${user.id}`).then((r) => r.json()).then(setMyScores).catch(() => {})
      fetch(`/api/practice?user_id=${user.id}`).then((r) => r.json()).then(setRecords).catch(() => {})
    } else {
      fetch('/api/practice').then((r) => r.json()).then(setRecords).catch(() => {})
    }
  }
  useEffect(load, [user])

  const filtered = useMemo(
    () =>
      scores.filter(
        (s) =>
          (difficulty === 'all' || s.difficulty === difficulty) &&
          (!q || s.title.toLowerCase().includes(q.toLowerCase()))
      ),
    [scores, q, difficulty]
  )

  const startPractice = (score: Score) => {
    setEnteringId(score.id)
    // 1.2s 加载过渡动画后进入练习页
    setTimeout(() => router.push(`/practice/session/${score.id}`), 1200)
  }

  const submitScore = async () => {
    if (!user) return
    const payload = {
      ...form,
      image_url: form.image_url || null,
      source: isTeacher ? 'teacher' : 'student',
      owner_id: user.id,
    }
    const res = editing
      ? await fetch(`/api/scores/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    if (!res.ok) {
      toast.error('保存失败')
      return
    }
    toast.success(editing ? '已更新琴谱' : '已添加琴谱')
    setDialogOpen(false)
    setEditing(null)
    setForm({ title: '', composer: '', difficulty: 'beginner', tips: '', image_url: '' })
    load()
  }

  const uploadImage = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('图片不能超过 8MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      setForm((f) => ({ ...f, image_url: url }))
      toast.success('谱面图片已上传')
    } catch {
      toast.error('图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const removeScore = async (id: string) => {
    const res = await fetch(`/api/scores/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('已删除')
      load()
    }
  }

  const removeRecord = async (id: string) => {
    const res = await fetch(`/api/practice/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('练习记录已删除')
      load()
    }
  }

  if (!user) return null

  return (
    <div className="space-y-10">
      {/* 进入练习的过渡动画 */}
      {enteringId && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Music4 className="h-8 w-8 animate-pulse" />
            </div>
          </div>
          <p className="mt-6 font-serif text-lg text-foreground">正在准备琴谱…</p>
        </div>
      )}

      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">练琴记录</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTeacher
            ? '管理班级曲谱库，查看学生练习动态'
            : '从老师曲谱库选曲开始练习，计时与录音将自动进行'}
        </p>
      </header>

      {/* 曲谱库 */}
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-xl text-foreground">
            {isTeacher ? '班级曲谱库' : '老师曲谱库'}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索曲名…"
                className="w-48 pl-9"
              />
            </div>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部难度</SelectItem>
                <SelectItem value="beginner">初级</SelectItem>
                <SelectItem value="intermediate">中级</SelectItem>
                <SelectItem value="advanced">高级</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null) }}>
              <DialogTrigger asChild>
                <Button className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {isTeacher ? '上传琴谱' : '上传我的谱'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? '编辑琴谱' : '上传琴谱'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>曲名</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>作曲家</Label>
                    <Input value={form.composer} onChange={(e) => setForm({ ...form, composer: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>难度档</Label>
                    <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">初级</SelectItem>
                        <SelectItem value="intermediate">中级</SelectItem>
                        <SelectItem value="advanced">高级</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>教学要点（可选）</Label>
                    <Textarea value={form.tips} onChange={(e) => setForm({ ...form, tips: e.target.value })} rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>谱面图片（可选）</Label>
                    {form.image_url ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.image_url} alt="谱面预览" className="max-h-40 w-full rounded-lg border border-border object-cover" />
                        <button
                          onClick={() => setForm({ ...form, image_url: '' })}
                          className="absolute right-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive"
                        >
                          移除
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                        <Upload className="mb-2 h-5 w-5 text-primary/60" />
                        {uploading ? '上传中…' : '点击上传谱面图片'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) uploadImage(f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <Button className="w-full" onClick={submitScore} disabled={!form.title || !form.composer}>
                    保存
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {DIFFICULTY_LABEL[s.difficulty] ?? s.difficulty}
                </Badge>
                {(isTeacher || s.owner_id === user.id) && (
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditing(s)
                        setForm({ title: s.title, composer: s.composer, difficulty: s.difficulty, tips: s.tips ?? '', image_url: s.image_url ?? '' })
                        setDialogOpen(true)
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeScore(s.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.composer}</p>
              {s.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt={s.title} className="mt-3 h-28 w-full rounded-lg border border-border object-cover" />
              )}
              {s.tips && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/80">{s.tips}</p>}
              {!isTeacher && (
                <Button
                  className="mt-4 gap-1.5"
                  variant="secondary"
                  onClick={() => startPractice(s)}
                >
                  <Play className="h-4 w-4" />
                  开始练习
                </Button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-12 text-center text-muted-foreground">暂无匹配的琴谱</p>
          )}
        </div>
      </section>

      {/* 我的曲谱（学生） */}
      {!isTeacher && myScores.length > 0 && (
        <section>
          <h2 className="mb-4 font-serif text-xl text-foreground">我的曲谱</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {myScores.map((s) => (
              <div key={s.id} className="group flex flex-col rounded-xl border border-dashed border-border bg-card/60 p-5 transition-all hover:border-primary/40">
                <div className="flex items-start justify-between">
                  <Badge variant="outline">{DIFFICULTY_LABEL[s.difficulty] ?? s.difficulty}</Badge>
                  <button onClick={() => removeScore(s.id)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.composer}</p>
                <Button className="mt-4 gap-1.5" variant="secondary" onClick={() => startPractice(s)}>
                  <Play className="h-4 w-4" />
                  开始练习
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 练习历史 */}
      <section>
        <h2 className="mb-4 font-serif text-xl text-foreground">
          {isTeacher ? '全班练习动态' : '我的练习历史'}
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {isTeacher && <th className="px-5 py-3 font-medium">学生</th>}
                <th className="px-5 py-3 font-medium">曲目</th>
                <th className="px-5 py-3 font-medium">日期</th>
                <th className="px-5 py-3 font-medium">时长</th>
                <th className="px-5 py-3 font-medium">暂停</th>
                <th className="px-5 py-3 font-medium">录音</th>
                {!isTeacher && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {records.map((r: PracticeRecord & { profiles?: { nickname: string } }) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  {isTeacher && (
                    <td className="px-5 py-3 text-muted-foreground">{r.profiles?.nickname ?? '—'}</td>
                  )}
                  <td className="px-5 py-3 text-foreground">{r.piece_title}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.practice_date}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {formatDuration(r.duration_seconds)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{r.pause_count} 次</td>
                  <td className="px-5 py-3">
                    {r.audio_url ? (
                      <audio controls src={r.audio_url} className="h-8 w-44" />
                    ) : (
                      <span className="text-xs text-muted-foreground/60">无</span>
                    )}
                  </td>
                  {!isTeacher && (
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => removeRecord(r.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    暂无练习记录，点击「开始练习」留下第一段琴声
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
