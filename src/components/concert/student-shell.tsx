'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { BarChart3, BookOpen, ClipboardList, FileMusic, House, LogOut, Map, MessagesSquare, Music2, UserRound } from 'lucide-react'
import { useUser } from '@/lib/user-context'
import { UserProfile } from '@/components/auth/user-profile'
import { cn } from '@/lib/utils'

const navigation = [
  { href: '/', label: '知音首页', icon: House },
  { href: '/practice', label: '琴谱与练习', icon: BookOpen },
  { href: '/analysis', label: '乐谱分析', icon: FileMusic },
  { href: '/tasks', label: '练习任务与评阅', icon: ClipboardList },
  { href: '/community', label: '练琴社区', icon: MessagesSquare },
  { href: '/map', label: '音乐史地图', icon: Map },
  { href: '/stats', label: '练琴数据', icon: BarChart3 },
]

export function StudentShell({ children, onNavigate }: { children: React.ReactNode; onNavigate?: (href: string) => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useUser()
  const [error, setError] = useState('')
  const isMap = pathname === '/map'
  async function leave() {
    try { await logout(); router.replace('/') }
    catch (failure: unknown) { setError(failure instanceof Error ? failure.message : '退出登录失败，请重试。') }
  }
  return <div className={cn('concert-student', isMap && 'concert-student-map')}>
    <aside className="concert-sidebar">
      <Link href="/" className="concert-brand"><span className="concert-brand-mark"><Music2 className="size-5" /></span><span><strong>知音</strong><small>MUSIC COMPANION</small></span></Link>
      <nav aria-label="课堂导航" className="concert-navigation">{navigation.map(item => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('concert-nav-link', active && 'is-active')} onClick={event => { if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(item.href) } }}><item.icon className="size-[18px] shrink-0" /><span>{item.label}</span></Link>
      })}</nav>
      <div className="concert-sidebar-account">
        <p className="truncate text-sm font-medium">{user?.display_name ?? '欢迎来到知音'}</p><p className="mt-1 text-xs text-muted-foreground">{user ? user.role === 'teacher' ? '教师' : '学生' : '让每次练习更有回响'}</p>
        {user ? <><UserProfile user={user}><button className="concert-account-action"><UserRound className="size-4" />我的资料</button></UserProfile><button className="concert-account-action" onClick={() => void leave()}><LogOut className="size-4" />退出登录</button></> : <button className="concert-account-action" onClick={() => onNavigate ? onNavigate('/practice') : router.push('/?login=1')}><UserRound className="size-4" />登录课堂</button>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </aside>
    <header className="concert-mobile-header"><Link href="/" className="flex items-center gap-2 font-serif text-lg"><Music2 className="size-5 text-primary" />知音</Link><div className="flex items-center gap-4">{user ? <><UserProfile user={user}><button aria-label="我的资料" className="text-muted-foreground"><UserRound className="size-5" /></button></UserProfile><button aria-label="退出登录" onClick={() => void leave()} className="text-muted-foreground"><LogOut className="size-5" /></button></> : <button onClick={() => onNavigate ? onNavigate('/practice') : router.push('/?login=1')} className="text-sm text-primary">登录课堂</button>}</div></header>
    <main className="concert-main"><div className="concert-content">{children}</div></main>
  </div>
}
