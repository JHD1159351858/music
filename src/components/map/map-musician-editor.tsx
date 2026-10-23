'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { CHINA_ERAS, EUROPE_ERAS } from '@/lib/composers'
import type { MapKind, MapMusician, MapMusicianInput } from '@/lib/map-musician-types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { MapPoint } from './map-viewport-math'

export interface MapMusicianDraft { values: MapMusicianInput; avatarPreview: string }
interface Props {
  musician: MapMusician | null
  userId: string
  mapKind: MapKind
  era: string
  point: MapPoint
  initialDraft?: MapMusicianDraft
  onCancel: () => void
  onSaved: (musician: MapMusician) => void
  onReselect: (draft: MapMusicianDraft) => void
}

const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

async function responseJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : '操作失败，请重试')
  return value as T
}

export function MapMusicianEditor({ musician, userId, mapKind, era, point, initialDraft, onCancel, onSaved, onReselect }: Props) {
  const [values, setValues] = useState<MapMusicianInput>(() => initialDraft?.values ?? {
    name: musician?.name ?? '', years: musician?.years ?? '', era: musician?.era ?? era,
    region: musician?.region ?? '', intro: musician?.intro ?? '', works: musician?.works ?? '', note: musician?.note ?? '',
    sources: musician?.sources.length ? musician.sources : [{ title: '', url: '' }],
    map_kind: mapKind, x: point.x, y: point.y, avatar_file_id: musician?.avatar_file_id ?? null,
  })
  const [avatarPreview, setAvatarPreview] = useState(initialDraft?.avatarPreview ?? musician?.avatar ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const eras = mapKind === 'china' ? CHINA_ERAS : EUROPE_ERAS
  const busy = uploading || saving
  const update = (patch: Partial<MapMusicianInput>) => setValues(current => ({ ...current, ...patch }))

  async function uploadAvatar(file: File | undefined) {
    if (!file || busyRef.current) return
    if (!RASTER_TYPES.has(file.type)) { setError('头像请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片'); return }
    busyRef.current = true
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('user_id', userId)
      form.set('purpose', 'map-avatar')
      const uploaded = await responseJson<{ fileId: string; url: string; type: string; receipt?: string }>(await fetch('/api/upload', { method: 'POST', body: form }))
      if (!RASTER_TYPES.has(uploaded.type)) throw new Error('头像上传结果不是支持的图片格式')
      update({ avatar_file_id: uploaded.fileId, avatar_receipt: uploaded.receipt })
      setAvatarPreview(uploaded.url)
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : '头像上传失败，请重试') }
    finally { busyRef.current = false; setUploading(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const sources = values.sources.filter(source => source.title.trim() || source.url.trim())
    if (sources.some(source => !source.title.trim() || !/^https?:\/\//i.test(source.url.trim()))) { setError('每条资料来源请填写标题和 HTTP(S) 链接，或移除空白条目'); return }
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      const saved = await responseJson<MapMusician & { warning?: string }>(await fetch(musician ? `/api/map-musicians/${encodeURIComponent(musician.id)}` : '/api/map-musicians', {
        method: musician ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, sources, x: point.x, y: point.y, map_kind: mapKind }),
      }))
      if (saved.warning) toast.warning(saved.warning)
      else toast.success(musician ? '音乐家资料已保存' : '音乐家已添加')
      onSaved(saved)
    } catch (failure: unknown) { setError(failure instanceof Error ? failure.message : '保存失败，请重试') }
    finally { busyRef.current = false; setSaving(false) }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onCancel() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy} onInteractOutside={event => { if (busyRef.current) event.preventDefault() }} onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault() }}>
      <DialogHeader><DialogTitle>{musician ? '编辑音乐家' : '添加音乐家'}</DialogTitle><DialogDescription>填写人物资料。位置已在{mapKind === 'china' ? '中国' : '欧洲'}地图上选定，可重新选点；头像和资料来源选填。</DialogDescription></DialogHeader>
      <form onSubmit={event => void save(event)} className="space-y-5">
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="space-y-2"><Label htmlFor="map-musician-x">横向位置（%）</Label><Input id="map-musician-x" value={point.x.toFixed(4)} readOnly /></div>
            <div className="space-y-2"><Label htmlFor="map-musician-y">纵向位置（%）</Label><Input id="map-musician-y" value={point.y.toFixed(4)} readOnly /></div>
            <Button type="button" variant="outline" size="sm" className="col-span-2 w-fit" onClick={() => onReselect({ values: { ...values, x: point.x, y: point.y }, avatarPreview })}>重新选点</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="map-musician-name">姓名</Label><Input id="map-musician-name" value={values.name} onChange={event => update({ name: event.target.value })} required maxLength={160} /></div>
            <div className="space-y-2"><Label htmlFor="map-musician-years">生卒年代</Label><Input id="map-musician-years" value={values.years} onChange={event => update({ years: event.target.value })} maxLength={160} /></div>
            <div className="space-y-2"><Label htmlFor="map-musician-region">地区</Label><Input id="map-musician-region" value={values.region} onChange={event => update({ region: event.target.value })} required maxLength={500} /></div>
            <div className="space-y-2"><Label htmlFor="map-musician-era">时代</Label><Select value={values.era} onValueChange={value => update({ era: value })} disabled={busy}><SelectTrigger id="map-musician-era" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{eras.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="map-musician-intro">简介</Label><Textarea id="map-musician-intro" value={values.intro} onChange={event => update({ intro: event.target.value })} required maxLength={12000} rows={3} /></div>
          <div className="space-y-2"><Label htmlFor="map-musician-works">代表作</Label><Textarea id="map-musician-works" value={values.works} onChange={event => update({ works: event.target.value })} maxLength={6000} rows={2} /></div>
          <div className="space-y-2"><Label htmlFor="map-musician-note">学习提示</Label><Textarea id="map-musician-note" value={values.note} onChange={event => update({ note: event.target.value })} maxLength={6000} rows={2} /></div>
          <div className="space-y-3">
            <Label htmlFor="map-musician-avatar">头像图片</Label>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarPreview ? <img src={avatarPreview} alt="音乐家头像预览" className="h-14 w-14 shrink-0 rounded-full border border-border object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 font-serif text-xl text-primary">{values.name.slice(0, 1) || <Upload className="size-5" />}</span>}
              <Input id="map-musician-avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="min-w-0" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadAvatar(file) }} />
            </div>
            {values.avatar_file_id && <Button type="button" variant="ghost" size="sm" onClick={() => { update({ avatar_file_id: null, avatar_receipt: undefined }); setAvatarPreview('') }}>移除头像</Button>}
            <p className="text-xs text-muted-foreground">支持 PNG、JPEG、WebP、GIF、AVIF；不上传时显示姓名首字。</p>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">资料来源</h3>
            {values.sources.map((source, index) => <div key={index} className="space-y-3 rounded-lg border border-border p-3">
              <div className="space-y-2"><Label htmlFor={`map-musician-source-title-${index}`}>来源标题 {index + 1}</Label><Input id={`map-musician-source-title-${index}`} value={source.title} maxLength={160} onChange={event => update({ sources: values.sources.map((item, sourceIndex) => sourceIndex === index ? { ...item, title: event.target.value } : item) })} /></div>
              <div className="space-y-2"><Label htmlFor={`map-musician-source-url-${index}`}>来源链接 {index + 1}</Label><Input id={`map-musician-source-url-${index}`} type="url" value={source.url} maxLength={2048} onChange={event => update({ sources: values.sources.map((item, sourceIndex) => sourceIndex === index ? { ...item, url: event.target.value } : item) })} /></div>
              <Button type="button" variant="ghost" size="sm" aria-label={`移除资料来源 ${index + 1}`} onClick={() => update({ sources: values.sources.filter((_, sourceIndex) => sourceIndex !== index) })}><Trash2 />移除此来源</Button>
            </div>)}
            <Button type="button" variant="outline" size="sm" disabled={values.sources.length >= 20} onClick={() => update({ sources: [...values.sources, { title: '', url: '' }] })}><Plus />添加资料来源</Button>
          </div>
        </fieldset>
        {uploading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />头像上传中…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>取消</Button><Button type="submit" disabled={busy}>{saving ? <><Loader2 className="size-4 animate-spin" />保存中…</> : '保存音乐家'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>
}
