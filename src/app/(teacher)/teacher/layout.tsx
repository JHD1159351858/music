import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { readAuthSession } from '@/lib/auth-session'
import { AdminShell } from '@/components/teacher/admin-shell'
import { createSupabaseServer } from '@/lib/supabase-server'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await readAuthSession(new Request('http://zhiyin.internal/teacher', { headers: await headers() }))
  if (!session) redirect('/?login=1&role=teacher&next=%2Fteacher')
  if (session.role !== 'teacher') redirect('/practice')
  const { data: profile } = await createSupabaseServer().from('profiles').select('role').eq('id', session.userId).maybeSingle()
  if (profile?.role !== 'teacher') redirect('/?login=1&role=teacher&next=%2Fteacher')
  return <AdminShell>{children}</AdminShell>
}
