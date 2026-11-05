'use client'

/* eslint-disable @next/next/no-img-element -- 签名琴谱保留原始分辨率，按视口计算显示尺寸。 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { canPinchScoreRegion, canTurnFromScoreRegion, fitScoreScale, getScoreDragDirection, INITIAL_SCORE_VIEW, pinchScoreView, zoomScoreAt, type Point, type ScoreGestureRegion, type ScorePane, type ScoreTurnDirection, type ScoreView } from './score-viewport-math'

export interface ScoreViewportPage { src: string; alt: string }
interface Spread {
  current: ScoreViewportPage[]
  previous: ScoreViewportPage[]
  next: ScoreViewportPage[]
  onTurn: (direction: ScoreTurnDirection) => void
}
interface PaneControl { view: ScoreView; onChange: (view: ScoreView) => void }
type Props = PaneControl & (
  { src: string; title: string; spread?: never; rightPane?: never } | { src?: never; title?: never; spread: Spread; rightPane?: PaneControl }
)
type Gesture = { region: ScoreGestureRegion; view: ScoreView; point: Point; distance: number; turning: boolean }
const TURN_DURATION_MS = 220
const SCORE_AREA = 'absolute inset-x-[max(1.5rem,5%)] inset-y-6'
const DUAL_SCORE_AREA = 'absolute inset-x-[clamp(.5rem,1.25vw,1.25rem)] inset-y-6'
const SCORE_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_2.75rem_minmax(0,1fr)] grid-rows-1'

function scoreRegion(target: EventTarget | null): ScoreGestureRegion {
  const region = target instanceof Element ? target.closest<HTMLElement>('[data-score-region]')?.dataset.scoreRegion : undefined
  return region === 'left' || region === 'right' ? region : 'gutter'
}

function scorePoint(element: HTMLDivElement, region: ScoreGestureRegion, clientX: number, clientY: number): Point {
  const pane = region === 'gutter' ? element : element.querySelector(`[data-score-region="${region}"]`) ?? element
  const rect = pane.getBoundingClientRect()
  return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
}

export function ScoreViewport({ src, title, spread, view, onChange, rightPane }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const viewRef = useRef({ left: view, right: rightPane?.view ?? INITIAL_SCORE_VIEW })
  const changeRef = useRef({ left: onChange, right: rightPane?.onChange })
  const pointers = useRef(new Map<number, Point>())
  const gestureRegion = useRef<ScoreGestureRegion>('left')
  const blockedGesture = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [image, setImage] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const dual = rightPane !== undefined
  const canTurn = Boolean(spread && (spread.previous.length || spread.next.length))
  useLayoutEffect(() => {
    viewRef.current = { left: view, right: rightPane?.view ?? INITIAL_SCORE_VIEW }
    changeRef.current = { left: onChange, right: rightPane?.onChange }
  }, [view, onChange, rightPane])
  useEffect(() => () => { if (turnTimer.current !== null) clearTimeout(turnTimer.current) }, [])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    const wheel = (event: WheelEvent) => {
      const region = dual ? scoreRegion(event.target) : 'left'
      if (region === 'gutter') return
      event.preventDefault()
      if (turnTimer.current !== null) return
      const point = scorePoint(element, region, event.clientX, event.clientY)
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      const current = viewRef.current[region]
      const next = zoomScoreAt(current, current.zoom * Math.exp(-delta * 0.002), point)
      viewRef.current[region] = next
      changeRef.current[region]?.(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel) }
  }, [dual])

  const update = (pane: ScorePane, next: ScoreView) => {
    viewRef.current[pane] = next
    changeRef.current[pane]?.(next)
  }
  const point = (event: ReactPointerEvent<HTMLDivElement>) => scorePoint(event.currentTarget, gestureRegion.current, event.clientX, event.clientY)
  const startGesture = (allowTurn = false) => {
    const [first, second] = [...pointers.current.values()]
    const region = gestureRegion.current
    const view = viewRef.current[region === 'right' ? 'right' : 'left']
    gesture.current = first && !blockedGesture.current ? {
      region, view,
      point: second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first,
      distance: second ? Math.hypot(second.x - first.x, second.y - first.y) : 0,
      turning: allowTurn && !second && canTurnFromScoreRegion(region, view.zoom, canTurn),
    } : null
    setDragging(gesture.current !== null)
  }
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (turnTimer.current !== null || pointers.current.size >= 2) return
    event.preventDefault()
    const region = dual ? scoreRegion(event.target) : 'left'
    if (pointers.current.size === 0) {
      gestureRegion.current = region
      blockedGesture.current = false
    } else if (!canPinchScoreRegion(gestureRegion.current, region)) {
      blockedGesture.current = true
    }
    pointers.current.set(event.pointerId, point(event))
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pointers.current.size === 2) setDragOffset(0)
    startGesture(true)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, point(event))
    const [first, second] = [...pointers.current.values()]
    const start = gesture.current
    if (second && start.distance && start.region !== 'gutter') {
      update(start.region, pinchScoreView(start.view, start.point, start.distance, { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }, Math.hypot(second.x - first.x, second.y - first.y)))
    } else if (start.turning && spread) {
      const x = first.x - start.point.x
      const y = first.y - start.point.y
      const neighbor = x < 0 ? spread.next : spread.previous
      setDragOffset(Math.abs(x) > Math.abs(y) ? x * (neighbor.length ? 1 : 0.18) : 0)
    } else if (start.region !== 'gutter') {
      update(start.region, { ...start.view, x: start.view.x + first.x - start.point.x, y: start.view.y + first.y - start.point.y })
    }
  }
  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return
    const start = gesture.current
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    startGesture()
    if (start?.turning && spread && !cancelled) {
      const end = point(event)
      const width = event.currentTarget.clientWidth
      const direction = getScoreDragDirection({ x: end.x - start.point.x, y: end.y - start.point.y }, width)
      if (direction !== 0 && (direction === 1 ? spread.next : spread.previous).length) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          spread.onTurn(direction)
        } else {
          setDragOffset(-direction * width)
          turnTimer.current = setTimeout(() => {
            turnTimer.current = null
            spread.onTurn(direction)
          }, TURN_DURATION_MS)
        }
        return
      }
    }
    setDragOffset(0)
  }
  const scale = fitScoreScale(image, viewport) * view.zoom
  const showNeighbors = canTurn && view.zoom <= 1 && (!rightPane || rightPane.view.zoom <= 1)
  const turnAtFit = canTurn && view.zoom <= 1
  const hint = turnAtFit ? '左右拖动翻页' : '拖动移动'
  const dualHint = canTurn ? '拖动中缝翻谱 · 左右谱页独立缩放与复位' : '左右谱页独立缩放与复位'

  return <div
    ref={container}
    aria-label={dual ? `琴谱画布，${dualHint}` : `琴谱画布，可${hint}、滚轮或双指缩放`}
    className={`relative h-full w-full touch-none select-none overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    onPointerDown={down} onPointerMove={move}
    onPointerUp={event => finishGesture(event, false)}
    onPointerCancel={event => finishGesture(event, true)}
    onLostPointerCapture={event => finishGesture(event, true)}
    onDoubleClick={() => {
      const region = gestureRegion.current
      if (region !== 'gutter') update(region, INITIAL_SCORE_VIEW)
    }}
  >
    {spread ? <ScoreSpreadRail spread={spread} view={view} rightView={rightPane?.view} offset={dragOffset} dragging={dragging} showNeighbors={showNeighbors} /> : <img
      src={src} alt={`${title}完整琴谱`} draggable={false}
      onLoad={event => setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ width: image.width * scale, height: image.height * scale, left: `calc(50% + ${view.x}px)`, top: `calc(50% + ${view.y}px)`, transform: 'translate(-50%, -50%)' }}
    />}
    {dual && <div className={`pointer-events-none ${DUAL_SCORE_AREA} ${SCORE_COLUMNS}`}>
      <div data-score-region="left" className="pointer-events-auto" />
      <div data-score-region="gutter" role="group" aria-label={canTurn ? '中缝拖动翻谱' : undefined} className="pointer-events-auto relative flex items-center justify-center">
        {canTurn && <>
          <span aria-hidden="true" className="absolute inset-y-0 left-1/2 border-l border-primary/20" />
          <span aria-hidden="true" className="relative rounded-full border border-primary/30 bg-card px-1 py-2 text-[10px] text-muted-foreground [writing-mode:vertical-rl]">拖动翻谱</span>
        </>}
      </div>
      <div data-score-region="right" className="pointer-events-auto" />
    </div>}
    <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] text-muted-foreground">{dual ? dualHint : `${hint} · 滚轮／双指缩放 · 双击复位`}</p>
  </div>
}

function ScoreSpreadRail({ spread, view, rightView, offset, dragging, showNeighbors }: { spread: Spread; view: ScoreView; rightView?: ScoreView; offset: number; dragging: boolean; showNeighbors: boolean }) {
  const groups = [spread.previous, spread.current, spread.next]
  const previousPage = spread.previous.at(-1)
  const nextPage = spread.next[0]
  const previewOpacity = Math.max(0, 0.55 - Math.abs(offset) / 160)
  const previewWidth = rightView ? 'w-1.5 sm:w-2' : 'w-[4%] max-w-10'
  return <div className="pointer-events-none absolute inset-0">
    {groups.map((pages, index) => {
      const current = index === 1
      if (!pages.length || !current && !showNeighbors && offset === 0) return null
      return <div
        key={index}
        aria-hidden={!current}
        className={`absolute inset-y-0 w-full ${dragging ? '' : 'transition-transform duration-[220ms] ease-out motion-reduce:transition-none'}`}
        style={{ left: `${(index - 1) * 100}%`, transform: `translateX(${offset}px)` }}
      >
        <div className={pages.length === 2 ? `${DUAL_SCORE_AREA} ${SCORE_COLUMNS}` : SCORE_AREA}>
          {pages.map((page, pageIndex) => {
            const pane = pageIndex === 0 ? view : rightView ?? INITIAL_SCORE_VIEW
            return <div key={pageIndex} className={`h-full min-h-0 min-w-0 ${pages.length === 2 ? `overflow-hidden ${pageIndex === 0 ? 'col-start-1' : 'col-start-3'}` : ''}`}>
              <img src={page.src} alt={current ? page.alt : ''} draggable={false} className="h-full w-full object-contain" style={current ? { transform: `translate(${pane.x}px, ${pane.y}px) scale(${pane.zoom})` } : undefined} />
            </div>
          })}
        </div>
      </div>
    })}
    {showNeighbors && previousPage && <img aria-hidden="true" src={previousPage.src} alt="" draggable={false} className={`absolute top-1/2 left-0 h-[42%] ${previewWidth} -translate-y-1/2 rounded-r-md border border-l-0 border-primary/35 object-cover object-right`} style={{ opacity: previewOpacity }} />}
    {showNeighbors && nextPage && <img aria-hidden="true" src={nextPage.src} alt="" draggable={false} className={`absolute top-1/2 right-0 h-[42%] ${previewWidth} -translate-y-1/2 rounded-l-md border border-r-0 border-primary/35 object-cover object-left`} style={{ opacity: previewOpacity }} />}
  </div>
}
