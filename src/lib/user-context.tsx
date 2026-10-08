'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export interface DemoUser {
  id: string
  nickname: string
  role: 'student' | 'teacher'
}

interface UserContextValue {
  user: DemoUser | null
  loading: boolean
  login: (user: DemoUser) => void
  logout: () => void
}

const UserContext = createContext<UserContextValue | null>(null)
const STORAGE_KEY = 'zhiyin_user'

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch {
      /* ignore */
    }
    setLoading(false)
  }, [])

  const login = useCallback((u: DemoUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  return (
    <UserContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

/** 页面守卫：未选择身份则回到首页 */
export function useRequireUser() {
  const { user, loading } = useUser()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [loading, user, router])
  return { user, loading }
}
