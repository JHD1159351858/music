'use client'

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { constrainMapView, fitMapImage, INITIAL_MAP_VIEW, mapPointFromClick, zoomMapAt, type MapPoint, type MapView } from './map-viewport-math'

interface Props { src: string; title: string; era?: string; children: ReactNode; selectingPoint?: boolean; onSelectPoint?: (point: MapPoint) => void }
type Gesture = { view: MapView; point: MapPoint; distance: number }

export function MusicMapViewport({ src, title, era, children, selectingPoint = false, onSelectPoint }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [view, setView] = useState(INITIAL_MAP_VIEW)
  const [dragging, setDragging] = useState(false)
  const fitted = fitMapImage({ width: 1024, height: 512 }, viewport)
  const viewRef = useRef(view)
  const geometryRef = useRef({ fitted, viewport })
  const pointers = useRef(new Map<number, MapPoint>())
  const gesture = useRef<Gesture | null>(null)
  const moved = useRef(false)

  useLayoutEffect(() => { geometryRef.current = { fitted, viewport } }, [fitted, viewport])

  function update(next: MapView) {
    const geometry = geometryRef.current
    const bounded = constrainMapView(next, geometry.fitted, geometry.viewport)
    viewRef.current = bounded
    setView(bounded)
  }

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
      viewRef.current = INITIAL_MAP_VIEW
      setView(INITIAL_MAP_VIEW)
    })
    observer.observe(element)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const point = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
      const geometry = geometryRef.current
      const next = constrainMapView(zoomMapAt(viewRef.current, viewRef.current.zoom * Math.exp(-delta * 0.002), point), geometry.fitted, geometry.viewport)
      viewRef.current = next
      setView(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel) }
  }, [])

  function point(event: ReactPointerEvent<HTMLDivElement>): MapPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  function startGesture() {
    const [first, second] = [...pointers.current.values()]
    gesture.current = first ? {
      view: viewRef.current,
      point: second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    } : null
    setDragging(pointers.current.size > 0)
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!pointers.current.size) moved.current = false
    pointers.current.set(event.pointerId, point(event))
    if (pointers.current.size > 1) moved.current = true
    const target = event.target instanceof Element ? event.target.closest('button') ?? event.currentTarget : event.currentTarget
    target.setPointerCapture(event.pointerId)
    startGesture()
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, point(event))
    const [first, second] = [...pointers.current.values()]
    const start = gesture.current
    if (second && start.distance) {
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const zoomed = zoomMapAt(start.view, start.view.zoom * Math.hypot(second.x - first.x, second.y - first.y) / start.distance, start.point)
      update({ ...zoomed, x: zoomed.x + midpoint.x - start.point.x, y: zoomed.y + midpoint.y - start.point.y })
    } else if (moved.current || Math.hypot(first.x - start.point.x, first.y - start.point.y) > 4) {
      moved.current = true
      update({ ...start.view, x: start.view.x + first.x - start.point.x, y: start.view.y + first.y - start.point.y })
    }
  }

  function up(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.delete(event.pointerId)) return
    startGesture()
  }

  return <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground"><span className="mr-2 font-medium text-foreground">{era}</span>{title} · 地域分布示意</div>
      <div className="flex items-center gap-1" aria-label="地图缩放工具">
        <Button variant="ghost" size="icon" aria-label="缩小地图" disabled={view.zoom <= 1} onClick={() => update(zoomMapAt(viewRef.current, viewRef.current.zoom / 1.25, { x: 0, y: 0 }))}><Minus className="size-4" /></Button>
        <output aria-label="地图缩放比例" className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(view.zoom * 100)}%</output>
        <Button variant="ghost" size="icon" aria-label="放大地图" disabled={view.zoom >= 4} onClick={() => update(zoomMapAt(viewRef.current, viewRef.current.zoom * 1.25, { x: 0, y: 0 }))}><Plus className="size-4" /></Button>
        <Button variant="ghost" size="sm" aria-label="显示完整地图" onClick={() => update(INITIAL_MAP_VIEW)}><Maximize className="size-4" />全图</Button>
      </div>
    </div>
    <div ref={canvasRef} role="group" aria-label="音乐史地图画布" className={`relative h-[360px] w-full touch-none select-none overflow-hidden bg-muted/20 sm:h-[480px] lg:h-auto lg:min-h-0 lg:flex-1 ${dragging ? 'cursor-grabbing' : selectingPoint ? 'cursor-crosshair' : 'cursor-grab'}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={event => { moved.current = true; up(event) }} onLostPointerCapture={up} onDragStart={event => event.preventDefault()} onClickCapture={event => {
      if (moved.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); moved.current = false; return }
      if (!selectingPoint) return
      event.preventDefault()
      event.stopPropagation()
      if (event.target instanceof Element && event.target.closest('button')) return
      const rect = event.currentTarget.getBoundingClientRect()
      const selected = mapPointFromClick({ x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }, geometryRef.current.fitted, viewRef.current)
      if (selected) onSelectPoint?.(selected)
    }}>
      <div className="absolute" style={{ width: fitted.width, height: fitted.height, left: `calc(50% + ${view.x}px)`, top: `calc(50% + ${view.y}px)`, transform: `translate(-50%, -50%) scale(${view.zoom})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} width={1024} height={512} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full max-w-none opacity-80" />
        {children}
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] text-muted-foreground">拖动移动 · 滚轮／双指缩放 · 点击全图复位</p>
    </div>
  </div>
}
