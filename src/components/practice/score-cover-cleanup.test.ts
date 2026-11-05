import assert from 'node:assert/strict'
import test from 'node:test'
import { createScoreCoverCleanup } from './score-cover-cleanup'

const file = (fileId: string) => ({ fileId, receipt: `signed-${fileId}` })
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test('failed saves retain uploads for retry, then discard cleans only abandoned uploads', async () => {
  const deleted: string[] = []
  const cleanup = createScoreCoverCleanup(async upload => { deleted.push(upload.fileId); return true })
  cleanup.uploaded(file('retry'))
  cleanup.uploaded(file('replaced'))
  cleanup.uploaded({ fileId: 'existing' })
  await settle()
  assert.deepEqual(deleted, [])
  cleanup.discard('replaced')
  await settle()
  assert.deepEqual(deleted, ['replaced'])
  cleanup.saved('retry')
  cleanup.discardAll()
  await settle()
  assert.deepEqual(deleted, ['replaced'])
})

test('unmount during saving defers deletion until the write finishes and protects saved covers', async () => {
  const deleted: string[] = []
  const cleanup = createScoreCoverCleanup(async upload => { deleted.push(upload.fileId); return true })
  cleanup.beginSave()
  cleanup.uploaded(file('committed'))
  cleanup.uploaded(file('failed'))
  cleanup.discardAll()
  await settle()
  assert.deepEqual(deleted, [])
  cleanup.saved('committed')
  cleanup.endSave()
  await settle()
  assert.deepEqual(deleted, ['failed'])
})

test('cleanup failures remain eligible for a later best-effort attempt and duplicate discard does not overlap', async () => {
  let calls = 0
  let release: (value: boolean) => void = () => {}
  const cleanup = createScoreCoverCleanup(() => { calls++; return new Promise(resolve => { release = resolve }) })
  cleanup.uploaded(file('offline'))
  cleanup.discard('offline')
  cleanup.discardAll()
  assert.equal(calls, 1)
  release(false)
  await settle()
  cleanup.discardAll()
  assert.equal(calls, 2)
  release(true)
  await settle()
  cleanup.discardAll()
  assert.equal(calls, 2)
})
