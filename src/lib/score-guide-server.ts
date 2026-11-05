import { Config, SearchClient, type SearchItem } from 'coder-coding-dev-sdk'
import type { AnalysisResult } from './score-analysis'
import { baselineScoreGuide, identity, type GuideEntry, type GuideField, type GuideSource, type ScoreGuide } from './score-guide'

type PublicFields = Partial<Record<Exclude<GuideField, 'melody'>, GuideEntry>>
const publicEntry = (text: string, source: GuideSource): GuideEntry => ({ kind: 'public', text, source })

const publicReferences: Array<{ title: string; composer: string; fields: PublicFields }> = [{
  title: 'Prelude to a Tragedy',
  composer: 'Lee Actor',
  fields: {
    workBackground: publicEntry('这首管弦乐作品由帕洛阿尔托爱乐乐团委约，该团于 2004 年 4 月首演，由作曲家本人指挥。', {
      title: 'Lee Actor 官网 · 作品目录', url: 'https://www.leeactor.com/works.htm',
    }),
    composerBackground: publicEntry('Lee Actor 是出生于美国丹佛的作曲家和指挥家。他的创作包括交响曲、协奏曲和室内乐。', {
      title: 'Lee Actor 官网 · 作曲家简介', url: 'https://www.leeactor.com/bio.htm',
    }),
    creationYear: publicEntry('2003 年', { title: 'Lee Actor 官网 · 作品目录', url: 'https://www.leeactor.com/works.htm' }),
    period: publicEntry('21 世纪初（按作品目录的创作年份划分）', { title: 'Lee Actor 官网 · 作品目录', url: 'https://www.leeactor.com/works.htm' }),
  },
}]

const hasIdentity = (text: string, term: string) => ` ${identity(text)} `.includes(` ${term} `)
const publishers = ['boosey.com', 'schott-music.com', 'universaledition.com', 'wise-music-classical.com']
const includesHost = (host: string, root: string) => host === root || host.endsWith(`.${root}`)

function trustedSource(item: SearchItem, composer: string): { source: GuideSource; composerSite: boolean } | null {
  if (!item.url || !item.title?.trim()) return null
  try {
    const url = new URL(item.url)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const host = url.hostname
    const officialComposer = host.replace(/^www\./, '').split('.').length === 2 &&
      host.replace(/^www\./, '').split('.')[0] === composer.replaceAll(' ', '') &&
      hasIdentity(item.title, composer) && /composer|作曲家/i.test(item.title)
    const trustedInstitution = /\.(?:edu|gov|ac\.[a-z]{2}|edu\.[a-z]{2}|gov\.[a-z]{2})$/i.test(host) ||
      publishers.some(publisher => includesHost(host, publisher))
    if (!officialComposer && !trustedInstitution) return null
    return { source: { title: item.title.trim().slice(0, 180), url: url.href }, composerSite: officialComposer }
  } catch {
    return null
  }
}

const excerpt = (text: string) => text.trim().split(/\s+/).slice(0, 12).join(' ').slice(0, 180)

export function guideFromSearchResults(items: SearchItem[], title: string, composer: string): PublicFields {
  const titleIdentity = identity(title)
  const composerIdentity = identity(composer)
  if (!titleIdentity || !composerIdentity) return {}
  const titlePattern = title.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
  const datedTitle = new RegExp(`(?:^|[^\\p{L}\\p{N}])${titlePattern}\\s*[（(]([12][0-9]{3})[)）]`, 'iu')
  const fields: PublicFields = {}
  const dates = new Map<string, GuideSource>()
  for (const item of items) {
    const trusted = trustedSource(item, composerIdentity)
    if (!trusted) continue
    const { source, composerSite } = trusted
    const snippet = item.snippet?.slice(0, 2200) ?? ''
    const segments = snippet.split(/(?<=[.!?。！？；;])\s+|\s*…\s*|\s+\.\.\.\s+/)
    const namedWorkPage = hasIdentity(source.title, titleIdentity) && hasIdentity(source.title, composerIdentity)
    const matchesWork = (text: string) => hasIdentity(text, titleIdentity) &&
      (composerSite || namedWorkPage || hasIdentity(text, composerIdentity))
    const workEvidence = segments.filter(matchesWork)
    if (workEvidence[0] && !fields.workBackground) {
      fields.workBackground = publicEntry(`原文摘录「${excerpt(workEvidence[0])}」`, source)
    }
    for (const evidence of [source.title, ...workEvidence].filter(matchesWork)) {
      const year = datedTitle.exec(evidence)?.[1]
      if (year) dates.set(year, source)
    }
    if (!fields.composerBackground && hasIdentity(source.title, composerIdentity) && /\b(?:composer|biography)\b|作曲家|生平/i.test(source.title)) {
      const bio = segments.find(text => hasIdentity(text, composerIdentity) && /\b(?:composer|composing|conductor|was born|born)\b|作曲|指挥|出生/i.test(text))
      if (bio) {
        fields.composerBackground = publicEntry(`原文摘录「${excerpt(bio)}」`, source)
      }
    }
  }
  if (dates.size === 1) {
    const [[year, source]] = dates
    fields.creationYear = publicEntry(`${year} 年`, source)
    fields.period = publicEntry(`${Math.ceil(Number(year) / 100)} 世纪（按创作年份划分）`, source)
  }
  return fields
}

export async function completeScoreGuide(result: AnalysisResult): Promise<ScoreGuide> {
  const { fields } = result.scoreGuide ?? baselineScoreGuide(result)
  const guide: ScoreGuide = { fields: { ...fields }, publicStatus: 'checked' }
  const title = result.title?.slice(0, 160)
  const composer = result.composer?.slice(0, 160)
  if (!title || !composer || !identity(title) || !identity(composer)) return guide

  const merge = (references: PublicFields) => {
    for (const field of Object.keys(references) as Array<keyof PublicFields>) {
      guide.fields[field] ??= references[field] ?? null
    }
  }
  const reference = publicReferences.find(entry => identity(entry.title) === identity(title) && identity(entry.composer) === identity(composer))
  if (reference) merge(reference.fields)
  if (guide.fields.workBackground && guide.fields.composerBackground && guide.fields.creationYear && guide.fields.period) return guide

  try {
    const client = new SearchClient(new Config({ timeout: 4500, retryTimes: 0 }))
    const [works, composers] = await Promise.all([
      client.webSearch(`"${identity(title)}" "${identity(composer)}"`.slice(0, 100), 8),
      client.webSearch(`"${identity(composer)}" composer biography`.slice(0, 100), 6),
    ])
    merge(guideFromSearchResults([...works, ...composers], title, composer))
  } catch {
    guide.publicStatus = 'unavailable'
  }
  return guide
}
