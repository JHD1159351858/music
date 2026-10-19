'use client'

import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ScorePageNavigation({ index, count, onChange }: { index: number; count: number; onChange: (index: number) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (count < 2) return
    const turnPage = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const element = container.current
      if (!element?.getClientRects().length) return
      if (document.querySelector('[role="dialog"]') && !element.closest('[role="dialog"]')) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return
      const next = index + (event.key === 'ArrowRight' ? 1 : -1)
      if (next < 0 || next >= count) return
      event.preventDefault()
      onChange(next)
    }
    document.addEventListener('keydown', turnPage)
    return () => document.removeEventListener('keydown', turnPage)
  }, [index, count, onChange])

  if (count < 2) return null
  return <div ref={container} role="group" aria-label="琴谱翻页" className="flex shrink-0 items-center gap-1">
    <Button variant="outline" size="icon" aria-label="上一页琴谱" title="上一页（←）" disabled={index === 0} onClick={() => onChange(index - 1)}><ChevronLeft className="h-4 w-4" /></Button>
    <span aria-live="polite" className="min-w-24 text-center text-xs tabular-nums">第 {index + 1} / {count} 页</span>
    <Button variant="outline" size="icon" aria-label="下一页琴谱" title="下一页（→）" disabled={index >= count - 1} onClick={() => onChange(index + 1)}><ChevronRight className="h-4 w-4" /></Button>
  </div>
}
