'use client'

import Link from 'next/link'
import { useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Music2, ClipboardList, ClipboardCheck, Users, CalendarRange, BookOpen, MessagesSquare, Timer, Map, House, LogOut, Menu, ChevronRight, GraduationCap } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { UserProfile } from '@/components/auth/user-profile'
import { useUser } from '@/lib/user-context'
import { cn } from '@/lib/utils'

const navigation = [
  { href: '/teacher', label: '教学概览', icon: LayoutDashboard },
  { href: '/teacher/scores', label: '琴谱管理', icon: Music2 },
  { href: '/teacher/tasks', label: '练习任务', icon: ClipboardList },
  { href: '/teacher/reviews', label: '提交评阅', icon: ClipboardCheck },
  { href: '/teacher/students', label: '学生班级', icon: Users },
  { href: '/teacher/semesters', label: '学期目标', icon: CalendarRange },
  { href: '/teacher/knowledge', label: '课程知识', icon: BookOpen },
  { href: '/teacher/community', label: '社区管理', icon: MessagesSquare },
  { href: '/teacher/records', label: '练习记录', icon: Timer },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useUser()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const previous = document.body.dataset.teacherAdmin
    const wasDark = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    document.body.dataset.teacherAdmin = 'true'
    return () => { if (previous === undefined) delete document.body.dataset.teacherAdmin; else document.body.dataset.teacherAdmin = previous; if (wasDark) document.documentElement.classList.add('dark') }
  }, [])
  const active = navigation.find(item => item.href === '/teacher' ? pathname === '/teacher' : pathname.startsWith(item.href))
  const title = active?.label ?? '音乐史地图'
  async function leave() {
    try { await logout(); router.replace('/') } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : '退出失败，请重试') }
  }
  function sidebar() {
    return <div className="teacher-sidebar flex h-full flex-col">
      <Link href="/teacher" onClick={() => setOpen(false)} className="flex items-center gap-3 px-6 py-7"><div className="flex size-10 items-center justify-center rounded-xl border border-sidebar-border text-sidebar-primary"><Music2 className="size-6" /></div><div><div className="text-xl font-semibold tracking-[0.12em]">知音</div><div className="mt-0.5 text-[10px] tracking-[0.15em] text-sidebar-foreground/50">教师管理后台</div></div></Link>
      <div className="px-6 pb-3 text-[10px] tracking-widest text-sidebar-foreground/40">教学管理</div>
      <nav aria-label="教师管理导航" className="flex-1 space-y-1 overflow-y-auto px-3">{navigation.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={active?.href === item.href ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors', active?.href === item.href ? 'bg-sidebar-accent font-medium text-sidebar-primary' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground')}><item.icon className="size-[18px]" />{item.label}</Link>)}
        <div className="px-4 pb-1 pt-6 text-[10px] tracking-widest text-sidebar-foreground/40">教学工具</div><Link href="/map" onClick={() => setOpen(false)} className={cn('flex items-center gap-3 rounded-lg px-4 py-3 text-sm', pathname === '/map' ? 'bg-sidebar-accent text-sidebar-primary' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent')}><Map className="size-[18px]" />音乐史地图</Link>
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-3"><Link href="/" className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-sidebar-foreground/65 hover:bg-sidebar-accent"><House className="size-4" />返回知音首页</Link><button onClick={() => void leave()} className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm text-sidebar-foreground/65 hover:bg-sidebar-accent"><LogOut className="size-4" />退出登录</button>{error && <p role="alert" className="px-4 text-xs text-sidebar-primary">{error}</p>}</div>
    </div>
  }
  return <div className="teacher-admin min-h-screen bg-background font-sans text-foreground">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">{sidebar()}</aside>
    <div className="min-w-0 lg:ml-60">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button aria-label="打开管理导航" variant="ghost" size="icon" className="lg:hidden"><Menu className="size-5" /></Button></SheetTrigger><SheetContent side="left" className="teacher-sidebar w-60 border-sidebar-border p-0"><SheetTitle className="sr-only">教师管理导航</SheetTitle><SheetDescription className="sr-only">选择教学管理模块，或返回知音首页。</SheetDescription>{sidebar()}</SheetContent></Sheet><nav aria-label="面包屑" className="flex items-center gap-2 truncate text-sm"><Link href="/teacher" className="hidden text-muted-foreground sm:inline">教师工作台</Link><ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" /><span>{title}</span>{pathname.startsWith('/teacher/tasks/') && <><ChevronRight className="size-3.5 text-muted-foreground" /><span className="text-muted-foreground">任务详情</span></>}</nav></div>
        <div className="flex shrink-0 items-center gap-3"><span className="hidden rounded-md bg-primary/8 px-2 py-1 text-[11px] text-primary sm:inline">教师端</span>{user && <UserProfile user={user}><Button variant="ghost" className="gap-2 px-2" aria-label="查看我的资料"><span className="flex size-8 items-center justify-center rounded-full bg-muted text-primary"><GraduationCap className="size-4" /></span><span className="max-w-32 truncate text-sm font-medium">{user.display_name}</span></Button></UserProfile>}</div>
      </header>
      <main className="mx-auto max-w-[1680px] p-4 md:p-8">{children}</main>
    </div>
  </div>
}
