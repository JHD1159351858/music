import assert from 'node:assert/strict'
import test from 'node:test'
import { fitScoreScale, zoomScoreAt, pinchScoreView, INITIAL_SCORE_VIEW, getScoreSpread, getScoreDragDirection, canTurnFromScoreRegion, canPinchScoreRegion } from './score-viewport-math'

test('portrait and landscape scores fit completely inside the available viewport', () => {
  for (const [image, viewport] of [
    [{ width: 1000, height: 1080 }, { width: 1109, height: 980 }],
    [{ width: 2400, height: 900 }, { width: 1109, height: 980 }],
    [{ width: 1000, height: 3000 }, { width: 390, height: 600 }],
  ]) {
    const scale = fitScoreScale(image, viewport)
    assert.ok(image.width * scale <= viewport.width - 48)
    assert.ok(image.height * scale <= viewport.height - 48)
  }
})

test('wheel zoom keeps the score point under the pointer and preserves a dragged position', () => {
  const before = { zoom: 1, x: 40, y: -20 }
  const pointer = { x: 120, y: 80 }
  const after = zoomScoreAt(before, 2, pointer)
  assert.deepEqual(after, { zoom: 2, x: -40, y: -120 })
  assert.equal((pointer.x - before.x) / before.zoom, (pointer.x - after.x) / after.zoom)
  assert.equal((pointer.y - before.y) / before.zoom, (pointer.y - after.y) / after.zoom)
})

test('two-finger pinch combines zoom with movement of the fingers midpoint', () => {
  const after = pinchScoreView(INITIAL_SCORE_VIEW, { x: 50, y: 50 }, 100, { x: 80, y: 90 }, 200)
  assert.deepEqual(after, { zoom: 2, x: -20, y: -10 })
  assert.equal(zoomScoreAt(INITIAL_SCORE_VIEW, 100, { x: 0, y: 0 }).zoom, 4)
  assert.equal(zoomScoreAt(INITIAL_SCORE_VIEW, 0.001, { x: 0, y: 0 }).zoom, 0.25)
})

test('double page mode shows the spread containing the current page and stops at an odd last page', () => {
  assert.deepEqual(getScoreSpread(0, 7, 2), { start: 0, end: 2, previous: null, next: 2 })
  assert.deepEqual(getScoreSpread(3, 7, 2), { start: 2, end: 4, previous: 0, next: 4 })
  assert.deepEqual(getScoreSpread(6, 7, 2), { start: 6, end: 7, previous: 4, next: null })
})

test('switching to single page keeps the current page and moves one page at a time', () => {
  assert.deepEqual(getScoreSpread(3, 7, 1), { start: 3, end: 4, previous: 2, next: 4 })
  assert.deepEqual(getScoreSpread(6, 7, 1), { start: 6, end: 7, previous: 5, next: null })
})

test('only a deliberate horizontal drag turns toward the previous or next spread', () => {
  assert.equal(getScoreDragDirection({ x: -140, y: 8 }, 1000), 1)
  assert.equal(getScoreDragDirection({ x: 70, y: 0 }, 390), -1)
  assert.equal(getScoreDragDirection({ x: -35, y: 0 }, 390), 0)
  assert.equal(getScoreDragDirection({ x: -140, y: 130 }, 1000), 0)
})

test('the gutter turns a spread while either pane is magnified', () => {
  assert.equal(canTurnFromScoreRegion('gutter', 2, true), true)
  assert.equal(canTurnFromScoreRegion('left', 2, true), false)
  assert.equal(canTurnFromScoreRegion('right', 1.5, true), false)
  assert.equal(canTurnFromScoreRegion('right', 1, true), true)
  assert.equal(canTurnFromScoreRegion('gutter', 2, false), false)
})

test('a second touch pinches only within the first touch pane', () => {
  assert.equal(canPinchScoreRegion('left', 'left'), true)
  assert.equal(canPinchScoreRegion('right', 'right'), true)
  assert.equal(canPinchScoreRegion('left', 'right'), false)
  assert.equal(canPinchScoreRegion('gutter', 'gutter'), false)
  assert.equal(canPinchScoreRegion('right', 'gutter'), false)
})
