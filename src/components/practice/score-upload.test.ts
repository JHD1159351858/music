import assert from 'node:assert/strict'
import test from 'node:test'
import { uploadScorePages, type ScoreUploadPage, type UploadedScoreFile } from './score-upload'

test('多页上传中断后重试只上传剩余页面，保持用户指定顺序', async () => {
  let pages: ScoreUploadPage[] = ['第二页.png', '第一页.png'].map((name, index) => ({ id: String(index), file: new File([name], name, { type: 'image/png' }), uploaded: null }))
  const uploads: string[] = []
  let failed = false
  const upload = async (file: File): Promise<UploadedScoreFile> => {
    uploads.push(file.name)
    if (file.name === '第一页.png' && !failed) { failed = true; throw new Error('网络中断') }
    return { fileId: file.name, url: `https://example.com/${file.name}`, name: file.name, type: file.type }
  }
  const remember = (id: string, uploaded: UploadedScoreFile) => { pages = pages.map(page => page.id === id ? { ...page, uploaded } : page) }
  await assert.rejects(uploadScorePages(pages, upload, remember), /网络中断/)
  assert.equal(pages[0].uploaded?.fileId, '第二页.png')
  const result = await uploadScorePages(pages, upload, remember)
  assert.deepEqual(result.map(file => file.name), ['第二页.png', '第一页.png'])
  assert.deepEqual(uploads, ['第二页.png', '第一页.png', '第一页.png'])
})

test('编辑已有谱页直接保留引用，不重新上传', async () => {
  const uploaded: UploadedScoreFile = { fileId: 'original', url: 'https://example.com/original.png', name: '原谱.png', type: 'image/png' }
  const result = await uploadScorePages([{ id: 'first', file: null, uploaded }], async () => { throw new Error('不应重新上传') }, () => { throw new Error('不应更新原页') })
  assert.deepEqual(result, [uploaded])
})
