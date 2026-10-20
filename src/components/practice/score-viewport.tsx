'use client'

/* eslint-disable @next/next/no-img-element -- 签名琴谱保留原始分辨率，按视口计算显示尺寸。 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { fitScoreScale, INITIAL_SCORE_VIEW, pinchScoreView, zoomScoreAt, type Point, type ScoreView } from './score-viewport-math'

interface Props { src: string; title: string; view: ScoreView; onChange: (view: ScoreView) => void }
type Gesture = { view: ScoreView; point: Point; distance: number }

export function ScoreViewport({ src, title, view, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const viewRef = useRef(view)
  const changeRef = useRef(onChange)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [image, setImage] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)
  useLayoutEffect(() => {
    viewRef.current = view
    changeRef.current = onChange
  }, [view, onChange])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const point = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
      const next = zoomScoreAt(viewRef.current, viewRef.current.zoom * Math.exp(-delta * 0.002), point)
      viewRef.current = next
      changeRef.current(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel) }
  }, [])

  const update = (next: ScoreView) => { viewRef.current = next; onChange(next) }
  const point = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }
  const startGesture = () => {
    const [first, second] = [...pointers.current.values()]
    gesture.current = first ? {
      view: viewRef.current,
      point: second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
    } : null
    setDragging(pointers.current.size > 0)
  }
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    pointers.current.set(event.pointerId, point(event))
    event.currentTarget.setPointerCapture(event.pointerId)
    startGesture()
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, point(event))
    const [first, second] = [...pointers.current.values()]
    const start = gesture.current
    if (second && start.distance) {
      update(pinchScoreView(start.view, start.point, start.distance, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }, Math.hypot(second.x - first.x, second.y - first.y)))
    } else {
      update({ ...start.view, x: start.view.x + first.x - start.point.x, y: start.view.y + first.y - start.point.y })
    }
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    startGesture()
  }
  const scale = fitScoreScale(image, viewport) * view.zoom

  return <div
    ref={container}
    aria-label="琴谱画布，可拖动移动、滚轮或双指缩放"
    className={`relative h-full w-full touch-none select-none overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
    onDoubleClick={() => update(INITIAL_SCORE_VIEW)}
  >
    <img
      src={src} alt={`${title}完整琴谱`} draggable={false}
      onLoad={event => setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ width: image.width * scale, height: image.height * scale, left: `calc(50% + ${view.x}px)`, top: `calc(50% + ${view.y}px)`, transform: 'translate(-50%, -50%)' }}
    />
    <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] text-muted-foreground">拖动移动 · 滚轮／双指缩放 · 双击复位</p>
  </div>
}
