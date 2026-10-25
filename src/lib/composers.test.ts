import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHINA_COMPOSERS, CHINA_ERAS, EUROPE_COMPOSERS, EUROPE_ERAS } from './composers'

test('each music history profile has traceable HTTPS references', () => {
  for (const composer of [...CHINA_COMPOSERS, ...EUROPE_COMPOSERS]) {
    assert.ok('sources' in composer && Array.isArray(composer.sources) && composer.sources.length > 0, `${composer.name} 缺少史实来源`)
    for (const source of composer.sources as Array<{ title: string; url: string }>) {
      assert.ok(source.title.trim())
      assert.equal(new URL(source.url).protocol, 'https:')
    }
  }
})

test('China eras all contain a profile and Europe eras include sourced Chinese context', () => {
  for (const era of CHINA_ERAS) assert.ok(CHINA_COMPOSERS.some(composer => composer.era === era.id), `${era.label} 尚无人选`)
  for (const era of EUROPE_ERAS) {
    assert.ok('chinaContext' in era && typeof era.chinaContext === 'string' && era.chinaContext.trim())
    assert.ok('sources' in era && Array.isArray(era.sources) && era.sources.length > 0)
  }
})

test('representative locations fall in their regions on the complete map images', () => {
  // Bounds are read from the full 1024×512 artwork, not the former square crop.
  const regions = [
    { id: 'boji', label: '武汉／湖北', bounds: [50, 55, 46, 52] },
    { id: 'liutianhua', label: '北平任教地', bounds: [55, 61, 28, 38] },
    { id: 'xianxinghai', label: '广州／广东', bounds: [50, 55, 56, 63] },
    { id: 'nieer', label: '昆明／云南', bounds: [39, 46, 54, 62] },
    { id: 'bach', label: '德国', bounds: [40, 48, 52, 65] },
    { id: 'mozart', label: '奥地利', bounds: [41, 50, 66, 73] },
    { id: 'beethoven', label: '波恩／德国', bounds: [37, 43, 56, 65] },
    { id: 'chopin', label: '华沙／波兰', bounds: [49, 56, 49, 60] },
    { id: 'debussy', label: '巴黎／法国', bounds: [31, 40, 61, 73] },
    { id: 'stravinsky', label: '俄罗斯西部', bounds: [57, 64, 32, 42] },
  ]
  const composers = [...CHINA_COMPOSERS, ...EUROPE_COMPOSERS]
  for (const { id, label, bounds: [left, right, top, bottom] } of regions) {
    const composer = composers.find(item => item.id === id)
    assert.ok(composer)
    assert.ok(composer.x >= left && composer.x <= right && composer.y >= top && composer.y <= bottom, `${composer.name} 应位于${label}的底图范围`)
  }
  for (const composer of composers) assert.ok(composer.x >= 0 && composer.x <= 100 && composer.y >= 0 && composer.y <= 100)
})
