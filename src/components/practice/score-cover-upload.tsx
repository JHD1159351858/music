'use client'

/* eslint-disable @next/next/no-img-element -- 本地选图使用可释放的 Blob 地址预览。 */

import { useEffect, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ScoreCover } from './score-cover'
import { Button } from '@/components/ui/button'

export function ScoreCoverUpload({ id, title, composer, file, coverUrl, hasCover, disabled, onChoose, onRemove }: {
  id: string
  title: string
  composer: string
  file: File | null
  coverUrl: string | null
  hasCover: boolean
  disabled: boolean
  onChoose: (file: File) => void
  onRemove: () => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function choose(selected?: File) {
    if (!selected) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(selected.type)) { toast.error('封面请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片'); return }
    if (selected.size > 10 * 1024 * 1024) { toast.error('单个封面文件不能超过 10MB'); return }
    onChoose(selected)
  }

  return <section aria-label={`${title || '琴谱'}的曲目封面`} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">曲目封面（选填）</h3>{(file || hasCover) && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}><X className="size-3.5" />移除封面</Button>}</div>
    <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
      <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted/30">{preview ? <img src={preview} alt={`${title || '琴谱'}的新封面预览`} className="h-full w-full object-cover" /> : <ScoreCover score={{ id, title, composer, cover_url: coverUrl }} className="h-full w-full object-cover" />}</div>
      <div className="space-y-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary ${disabled ? 'pointer-events-none opacity-50' : ''}`}><ImagePlus className="size-4" />{file || hasCover ? '替换封面' : '上传封面'}<input type="file" aria-label={`为${title || '未命名曲目'}选择封面`} accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={disabled} className="hidden" onChange={event => { choose(event.target.files?.[0]); event.target.value = '' }} /></label><p className="text-xs leading-5 text-muted-foreground">封面用于曲目展示，谱面用于练习。建议使用不超过 10MB 的横向图片；未上传时使用默认曲目封面。</p>{file && <p className="truncate text-xs text-muted-foreground" title={file.name}>{file.name}</p>}</div>
    </div>
  </section>
}
