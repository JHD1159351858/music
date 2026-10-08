import { NextResponse } from 'next/server'
import { StorageClient } from 'coder-coding-dev-sdk'

const storage = new StorageClient()

// POST /api/upload  (multipart form, field: file)
// 用于录音音频与谱面图片上传，返回 { fileId, url }
export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: '缺少文件' }, { status: 400 })

  const safeName = file.name.replace(/[\\/]/g, '_')
  const uploaded = await storage.uploadFile({
    fileContent: Buffer.from(await file.arrayBuffer()),
    fileName: `${Date.now()}_${safeName}`,
    contentType: file.type,
  })
  const info = await storage.getFile({ fileId: uploaded.fileId, expiresInSeconds: 86400 * 7 })
  return NextResponse.json({ fileId: uploaded.fileId, url: info.url })
}
