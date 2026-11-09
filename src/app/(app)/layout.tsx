'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { isGuestModulePath } from '@/lib/guest-modules'
import { AdminShell } from '@/components/teacher/admin-shell'
import { StudentShell } from '@/components/concert/student-shell'
import { GuestModule } from '@/components/concert/guest-module'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !user && !isGuestModulePath(pathname)) router.replace(`/?login=1&next=${encodeURIComponent(pathname + window.location.search)}`)
  }, [loading, user, pathname, router])
  if (!loading && !user && isGuestModulePath(pathname)) return <StudentShell><GuestModule key={pathname} pathname={pathname} /></StudentShell>
  if (loading || !user) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">加载中…</div>
  if (pathname.startsWith('/practice/session/')) return <main>{children}</main>
  if (user.role === 'teacher') return <AdminShell>{children}</AdminShell>
  return <StudentShell>{children}</StudentShell>
}
