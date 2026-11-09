'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, BookOpen, Check, Download, FileMusic, Music2, Play, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScoreCover } from '@/components/practice/score-cover'
import { MusicMapViewport } from '@/components/map/music-map-viewport'
import { MapPortraits } from '@/components/map/map-portraits'
import { CHINA_COMPOSERS, CHINA_ERAS, EUROPE_COMPOSERS, EUROPE_ERAS } from '@/lib/composers'
import { CHINA_MAP_REVISION, type MapKind, type MapMusician } from '@/lib/map-musician-types'
import type { GuestModulePath } from '@/lib/guest-modules'
import { cn } from '@/lib/utils'

const MODULES: Record<GuestModulePath, { title: string; description: string }> = {
  '/practice': { title: '曲库选谱', description: '从一首钢琴作品开始，找到今天的练习方向。' },
  '/analysis': { title: '乐谱分析', description: '从音符、节拍到和声，读懂谱面里的音乐语言。' },
  '/tasks': { title: '练习任务与评阅', description: '了解练习要求、提交材料与教师反馈的完整过程。' },
  '/community': { title: '练琴社区', description: '围绕钢琴演奏交流方法，分享练习中的发现。' },
  '/map': { title: '音乐史地图', description: '沿时间线与地图，阅读音乐家的故事和代表作品。' },
  '/stats': { title: '练琴数据', description: '把每一次练习的积累，整理成自己的成长记录。' },
}

const PIECES = [
  { id: 'guest-moonlight', title: '月光奏鸣曲', composer: '贝多芬', period: '古典主义', cover_url: '/covers/moonlight.png', focus: '聆听持续三连音中的旋律线条，留意左右手音量的层次。' },
  { id: 'guest-nocturne', title: '降E大调夜曲', composer: '肖邦', period: '浪漫主义', cover_url: '/covers/nocturne.png', focus: '从慢速练习开始，体会旋律的呼吸与伴奏的均匀。' },
  { id: 'guest-pastoral', title: '牧童短笛', composer: '贺绿汀', period: '中国钢琴作品', cover_url: '/covers/pastoral.png', focus: '分别聆听两条旋律，练习声部之间的呼应与独立。' },
]

function LoginAction({ href, children }: { href: string; children: React.ReactNode }) {
  return <Button asChild><Link href={href}>{children}<ArrowRight className="size-4" /></Link></Button>
}

export function GuestModule({ pathname }: { pathname: GuestModulePath }) {
  const page = MODULES[pathname]
  const loginHref = `/?login=1&next=${encodeURIComponent(pathname)}`
  return <div className={cn('concert-module space-y-6', pathname === '/map' && 'concert-map')}>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><Badge variant="outline" className="mb-3 border-primary/30 text-primary">访客浏览</Badge><h1 className="font-serif text-3xl text-foreground">{page.title}</h1><p className="mt-2 text-sm text-muted-foreground">{page.description}</p></div>
      <LoginAction href={loginHref}>登录课堂</LoginAction>
    </header>
    <p className="text-sm leading-6 text-muted-foreground">你正在浏览公开内容与功能示例。登录后可使用自己的课程、练习记录和教师反馈。</p>
    {pathname === '/practice' && <GuestRepertoire loginHref={loginHref} />}
    {pathname === '/analysis' && <GuestAnalysis loginHref={loginHref} />}
    {pathname === '/tasks' && <GuestTasks loginHref={loginHref} />}
    {pathname === '/community' && <GuestCommunity loginHref={loginHref} />}
    {pathname === '/map' && <GuestMap />}
    {pathname === '/stats' && <GuestStats loginHref={loginHref} />}
  </div>
}

function GuestRepertoire({ loginHref }: { loginHref: string }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(PIECES[0].id)
  const selected = PIECES.find(piece => piece.id === selectedId) ?? PIECES[0]
  const pieces = PIECES.filter(piece => `${piece.title} ${piece.composer} ${piece.period}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="space-y-6">
    <section aria-label="已选示例曲目" className="grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-start justify-center gap-4 p-6 md:p-8"><Badge variant="secondary">曲目展示示例</Badge><h2 className="font-serif text-3xl">{selected.title}</h2><p className="text-sm text-muted-foreground">{selected.composer} · {selected.period}</p><p className="max-w-lg text-sm leading-7 text-muted-foreground">{selected.focus}</p><LoginAction href={loginHref}><Play className="size-4" />登录后开始练习</LoginAction></div>
      <div className="h-52 md:h-80"><ScoreCover score={selected} priority /></div>
    </section>
    <div className="relative max-w-md"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索示例曲目" placeholder="搜索示例曲目、作曲家或时期" value={query} onChange={event => setQuery(event.target.value)} className="bg-card pl-9" /></div>
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {pieces.map(piece => <button key={piece.id} type="button" aria-label={`选择示例曲目${piece.title}`} aria-pressed={piece.id === selectedId} onClick={() => setSelectedId(piece.id)} className={cn('overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-ring', piece.id === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border')}>
        <div className="h-44"><ScoreCover score={piece} /></div><div className="space-y-2 p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-serif text-xl">{piece.title}</h3>{piece.id === selectedId && <Check className="size-4 text-primary" />}</div><p className="text-sm text-muted-foreground">{piece.composer}</p><Badge variant="outline">示例曲目</Badge></div>
      </button>)}
    </div>
    {!pieces.length && <p role="status" className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">没有匹配的示例曲目，请换一个关键词。</p>}
    <p className="text-xs leading-6 text-muted-foreground">以上仅展示曲目与练习方向，不代表当前课堂已发布的琴谱。登录后查看可用谱库。</p>
  </div>
}

function GuestAnalysis({ loginHref }: { loginHref: string }) {
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <section className="rounded-xl border border-border bg-card p-6 md:p-8"><FileMusic className="mb-5 size-10 text-primary" /><h2 className="font-serif text-2xl">从一份 MusicXML 乐谱开始</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">登录后上传 .musicxml、.mxl 或 .xml 文件，解析实际音符、节拍与和声。文件不超过 8 MiB；图片或 PDF 需先转换为 MusicXML，才能进行结构化解析。</p><div className="mt-6 flex flex-wrap gap-3"><LoginAction href={loginHref}>登录后上传分析</LoginAction><Button asChild variant="outline"><a href="/examples/music21-demo.musicxml" download><Download className="size-4" />下载示例乐谱</a></Button></div><p className="mt-4 text-xs leading-6 text-muted-foreground">示例文件由项目编写，用于体验解析流程，不是真实学生作品。</p></section>
    <section className="space-y-5 rounded-xl border border-border bg-card p-6"><h2 className="font-serif text-xl">读谱可以关注什么</h2>{[['节拍与节奏', '结合拍号、时值和重音，理解音乐的律动。'], ['调性与和声', '对照原谱观察调性、和弦与乐句之间的关系。'], ['声部与结构', '分辨旋律和伴奏，整理作品的段落与重复。']].map(([title, detail]) => <div key={title} className="border-t border-border pt-4"><h3 className="text-sm font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>)}<p className="text-xs leading-6 text-muted-foreground">图片识别和 ABC 文本也可在登录后使用；识别结果需结合原谱复核。</p></section>
  </div>
}

function GuestTasks({ loginHref }: { loginHref: string }) {
  return <section className="rounded-xl border border-border bg-card p-6 md:p-8">
    <Badge variant="secondary">任务示例 · 非真实班级任务</Badge><h2 className="mt-5 font-serif text-2xl">本周练习：C 大调音阶与琶音</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">先分手慢练，关注指法、节拍和声音均匀；熟悉后再合手。示例用于说明练习流程，具体速度与要求以教师布置为准。</p>
    <div className="my-8 grid gap-6 md:grid-cols-3">{[['01', '阅读任务', '查看指定曲目、练习要求与提交时间。'], ['02', '完成练习', '进入琴谱，记录练习时长并保存录音。'], ['03', '查看评阅', '提交练习材料，阅读教师反馈并继续改进。']].map(([number, title, description]) => <div key={number} className="border-t border-border pt-5"><span className="font-serif text-3xl text-primary/60">{number}</span><h3 className="mt-3 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>)}</div>
    <LoginAction href={loginHref}>登录后查看我的任务</LoginAction>
  </section>
}

function GuestCommunity({ loginHref }: { loginHref: string }) {
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
    <div className="space-y-4">{[['练习方法', '慢练时，你会先关注什么？', '把一段乐句放慢，分别聆听节奏、触键和声部。可以从一个具体问题开始记录自己的发现。'], ['作品交流', '怎样让旋律更有歌唱性？', '试着先唱出旋律，再回到琴键；讨论乐句的起伏、呼吸和伴奏的层次。'], ['练习记录', '为一次练习留下一个小目标', '选择一处需要改进的小节，写下练习前后的感受，让下一次练习有迹可循。']].map(([tag, title, description]) => <article key={title} className="rounded-xl border border-border bg-card p-6"><div className="mb-4 flex gap-2"><Badge variant="outline">{tag}</Badge><Badge variant="secondary">话题示例</Badge></div><h2 className="font-serif text-xl">{title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p></article>)}</div>
    <aside className="rounded-xl border border-border bg-card p-6"><Music2 className="size-8 text-primary" /><h2 className="mt-4 font-serif text-xl">让交流回到音乐本身</h2><p className="my-4 text-sm leading-7 text-muted-foreground">这里展示交流话题示例。登录后可阅读课堂动态，发布练琴心得并参与讨论。</p><LoginAction href={loginHref}>登录后参与交流</LoginAction></aside>
  </div>
}

function GuestStats({ loginHref }: { loginHref: string }) {
  return <div className="space-y-6">
    <section className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center"><BarChart3 className="mb-5 size-10 text-primary" /><h2 className="font-serif text-2xl">登录后查看你的练琴数据</h2><p className="my-5 max-w-lg text-sm leading-7 text-muted-foreground">练习时长、次数与曲目记录将根据你的实际练习整理。访客模式不显示个人成绩或班级数据。</p><LoginAction href={loginHref}>查看我的练习积累</LoginAction></section>
    <div className="grid gap-5 md:grid-cols-3">{[['练习时长', '回顾实际记录的有效练习时间。'], ['练习频次', '观察不同日期的练琴节奏。'], ['曲目记录', '了解练过的作品与持续练习情况。']].map(([title, description]) => <section key={title} className="rounded-xl border border-border bg-card p-6"><h3 className="font-medium">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p></section>)}</div>
  </div>
}

function GuestMap() {
  const [map, setMap] = useState<MapKind>('europe')
  const [era, setEra] = useState('romantic')
  const [selectedId, setSelectedId] = useState('chopin')
  const eras = map === 'china' ? CHINA_ERAS : EUROPE_ERAS
  const people: MapMusician[] = (map === 'china' ? CHINA_COMPOSERS : EUROPE_COMPOSERS).filter(person => person.era === era).map(person => ({ ...person, map_kind: map, origin: 'builtin', map_revision: map === 'china' ? CHINA_MAP_REVISION : null, teacher_id: null, avatar_file_id: null }))
  const active = people.find(person => person.id === selectedId) ?? people[0]
  const currentEra = eras.find(item => item.id === era)
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="地图区域">{([['china', '中国音乐史'], ['europe', '欧洲音乐史']] as const).map(([value, label]) => <Button key={value} variant={map === value ? 'default' : 'outline'} aria-pressed={map === value} onClick={() => { setMap(value); setEra(value === 'china' ? 'modern' : 'romantic'); setSelectedId('') }}>{label}</Button>)}</div>
    <nav aria-label="音乐史时代" className="flex flex-wrap gap-2 rounded-xl border border-border bg-card">{eras.map(item => <Button key={item.id} variant="ghost" aria-pressed={item.id === era} onClick={() => { setEra(item.id); setSelectedId('') }}>{item.label}</Button>)}</nav>
    <section aria-label="音乐史地图与人物资料" className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 lg:h-[36rem]"><MusicMapViewport key={map} src={map === 'china' ? '/maps/china-standard-gs2023-2767.png' : '/maps/europe.png'} title={map === 'china' ? '中国标准地图' : '欧洲地图'} era={currentEra?.label} imageSize={map === 'china' ? { width: 1256, height: 885 } : undefined} renderOverlay={(fitted, zoom) => <MapPortraits people={people} fitted={fitted} zoom={zoom} selectedId={active?.id ?? null} disabled={false} onSelect={setSelectedId} />} attribution={map === 'china' ? <><span>自然资源部标准地图 · GS(2023)2767号</span><a href="/maps/china-standard-gs2023-2767.png" target="_blank" rel="noreferrer" className="text-primary underline">查看标准原图</a></> : undefined}>{null}</MusicMapViewport></div>
      <aside aria-label="人物资料" className="min-w-0 space-y-5 border-t border-border p-6 lg:max-h-[36rem] lg:overflow-y-auto lg:border-t-0 lg:border-l">
        {active ? <><div className="flex items-center gap-3"><Avatar className="size-14 border border-primary/30"><AvatarImage src={active.avatar} alt="" /><AvatarFallback>{active.name.slice(0, 1)}</AvatarFallback></Avatar><div><h2 className="font-serif text-xl">{active.name}</h2><p className="mt-1 text-xs text-muted-foreground">{active.years}</p></div></div><p className="text-xs text-primary">{active.region}</p><p className="text-sm leading-7">{active.intro}</p><div><h3 className="mb-2 text-sm font-medium">代表作与音乐贡献</h3><p className="text-sm leading-7 text-muted-foreground">{active.works}</p></div>{active.note && <p className="rounded-lg bg-primary/5 p-3 text-xs leading-6 text-muted-foreground">{active.note}</p>}<div className="space-y-2 border-t border-border pt-4"><h3 className="text-xs text-muted-foreground">资料来源</h3>{active.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block text-xs leading-6 text-primary underline-offset-4 hover:underline">{source.title}</a>)}</div></> : <p className="text-sm text-muted-foreground">这个时代暂无已收录人物。</p>}
      </aside>
    </section>
    <div className="flex flex-wrap gap-2" aria-label="当前时代音乐家">{people.map(person => <Button key={person.id} size="sm" variant={person.id === active?.id ? 'default' : 'outline'} aria-pressed={person.id === active?.id} onClick={() => setSelectedId(person.id)}>{person.name}</Button>)}</div>
    <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><BookOpen className="mt-1 size-4 shrink-0" />{currentEra?.span}{currentEra?.chinaContext ? ` · ${currentEra.chinaContext}` : ' · 人物资料依据公开史实整理，点击头像或姓名阅读。'}</p>
  </div>
}
