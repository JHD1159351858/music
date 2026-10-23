'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useRequireUser } from '@/lib/user-context'
import { ChatPanel } from '@/components/chat-panel'
import { Button } from '@/components/ui/button'
import { MusicMapViewport } from '@/components/map/music-map-viewport'
import { MapMusicianEditor, type MapMusicianDraft } from '@/components/map/map-musician-editor'
import type { MapPoint } from '@/components/map/map-viewport-math'
import type { MapKind, MapMusician } from '@/lib/map-musician-types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  CHINA_ERAS,
  EUROPE_ERAS,
} from '@/lib/composers'
import { Landmark, Globe2, Info, ExternalLink, BookOpen, Sparkles, ArrowLeft, Plus, MapPin, Pencil, Trash2, Loader2 } from 'lucide-react'

interface Placement { musician: MapMusician | null; draft?: MapMusicianDraft }
interface Editor extends Placement { point: MapPoint }

async function responseJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : '操作失败，请重试')
  return value as T
}

export default function MusicMapPage() {
  const { user } = useRequireUser()
  const [map, setMap] = useState<MapKind>('china')
  const [era, setEra] = useState<string>('modern')
  const [musicians, setMusicians] = useState<MapMusician[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MapMusician | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteBusy = useRef(false)
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    setLoading(true)
    setLoadError('')
    fetch('/api/map-musicians', { signal: controller.signal })
      .then(responseJson<MapMusician[]>)
      .then(setMusicians)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : '读取音乐家失败，请重试') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [userId, reload])

  const eras = map === 'china' ? CHINA_ERAS : EUROPE_ERAS
  const composers = useMemo(() => musicians.filter(item => item.map_kind === map), [musicians, map])
  const active = musicians.find(item => item.id === activeId) ?? null
  const currentEra = eras.find(item => item.id === era)
  const litIds = useMemo(
    () => new Set(composers.filter((c) => c.era === era).map((c) => c.id)),
    [composers, era]
  )

  if (!user) return null

  const canManage = active?.origin === 'custom' && active.teacher_id === user.id && user.role === 'teacher'

  function saveMusician(saved: MapMusician) {
    setMusicians(current => current.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved])
    setMap(saved.map_kind)
    setEra(saved.era)
    setActiveId(saved.id)
    setShowChat(false)
    setEditor(null)
    setPlacement(null)
  }

  async function deleteMusician() {
    if (!deleteTarget || deleteBusy.current) return
    deleteBusy.current = true
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await responseJson<{ ok: true; warning?: string }>(await fetch(`/api/map-musicians/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' }))
      setMusicians(current => current.filter(item => item.id !== deleteTarget.id))
      setActiveId(null)
      setShowChat(false)
      setDeleteTarget(null)
      if (result.warning) toast.warning(result.warning)
      else toast.success('音乐家已删除')
    } catch (failure: unknown) { setDeleteError(failure instanceof Error ? failure.message : '删除失败，请重试') }
    finally { deleteBusy.current = false; setDeleting(false) }
  }

  const switchMap = (m: MapKind) => {
    if (placement) return
    setMap(m)
    setActiveId(null)
    setShowChat(false)
    setPlacement(null)
    setEra(m === 'china' ? 'modern' : 'romantic')
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">音乐史地图</h1>
          <p className="mt-1 text-sm text-muted-foreground">沿时间线点亮作曲家，在地图上阅读他们的故事</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {user.role === 'teacher' && <Button onClick={() => { setPlacement({ musician: null }); setShowChat(false) }} disabled={loading || !!loadError || !!placement}><Plus />添加音乐家</Button>}
        <div className="flex rounded-lg border border-border bg-card p-1" aria-label="地图区域">
          {(
            [
              { key: 'china', label: '中国音乐史', icon: Landmark },
              { key: 'europe', label: '欧洲音乐史', icon: Globe2 },
            ] as const
          ).map((m) => (
            <Button
              key={m.key}
              variant="ghost"
              onClick={() => switchMap(m.key)}
              disabled={!!placement}
              aria-pressed={map === m.key}
              className={cn('gap-2 px-3 sm:px-4', map === m.key ? 'bg-primary/15 text-primary' : 'text-muted-foreground')}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </Button>
          ))}
        </div>
        </div>
      </header>

      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在读取音乐家…</p>}
      {loadError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><p>音乐家读取失败：{loadError}</p><Button variant="outline" size="sm" onClick={() => setReload(current => current + 1)}>重试读取音乐家</Button></div>}
      {placement && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/8 p-3"><p role="status" className="flex items-center gap-2 text-sm text-primary"><MapPin className="size-4 shrink-0" />在地图上选择位置，可先缩放或拖动地图，再点击底图空白处。</p><Button variant="outline" size="sm" onClick={() => setPlacement(null)}>取消选点</Button></div>}

      <nav aria-label="音乐史时代" className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
        {eras.map((e) => (
          <Button
            key={e.id}
            variant="ghost"
            onClick={() => { if (!placement) { setEra(e.id); setActiveId(null); setShowChat(false) } }}
            disabled={!!placement}
            aria-pressed={era === e.id}
            className={cn(
              'h-auto min-w-fit flex-1 justify-start gap-2.5 px-3 py-2.5 text-left',
              era === e.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            )}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full border', era === e.id ? 'border-primary bg-primary' : 'border-muted-foreground/40')} />
            <span>
              <span className="block text-sm font-medium">{e.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{e.span}</span>
            </span>
          </Button>
        ))}
      </nav>

      <section aria-label="音乐史地图与人物资料" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div role="region" aria-label={map === 'china' ? '中国音乐史地图' : '欧洲音乐史地图'} className="min-w-0">
            <MusicMapViewport key={map} src={map === 'china' ? '/maps/china.png' : '/maps/europe.png'} title={map === 'china' ? '中国地图' : '欧洲地图'} era={currentEra?.label} selectingPoint={!!placement} onSelectPoint={point => { if (placement) { setEditor({ ...placement, point }); setPlacement(null) } }}>
              {composers.map((c) => {
                const lit = litIds.has(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => { if (lit && !placement) { setActiveId(c.id); setShowChat(false) } }}
                    disabled={!lit}
                    aria-label={`选择${c.name}`}
                    aria-pressed={active?.id === c.id}
                    style={{ left: `${c.x}%`, top: `${c.y}%` }}
                    className={cn(
                      'group absolute -translate-x-1/2 -translate-y-1/2 rounded-lg outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                      active?.id === c.id ? 'z-20' : 'z-10',
                      lit ? 'opacity-100' : 'pointer-events-none scale-75 opacity-0'
                    )}
                  >
                    <span className="relative mx-auto block w-fit">
                      <span aria-hidden className={cn('absolute -inset-1.5 rounded-full border border-primary/25 bg-primary/10', active?.id === c.id && 'border-primary/60 bg-primary/20')} />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.avatar ? <img
                        src={c.avatar}
                        alt=""
                        className={cn(
                          'relative h-12 w-12 rounded-full border-2 object-cover shadow-lg transition-transform group-hover:scale-105 motion-reduce:transform-none sm:h-14 sm:w-14',
                          active?.id === c.id ? 'border-primary' : 'border-primary/50'
                        )}
                      /> : <span className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary/50 bg-card font-serif text-xl text-primary sm:h-14 sm:w-14">{c.name.slice(0, 1)}</span>}
                    </span>
                    <span className="relative mt-1.5 block rounded bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur">{c.name}</span>
                  </button>
                )
              })}

              {editor && <span role="img" aria-label="已选位置" className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-primary" style={{ left: `${editor.point.x}%`, top: `${editor.point.y}%` }}><MapPin className="size-8 fill-background" /><span className="rounded bg-background/90 px-2 py-1 text-xs">已选位置</span></span>}

              {!loading && !loadError && litIds.size === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">该时代暂无收录人物</p>
              )}
            </MusicMapViewport>
          </div>

          <aside role="region" aria-label="人物资料" className="min-w-0 border-t border-border bg-card p-5 lg:border-l lg:border-t-0 xl:p-6">
            {active ? (
              <>
                <div className="flex items-center gap-3 border-b border-border pb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {active.avatar ? <img src={active.avatar} alt="" className="h-14 w-14 shrink-0 rounded-full border-2 border-primary/60 object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-primary/60 bg-primary/10 font-serif text-2xl text-primary">{active.name.slice(0, 1)}</span>}
                  <div className="min-w-0">
                    <h2 className="break-words font-serif text-xl font-semibold text-foreground">{active.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{active.years}</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{active.region}</p>
                  </div>
                </div>

                {canManage && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!!placement} onClick={() => { if (!placement) setEditor({ musician: active, point: { x: active.x, y: active.y } }) }}><Pencil />编辑音乐家</Button><Button variant="ghost" size="sm" disabled={!!placement} onClick={() => { if (!placement) { setDeleteTarget(active); setDeleteError('') } }}><Trash2 />删除音乐家</Button></div>}

                {showChat ? (
                  <div className="mt-4 space-y-3">
                    <Button variant="ghost" size="sm" onClick={() => setShowChat(false)} className="-ml-2 text-primary"><ArrowLeft />返回人物资料</Button>
                    <ChatPanel
                      key={active.id}
                      className="h-[460px]"
                      context={{ kind: 'composer', composerId: active.id }}
                      autoPrompt={`请介绍${map === 'china' ? '中国音乐家' : '作曲家'}${active.name}：生平、创作经历与作品信息、代表作，以及代表作的时代背景。`}
                      placeholder={`继续了解${active.name}…`}
                    />
                  </div>
                ) : (
                  <div className="space-y-4 pt-4">
                    <p className="break-words text-sm leading-relaxed text-foreground/90">{active.intro}</p>
                    {active.works && <div>
                      <h3 className="mb-1.5 text-xs font-medium text-primary">代表作与音乐贡献</h3>
                      <p className="break-words text-sm leading-relaxed text-muted-foreground">{active.works}</p>
                    </div>}
                    {active.note && <p className="flex gap-2 rounded-lg bg-primary/8 p-3 text-xs leading-relaxed text-foreground/80">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 break-words">{active.note}</span>
                    </p>}
                    {active.sources.length > 0 && <div className="space-y-2 border-t border-border pt-3">
                      <h3 className="text-xs font-medium text-muted-foreground">资料来源</h3>
                      {active.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-xs leading-relaxed text-primary underline-offset-4 hover:underline"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0" /><span className="min-w-0 break-words">{source.title}</span></a>)}
                    </div>}
                    <Button onClick={() => setShowChat(true)} className="w-full gap-2"><Sparkles /><span className="min-w-0 truncate">与知音聊聊{active.name}</span></Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-60 flex-col items-start justify-center py-6">
                <Globe2 className="mb-5 h-9 w-9 text-primary/60" />
                <p className="text-xs text-primary">{currentEra?.span}</p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-foreground">从一位音乐家开始</h2>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">选择地图上点亮的头像，在这里阅读人物简介、代表作与资料来源，也可以继续向知音提问。</p>
                <p className="mt-5 text-xs text-muted-foreground">{loading || loadError ? '音乐家资料尚未载入' : `当前时代收录 ${litIds.size} 位音乐人物`}</p>
              </div>
            )}
          </aside>
        </div>

        <div className="border-t border-border bg-muted/15 px-5 py-4 xl:px-6">
          <div className="flex items-center gap-2 text-primary"><BookOpen className="h-4 w-4" /><h2 className="text-sm font-medium">{currentEra?.label}{map === 'europe' ? ' · 同期中国音乐' : ' · 音乐人物'}</h2></div>
          {map === 'europe' ? <><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{currentEra?.chinaContext}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{currentEra?.sources?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">{source.title}<ExternalLink className="h-3 w-3 shrink-0" /></a>)}</div></> : <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{loading || loadError ? '音乐家资料尚未载入。' : `本时代已收录 ${litIds.size} 位音乐人物。`}地图点位用于地域分布示意。</p>}
        </div>
      </section>
      {editor && <MapMusicianEditor musician={editor.musician} userId={user.id} mapKind={map} era={era} point={editor.point} initialDraft={editor.draft} onCancel={() => setEditor(null)} onSaved={saveMusician} onReselect={draft => { setPlacement({ musician: editor.musician, draft }); setEditor(null) }} />}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleteBusy.current) setDeleteTarget(null) }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除音乐家</AlertDialogTitle><AlertDialogDescription>确认删除「{deleteTarget?.name}」？删除后，学生将无法再在地图中查看该人物。</AlertDialogDescription></AlertDialogHeader>{deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}<AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={event => { event.preventDefault(); void deleteMusician() }}>{deleting ? '删除中…' : '确认删除'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
