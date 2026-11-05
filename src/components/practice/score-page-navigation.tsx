'use client'

import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getScoreSpread, type ScoreSpreadSize } from './score-viewport-math'

export function ScorePageNavigation({ index, count, size = 1, onChange }: { index: number; count: number; size?: ScoreSpreadSize; onChange: (index: number) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const { start, end, previous, next } = getScoreSpread(index, count, size)
  useEffect(() => {
    if (count < 2) return
    const turnPage = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const element = container.current
      if (!element?.getClientRects().length) return
      if (document.querySelector('[role="dialog"]') && !element.closest('[role="dialog"]')) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return
      const destination = event.key === 'ArrowRight' ? next : previous
      if (destination === null) return
      event.preventDefault()
      onChange(destination)
    }
    document.addEventListener('keydown', turnPage)
    return () => document.removeEventListener('keydown', turnPage)
  }, [count, previous, next, onChange])

  if (count < 2) return null
  const unit = size === 2 ? '组' : '页'
  const range = end - start > 1 ? `${start + 1}–${end}` : String(start + 1)
  return <div ref={container} role="group" aria-label="琴谱翻页" className="flex shrink-0 items-center gap-1">
    <Button variant="outline" size="icon" aria-label={`上一${unit}琴谱`} title={`上一${unit}（←）`} disabled={previous === null} onClick={() => { if (previous !== null) onChange(previous) }}><ChevronLeft className="h-4 w-4" /></Button>
    <span aria-live="polite" className="min-w-24 text-center text-xs tabular-nums">第 {range} / {count} 页</span>
    <Button variant="outline" size="icon" aria-label={`下一${unit}琴谱`} title={`下一${unit}（→）`} disabled={next === null} onClick={() => { if (next !== null) onChange(next) }}><ChevronRight className="h-4 w-4" /></Button>
  </div>
}
