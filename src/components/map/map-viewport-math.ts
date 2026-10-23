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
