import assert from 'node:assert/strict'
import test from 'node:test'
import { createScoreUploadReceipt, verifyScoreUploadReceipt } from './score-upload-receipt'

const secret = 'score-upload-receipt-test-secret-0123456789abcdef'
const issuedAt = new Date('2026-10-16T08:00:00.000Z').getTime()

test('score upload receipt returns server MIME only for the bound file and owner', async () => {
  const before = process.env.ZHIYIN_SESSION_SECRET
  process.env.ZHIYIN_SESSION_SECRET = secret
  try {
    const receipt = await createScoreUploadReceipt({ fileId: 'remote-page-1', ownerId: 'student-1', fileType: 'image/png' }, issuedAt)
    assert.equal(await verifyScoreUploadReceipt(receipt, { fileId: 'remote-page-1', ownerId: 'student-1' }, issuedAt + 1_000), 'image/png')
    assert.equal(await verifyScoreUploadReceipt(receipt, { fileId: 'remote-page-2', ownerId: 'student-1' }, issuedAt + 1_000), null)
    assert.equal(await verifyScoreUploadReceipt(receipt, { fileId: 'remote-page-1', ownerId: 'student-2' }, issuedAt + 1_000), null)
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_SESSION_SECRET
    else process.env.ZHIYIN_SESSION_SECRET = before
  }
})

test('score upload receipt rejects tampering and expiry', async () => {
  const before = process.env.ZHIYIN_SESSION_SECRET
  process.env.ZHIYIN_SESSION_SECRET = secret
  try {
    const receipt = await createScoreUploadReceipt({ fileId: 'remote-page-1', ownerId: 'teacher-1', fileType: 'application/pdf' }, issuedAt)
    const tampered = receipt.slice(0, -1) + (receipt.endsWith('a') ? 'b' : 'a')
    assert.equal(await verifyScoreUploadReceipt(tampered, { fileId: 'remote-page-1', ownerId: 'teacher-1' }, issuedAt + 1_000), null)
    assert.equal(await verifyScoreUploadReceipt(receipt, { fileId: 'remote-page-1', ownerId: 'teacher-1' }, issuedAt + 7 * 24 * 60 * 60_000 + 1), null)
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_SESSION_SECRET
    else process.env.ZHIYIN_SESSION_SECRET = before
  }
})

test('avatar purpose is signed and required only when the verifier requests it', () => {
  const before = process.env.ZHIYIN_SESSION_SECRET
  process.env.ZHIYIN_SESSION_SECRET = secret
  try {
    const file = { fileId: 'remote-avatar', ownerId: 'teacher-1', fileType: 'image/png' }
    const target = { fileId: file.fileId, ownerId: file.ownerId }
    const general = createScoreUploadReceipt(file, issuedAt)
    assert.equal(verifyScoreUploadReceipt(general, target, issuedAt + 1), 'image/png')
    assert.equal(verifyScoreUploadReceipt(general, { ...target, purpose: 'map-avatar' }, issuedAt + 1), null)
    const avatar = createScoreUploadReceipt({ ...file, purpose: 'map-avatar' }, issuedAt)
    assert.equal(verifyScoreUploadReceipt(avatar, { ...target, purpose: 'map-avatar' }, issuedAt + 1), 'image/png')
    assert.equal(verifyScoreUploadReceipt(avatar, target, issuedAt + 1), 'image/png')
  } finally {
    if (before === undefined) delete process.env.ZHIYIN_SESSION_SECRET
    else process.env.ZHIYIN_SESSION_SECRET = before
  }
})
