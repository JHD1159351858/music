import assert from 'node:assert/strict'
import test from 'node:test'
import { savePracticeDraft, type PracticeSaveDraft } from './practice-save'

test('保存记录失败后重试保留录音且不会重复上传', async () => {
  const draft: PracticeSaveDraft = { audioBlob: new Blob(['recording']), audioUrl: null, audioFileId: null, recordId: null }
  let uploads = 0
  let saves = 0
  const upload = async () => {
    uploads += 1
    return { url: '/recording.webm', fileId: 'audio-1' }
  }
  const create = async (audio: { audio_url: string | null; audio_file_id: string | null }) => {
    saves += 1
    assert.equal(audio.audio_file_id, 'audio-1')
    assert.equal(audio.audio_url, '/recording.webm')
    if (saves === 1) throw new Error('save failed')
    return { id: 'record-1' }
  }
  await assert.rejects(savePracticeDraft(draft, upload, create), /save failed/)
  assert.equal(await savePracticeDraft(draft, upload, create), 'record-1')
  assert.equal(uploads, 1)
  assert.equal(saves, 2)
  assert.equal(await savePracticeDraft(draft, upload, create), 'record-1')
  assert.equal(saves, 2)
})

test('录音上传失败时保留原始录音并阻止静默丢弃录音', async () => {
  const blob = new Blob(['recording'])
  const draft: PracticeSaveDraft = { audioBlob: blob, audioUrl: null, audioFileId: null, recordId: null }
  let saves = 0
  await assert.rejects(savePracticeDraft(draft, async () => { throw new Error('upload failed') }, async () => {
    saves += 1
    return { id: 'record-1' }
  }), /upload failed/)
  assert.equal(saves, 0)
  assert.equal(draft.audioBlob, blob)
  assert.equal(draft.recordId, null)
})
