export interface MapSize { width: number; height: number }
export interface MapPoint { x: number; y: number }
export interface MapView extends MapPoint { zoom: number }

export const INITIAL_MAP_VIEW: MapView = { zoom: 1, x: 0, y: 0 }

export function fitMapImage(image: MapSize, viewport: MapSize): MapSize {
  const scale = Math.max(0, Math.min((viewport.width - 32) / image.width, (viewport.height - 32) / image.height))
  return { width: image.width * scale, height: image.height * scale }
}

export function zoomMapAt(view: MapView, zoom: number, point: MapPoint): MapView {
  const next = Math.min(4, Math.max(1, zoom))
  const ratio = next / view.zoom
  return { zoom: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }
}

export function constrainMapView(view: MapView, fitted: MapSize, viewport: MapSize): MapView {
  const maxX = Math.max(0, (fitted.width * view.zoom - viewport.width) / 2)
  const maxY = Math.max(0, (fitted.height * view.zoom - viewport.height) / 2)
  return { ...view, x: maxX ? Math.min(maxX, Math.max(-maxX, view.x)) : 0, y: maxY ? Math.min(maxY, Math.max(-maxY, view.y)) : 0 }
}

export function mapPointFromClick(point: MapPoint, fitted: MapSize, view: MapView, moved = false): MapPoint | null {
  if (moved || fitted.width <= 0 || fitted.height <= 0) return null
  const x = ((point.x - view.x) / view.zoom / fitted.width + 0.5) * 100
  const y = ((point.y - view.y) / view.zoom / fitted.height + 0.5) * 100
  return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null
}

const PORTRAIT_OFFSETS = [
  { x: 0, y: 0 }, { x: 0, y: -50 }, { x: 50, y: 0 }, { x: 0, y: 50 }, { x: -50, y: 0 },
  { x: -36, y: -36 }, { x: 36, y: -36 }, { x: -36, y: 36 }, { x: 36, y: 36 },
]

export function placeMapPortraits(points: MapPoint[], fitted: MapSize, zoom: number): MapPoint[] {
  const centers: MapPoint[] = []
  const width = fitted.width * zoom
  const height = fitted.height * zoom
  return points.map(point => {
    const x = point.x / 100 * width
    const y = point.y / 100 * height
    const offset = PORTRAIT_OFFSETS.find(({ x: dx, y: dy }) => {
      const center = { x: x + dx, y: y + dy }
      if ((dx || dy) && (center.x < 22 || center.y < 22 || center.x > width - 22 || center.y > height - 22)) return false
      return centers.every(other => Math.hypot(center.x - other.x, center.y - other.y) >= 48)
    }) ?? PORTRAIT_OFFSETS[0]
    centers.push({ x: x + offset.x, y: y + offset.y })
    return offset
  })
}
