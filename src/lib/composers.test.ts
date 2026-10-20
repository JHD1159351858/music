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
