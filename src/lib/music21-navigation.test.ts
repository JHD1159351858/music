import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'

test('students keep analysis access and guests can only browse the six module roots', async () => {
  const keys = ['ZHIYIN_SESSION_SECRET', 'ZHIYIN_STUDENT_TEST_MODE', 'ZHIYIN_PUBLIC_ORIGIN'] as const
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  process.env.ZHIYIN_SESSION_SECRET = 'music21-navigation-test-at-least-32-character-key'
  process.env.ZHIYIN_STUDENT_TEST_MODE = 'false'
  process.env.ZHIYIN_PUBLIC_ORIGIN = 'http://localhost'
  try {
    const token = await signAuthToken({ kind: 'session', userId: 'student', role: 'student', expiresAt: Date.now() + 60000 })
    const response = await proxy(new NextRequest('http://localhost/analysis', { headers: { cookie: `${AUTH_SESSION_COOKIE}=${token}` } }))
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('x-middleware-next'), '1')
    for (const pathname of ['/practice', '/analysis', '/tasks', '/community', '/map', '/stats', '/practice?tab=history']) {
      for (const method of ['GET', 'HEAD']) {
        const anonymous = await proxy(new NextRequest(`http://localhost${pathname}`, { method }))
        assert.equal(anonymous.headers.get('location'), null, `${method} ${pathname}`)
        assert.equal(anonymous.headers.get('x-middleware-next'), '1', `${method} ${pathname}`)
      }
      const post = await proxy(new NextRequest(`http://localhost${pathname}`, { method: 'POST' }))
      assert.equal(post.headers.get('x-middleware-next'), null)
      assert.equal(new URL(post.headers.get('location') ?? '').searchParams.get('login'), '1')
    }
    for (const pathname of ['/practice/session/example?task_id=private', '/tasks/private', '/analysis/history', '/knowledge', '/teacher']) {
      const anonymous = await proxy(new NextRequest(`http://localhost${pathname}`))
      const target = new URL(anonymous.headers.get('location') ?? '')
      assert.equal(target.pathname, '/')
      assert.equal(target.searchParams.get('login'), '1')
      assert.equal(target.searchParams.get('next'), pathname)
    }
    for (const pathname of ['/api/scores', '/api/posts', '/api/tasks', '/api/stats', '/api/analysis', '/api/files/private', '/api/teacher/overview']) {
      for (const method of ['GET', 'POST']) {
        const response = await proxy(new NextRequest(`http://localhost${pathname}`, { method }))
        assert.equal(response.status, 401, `${method} ${pathname}`)
        assert.equal(response.headers.get('x-middleware-next'), null)
      }
    }
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  }
})
