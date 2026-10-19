import assert from 'node:assert/strict'
import test from 'node:test'
import { getScorePages, scoreFileIds } from './score-pages'

test('ordered score pages take precedence and legacy single files remain readable', () => {
  const first = { file_id: 'page-1', image_url: '/first.png', file_name: '第一页', file_type: 'image/png' }
  const second = { ...first, file_id: 'page-2', image_url: '/second.png' }
  assert.deepEqual(getScorePages({ ...first, pages: [second, first] }), [second, first])
  assert.deepEqual(getScorePages({ ...first, pages: [] }), [first])
  assert.deepEqual(getScorePages({ file_id: null, image_url: null }), [])
  assert.deepEqual(scoreFileIds({ ...first, pages: [second, second] }), ['page-1', 'page-2'])
})
