'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, type DemoUser } from '@/lib/user-context'
import { Music, GraduationCap, BookOpen } from 'lucide-react'

export default function LandingPage() {
  const { user, loading, login } = useUser()
  const router = useRouter()
  const [students, setStudents] = useState<DemoUser[]>([])
  const [teacher, setTeacher] = useState<DemoUser | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && user) router.replace('/practice')
  }, [loading, user, router])

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((data: DemoUser[]) => {
        setStudents(data.filter((p) => p.role === 'student'))
        setTeacher(data.find((p) => p.role === 'teacher') ?? null)
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [])

  const enter = (u: DemoUser) => {
    login(u)
    router.replace('/practice')
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* 舞台光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative z-10 w-full max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary">
          <Music className="h-4 w-4" />
          以乐会友 · 以琴知音
        </div>
        <h1 className="font-serif text-6xl font-bold tracking-wide text-foreground md:text-7xl">
          知<span className="text-primary">音</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          练琴记录 · 乐谱分析 · 练琴社区 · 音乐史地图 · 数据分析
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          请选择身份进入（演示模式）
        </p>

        {fetching ? (
          <p className="mt-16 text-muted-foreground">正在加载身份…</p>
        ) : (
          <div className="mt-12 grid gap-8 md:grid-cols-2">
            {/* 教师入口 */}
            <div className="rounded-xl border border-border bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40">
              <div className="mb-4 flex items-center gap-2 text-primary">
                <GraduationCap className="h-5 w-5" />
                <span className="font-medium">教师入口</span>
              </div>
              {teacher && (
                <button
                  onClick={() => enter(teacher)}
                  className="w-full rounded-lg border border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="font-serif text-lg text-foreground">{teacher.nickname}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    琴谱库管理 · 全班数据分析 · 回课指导
                  </span>
                </button>
              )}
            </div>
            {/* 学生入口 */}
            <div className="rounded-xl border border-border bg-card p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40">
              <div className="mb-4 flex items-center gap-2 text-primary">
                <BookOpen className="h-5 w-5" />
                <span className="font-medium">学生入口</span>
              </div>
              <div className="grid gap-2">
                {students.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => enter(s)}
                    className="rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="text-foreground">{s.nickname}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
