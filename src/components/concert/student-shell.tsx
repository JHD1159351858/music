'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useState } from 'react'
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
  const [backgrounds, setBackgrounds] = useState<Record<string, 'ready' | 'failed'>>({})
  const modulePath = `/${pathname.split('/')[1]}`
  const background = navigation.some(item => item.href !== '/' && item.href === modulePath) ? `/backgrounds/piano${modulePath}.png` : null
  const backgroundState = background ? backgrounds[background] : 'ready'
  const isMap = pathname === '/map'
  useEffect(() => {
    if (!background || backgroundState) return
    let active = true
    const image = new window.Image()
    image.fetchPriority = 'high'
    image.src = background
    const finish = (state: 'ready' | 'failed') => {
      if (active) setBackgrounds(current => ({ ...current, [background]: state }))
    }
    void image.decode().then(() => finish('ready'), () => finish('failed'))
    return () => { active = false }
  }, [background, backgroundState])
  useLayoutEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark')
    document.documentElement.classList.remove('dark')
    return () => { if (wasDark) document.documentElement.classList.add('dark') }
  }, [])
  async function leave() {
    try { await logout(); router.replace('/') }
    catch (failure: unknown) { setError(failure instanceof Error ? failure.message : '退出登录失败，请重试。') }
  }
  function login() {
    if (onNavigate) onNavigate(pathname)
    else router.push(`/?login=1&next=${encodeURIComponent(pathname + window.location.search)}`)
  }
  return <div className={cn('concert-student', isMap && 'concert-student-map')}>
    <aside className="concert-sidebar">
      <Link href="/" aria-label="知音首页" className="concert-brand"><span className="concert-brand-mark"><Music2 className="size-5" /></span><span><strong>知音</strong><small>MUSIC COMPANION</small></span></Link>
      <nav aria-label="课堂导航" className="concert-navigation">{navigation.map(item => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('concert-nav-link', active && 'is-active')} onClick={event => { if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(item.href) } }}><item.icon className="size-[18px] shrink-0" /><span>{item.label}</span></Link>
      })}</nav>
      <div className="concert-sidebar-account">
        <div className="concert-account-summary"><p className="truncate text-sm font-medium">{user?.display_name ?? '欢迎来到知音'}</p><p className="mt-1 text-xs text-muted-foreground">{user ? user.role === 'teacher' ? '教师' : '学生' : '访客浏览'}</p></div>
        {user ? <><UserProfile user={user}><button aria-label="我的资料" className="concert-account-action"><UserRound className="size-4" /><span>我的资料</span></button></UserProfile><button aria-label="退出登录" className="concert-account-action" onClick={() => void leave()}><LogOut className="size-4" /><span>退出登录</span></button></> : <button aria-label="登录课堂" className="concert-account-action" onClick={login}><UserRound className="size-4" /><span>登录课堂</span></button>}
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    </aside>
    <header className="concert-mobile-header"><Link href="/" className="flex items-center gap-2 font-serif text-lg"><Music2 className="size-5 text-primary" />知音</Link><div className="flex items-center gap-1">{user ? <><UserProfile user={user}><button aria-label="我的资料" className="grid size-11 place-items-center text-muted-foreground"><UserRound className="size-5" /></button></UserProfile><button aria-label="退出登录" onClick={() => void leave()} className="grid size-11 place-items-center text-muted-foreground"><LogOut className="size-5" /></button></> : <button onClick={login} className="min-h-11 text-sm text-primary">登录课堂</button>}</div>{error && <p role="alert" className="basis-full text-xs text-destructive">{error}</p>}</header>
    <main className="concert-main" data-module={pathname.split('/')[1]} data-background={backgroundState} aria-busy={!backgroundState}><div className="concert-content">{backgroundState ? children : <div role="status" className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground">正在准备页面…</div>}</div></main>
  </div>
}
