import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import { AUTH_SESSION_COOKIE, signAuthToken } from './auth-session'

test('signed students can reach the analysis page while anonymous visitors still need login', async () => {
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
    const anonymous = await proxy(new NextRequest('http://localhost/analysis'))
    const target = new URL(anonymous.headers.get('location') ?? '')
    assert.equal(target.pathname, '/')
    assert.equal(target.searchParams.get('login'), '1')
    assert.equal(target.searchParams.get('next'), '/analysis')
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]
      else process.env[key] = before[key]
    }
  }
})
