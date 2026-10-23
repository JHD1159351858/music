'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize, Minimize, ZoomIn, ZoomOut } from 'lucide-react'
import { toast } from 'sonner'
import type { Score } from '@/lib/teaching-types'
import { getScorePages } from '@/lib/score-pages'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScorePageNavigation } from '@/components/practice/score-page-navigation'
import { ScoreViewport } from '@/components/practice/score-viewport'
import { INITIAL_SCORE_VIEW, MAX_SCORE_ZOOM, MIN_SCORE_ZOOM, zoomScoreAt } from '@/components/practice/score-viewport-math'

export function ScorePreview({ score, onClose }: { score: Score; onClose: () => void }) {
  const [view, setView] = useState(INITIAL_SCORE_VIEW)
  const [pageIndex, setPageIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const pages = getScorePages(score)
  const page = pages[pageIndex] ?? pages[0]
  const pdf = page?.file_type === 'application/pdf' || /\.pdf(?:\?|$)/i.test(page?.file_name ?? page?.image_url ?? '')
  const changePage = (index: number) => { setPageIndex(index); setView(INITIAL_SCORE_VIEW) }
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === container.current)
    document.addEventListener('fullscreenchange', changed)
    return () => { document.removeEventListener('fullscreenchange', changed) }
  }, [])
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (container.current?.requestFullscreen) await container.current.requestFullscreen()
      else toast.info('当前浏览器不支持全屏，可在新窗口打开琴谱。')
    } catch { toast.error('无法进入全屏，请在新窗口查看琴谱。') }
  }
  async function close() {
    if (document.fullscreenElement === container.current) await document.exitFullscreen().catch(() => {})
    onClose()
  }
  return <Dialog open onOpenChange={(open) => { if (!open) void close() }}>
    <DialogContent ref={container} className={`flex flex-col overflow-hidden bg-background sm:max-w-6xl ${fullscreen ? 'inset-0 h-dvh !max-h-none !max-w-none translate-x-0 translate-y-0 rounded-none' : 'max-h-[92dvh]'}`}>
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>{score.title}</DialogTitle><DialogDescription>{score.composer} · {score.score_type ?? '类型未设置'} · {score.period ?? '时期未设置'}{score.tips ? ` · ${score.tips}` : ''}</DialogDescription></DialogHeader>
      {page?.image_url ? <>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ScorePageNavigation index={pageIndex} count={pages.length} onChange={changePage} />
          <Button variant="outline" size="icon" aria-label="缩小谱面" disabled={view.zoom <= MIN_SCORE_ZOOM} onClick={() => setView(value => zoomScoreAt(value, value.zoom - 0.25, { x: 0, y: 0 }))}><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="w-20 flex-col gap-0 text-xs" title="完整显示当前页并居中" onClick={() => setView(INITIAL_SCORE_VIEW)}>适应屏幕<span className="font-mono text-[10px]">{Math.round(view.zoom * 100)}%</span></Button>
          <Button variant="outline" size="icon" aria-label="放大谱面" disabled={view.zoom >= MAX_SCORE_ZOOM} onClick={() => setView(value => zoomScoreAt(value, value.zoom + 0.25, { x: 0, y: 0 }))}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="ml-auto gap-2" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}{fullscreen ? '退出全屏' : '全屏看谱'}</Button>
        </div>
        <div aria-label="琴谱显示区域" className={`min-h-0 overflow-hidden rounded-lg border border-border bg-muted/20 ${fullscreen ? 'flex-1' : 'h-[65dvh]'}`}>
          {pdf ? <iframe src={`${page.image_url.split('#')[0]}#${view.zoom === 1 ? 'view=Fit&zoom=page-fit' : `zoom=${Math.round(view.zoom * 100)}`}`} title={`${score.title}完整 PDF 琴谱`} className="h-full w-full border-0" /> : <ScoreViewport key={`${score.id}-${pageIndex}`} src={page.image_url} title={`${score.title}${pages.length > 1 ? `第 ${pageIndex + 1} 页` : ''}`} view={view} onChange={setView} />}
        </div>
        <a href={page.image_url} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-primary underline underline-offset-4">在新窗口打开{pages.length > 1 ? '当前页琴谱' : '完整琴谱'}</a>
      </> : <p className="py-16 text-center text-muted-foreground">此曲目尚无谱面文件，可通过编辑琴谱补充。</p>}
    </DialogContent>
  </Dialog>
}
