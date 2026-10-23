import assert from 'node:assert/strict'
import test from 'node:test'
import { fitMapImage, constrainMapView, zoomMapAt } from './map-viewport-math'
import * as math from './map-viewport-math'

test('the complete landscape map fits narrow and wide viewports without cropping', () => {
  for (const viewport of [{ width: 366, height: 360 }, { width: 870, height: 560 }, { width: 1900, height: 680 }]) {
    const fitted = fitMapImage({ width: 1024, height: 512 }, viewport)
    assert.equal(fitted.width / fitted.height, 2)
    assert.ok(fitted.width <= viewport.width - 32)
    assert.ok(fitted.height <= viewport.height - 32)
  }
})

test('zoom preserves the map point under the pointer and limits magnification', () => {
  const view = { zoom: 1, x: 0, y: 0 }
  const point = { x: 80, y: -20 }
  const next = zoomMapAt(view, 2, point)
  assert.equal((point.x - view.x) / view.zoom, (point.x - next.x) / next.zoom)
  assert.equal((point.y - view.y) / view.zoom, (point.y - next.y) / next.zoom)
  assert.equal(zoomMapAt(view, 100, point).zoom, 4)
  assert.equal(zoomMapAt(view, 0.1, point).zoom, 1)
})

test('panning cannot lose the map and returning to full view recenters it', () => {
  const viewport = { width: 800, height: 500 }
  const fitted = { width: 768, height: 384 }
  const moved = constrainMapView({ zoom: 2, x: 9999, y: -9999 }, fitted, viewport)
  assert.deepEqual(moved, { zoom: 2, x: 368, y: -134 })
  assert.deepEqual(constrainMapView({ zoom: 1, x: 400, y: -200 }, fitted, viewport), { zoom: 1, x: 0, y: 0 })
})

test('placing a musician reverses zoom and pan into full-image percentage coordinates', () => {
  assert.equal(typeof math.mapPointFromClick, 'function', 'map selection must have an inverse transform')
  const fitted = { width: 800, height: 400 }
  assert.deepEqual(math.mapPointFromClick({ x: 200, y: -100 }, fitted, { zoom: 1, x: 0, y: 0 }), { x: 75, y: 25 })
  assert.deepEqual(math.mapPointFromClick({ x: 440, y: -240 }, fitted, { zoom: 2, x: 40, y: -40 }), { x: 75, y: 25 })
  assert.deepEqual(math.mapPointFromClick({ x: -690, y: 275 }, fitted, { zoom: 3, x: -90, y: -25 }), { x: 25, y: 75 })
})

test('blank space outside the image and completed gestures do not place a musician', () => {
  assert.equal(typeof math.mapPointFromClick, 'function')
  const fitted = { width: 800, height: 400 }
  const view = { zoom: 1, x: 0, y: 0 }
  assert.equal(math.mapPointFromClick({ x: 0, y: 201 }, fitted, view), null)
  assert.equal(math.mapPointFromClick({ x: 401, y: 0 }, fitted, view), null)
  assert.equal(math.mapPointFromClick({ x: 0, y: 0 }, fitted, view, true), null)
  assert.equal(math.mapPointFromClick({ x: 0, y: 0 }, { width: 0, height: 0 }, view), null)
  assert.deepEqual(math.mapPointFromClick({ x: -400, y: 200 }, fitted, view), { x: 0, y: 100 })
})
