'use client'

import { usePathname } from 'next/navigation'
import { useRequireUser } from '@/lib/user-context'
import { AdminShell } from '@/components/teacher/admin-shell'
import { StudentShell } from '@/components/concert/student-shell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireUser()
  const pathname = usePathname()
  if (loading || !user) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">加载中…</div>
  if (pathname.startsWith('/practice/session/')) return <main>{children}</main>
  if (user.role === 'teacher') return <AdminShell>{children}</AdminShell>
  return <StudentShell>{children}</StudentShell>
}
