export interface ScoreView { zoom: number; x: number; y: number }
export interface Point { x: number; y: number }
interface Size { width: number; height: number }

export const INITIAL_SCORE_VIEW: ScoreView = { zoom: 1, x: 0, y: 0 }
export const MIN_SCORE_ZOOM = 0.25
export const MAX_SCORE_ZOOM = 4

export function fitScoreScale(image: Size, viewport: Size): number {
  if (!image.width || !image.height || viewport.width <= 48 || viewport.height <= 48) return 0
  return Math.min((viewport.width - 48) / image.width, (viewport.height - 48) / image.height)
}

export function zoomScoreAt(view: ScoreView, zoom: number, point: Point): ScoreView {
  const next = Math.min(MAX_SCORE_ZOOM, Math.max(MIN_SCORE_ZOOM, zoom))
  const ratio = next / view.zoom
  return { zoom: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }
}

export function pinchScoreView(view: ScoreView, start: Point, startDistance: number, current: Point, distance: number): ScoreView {
  const zoomed = zoomScoreAt(view, view.zoom * distance / Math.max(1, startDistance), start)
  return { ...zoomed, x: zoomed.x + current.x - start.x, y: zoomed.y + current.y - start.y }
}
