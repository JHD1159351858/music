'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BookOpen, ExternalLink, Pause, Play, X } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import type { CourseKnowledge } from '@/lib/course-knowledge'
import { ChatPanel } from '@/components/chat-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { teachingApi, errorMessage } from '@/components/teaching/api'

export function openCourseAssistant() {
  window.dispatchEvent(new Event('zhiyin:open-assistant'))
}

function CourseMaterials() {
  const [entries, setEntries] = useState<CourseKnowledge[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try { setEntries(await teachingApi<CourseKnowledge[]>('/api/knowledge')) }
    catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  const term = query.trim().toLocaleLowerCase()
  const visible = entries.filter(entry => `${entry.title} ${entry.content} ${entry.keywords.join(' ')}`.toLocaleLowerCase().includes(term))

  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <div className="flex items-center gap-2"><Input aria-label="搜索课程资料" placeholder="搜索知识点、术语或乐曲…" value={query} onChange={event => setQuery(event.target.value)} /><Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>刷新</Button></div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
      {loading ? <p className="py-6 text-center text-sm text-muted-foreground">正在读取课程资料…</p> : error ? <p role="alert" className="py-6 text-sm text-destructive">{error} 请点击刷新重试。</p> : !visible.length ? <p className="py-6 text-center text-sm text-muted-foreground">{entries.length ? '未找到匹配的课程资料。' : '教师尚未收录课程资料。'}</p> : visible.map(entry => <article key={entry.id} className="rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-start gap-2 text-sm font-medium"><BookOpen className="mt-0.5 size-4 shrink-0 text-primary" />{entry.title}</h3>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{entry.content}</p>
        {!!entry.keywords.length && <p className="mt-3 text-xs text-muted-foreground">{entry.keywords.join(' · ')}</p>}
        {entry.source_url && <a className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline" href={entry.source_url} target="_blank" rel="noopener noreferrer">参考资料<ExternalLink className="size-3" /></a>}
      </article>)}
    </div>
  </div>
}

function StudentAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [visited, setVisited] = useState(false)
  const [motion, setMotion] = useState<'running' | 'paused' | 'reduced'>('running')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setMotion(preference.matches ? 'reduced' : 'running')
    sync()
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const show = () => { setVisited(true); setOpen(true) }
    window.addEventListener('zhiyin:open-assistant', show)
    return () => window.removeEventListener('zhiyin:open-assistant', show)
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('assistant') === '1') {
      setVisited(true)
      setOpen(true)
    }
  }, [pathname])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])

  return <>
    <div className="fixed right-4 bottom-24 z-50 md:right-6 md:bottom-6" data-motion={open || motion !== 'running' ? 'paused' : 'running'}>
    <Button ref={triggerRef} aria-label="打开知音课程助手" aria-expanded={open} aria-controls="course-assistant" onClick={() => { setVisited(true); setOpen(value => !value) }} className="course-assistant-trigger h-20 gap-3 rounded-full border border-primary/50 bg-card px-5 text-foreground shadow-lg hover:bg-muted md:h-24 md:px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/home/journey-robot.png" alt="" className="course-assistant-robot h-16 w-14 object-contain md:h-20 md:w-16" width={64} height={80} /><span className="text-base font-semibold md:text-lg">问知音</span>
    </Button>
    <Button variant="ghost" size="icon" className="absolute -right-1 -top-1 size-7 rounded-full border border-primary/30 bg-card text-muted-foreground hover:bg-muted" aria-label={motion === 'reduced' ? '系统已减少动态效果' : motion === 'running' ? '暂停知音动效' : '开启动效'} title={motion === 'reduced' ? '系统已开启减少动态效果' : motion === 'running' ? '暂停知音动效' : '开启动效'} aria-pressed={motion !== 'running'} disabled={motion === 'reduced'} onClick={() => setMotion(current => current === 'running' ? 'paused' : 'running')}>{motion === 'running' ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button>
    </div>
    {visited && <section id="course-assistant" role="dialog" aria-modal="false" aria-labelledby="course-assistant-title" aria-describedby="course-assistant-description" className={`${open ? 'flex' : 'hidden'} fixed right-3 bottom-48 z-50 h-[min(620px,calc(100dvh-13rem))] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-primary/30 bg-background shadow-xl md:right-6 md:bottom-36 md:h-[min(640px,calc(100dvh-10rem))]`}>
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3"><div><h2 id="course-assistant-title" className="font-serif text-lg text-primary">知音课程助手</h2><p id="course-assistant-description" className="mt-1 text-xs text-muted-foreground">查阅课程资料，随时提问；未收录内容会提示超出范围。</p></div><Button ref={closeRef} variant="ghost" size="icon" aria-label="收起知音课程助手" onClick={close}><X className="size-4" /></Button></header>
      <Tabs defaultValue="chat" className="min-h-0 flex-1 gap-3 p-3">
        <TabsList className="w-full"><TabsTrigger className="flex-1" value="chat">课程答疑</TabsTrigger><TabsTrigger className="flex-1" value="materials">课程资料</TabsTrigger></TabsList>
        <TabsContent forceMount value="chat" className="min-h-0 flex-1 data-[state=inactive]:hidden"><ChatPanel className="h-full" placeholder="围绕课程内容向知音提问…" /></TabsContent>
        <TabsContent value="materials" className="min-h-0 flex-1 flex flex-col"><CourseMaterials /></TabsContent>
      </Tabs>
    </section>}
  </>
}

export function CourseAssistant() {
  const { user } = useUser()
  return user?.role === 'student' ? <StudentAssistant key={user.id} /> : null
}
