'use client'

import { useMemo, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import { ChatPanel } from '@/components/chat-panel'
import { cn } from '@/lib/utils'
import {
  CHINA_COMPOSERS,
  CHINA_ERAS,
  EUROPE_COMPOSERS,
  EUROPE_ERAS,
  type Composer,
} from '@/lib/composers'
import { Landmark, Globe2, Info } from 'lucide-react'

type MapKind = 'china' | 'europe'

export default function MusicMapPage() {
  const { user } = useRequireUser()
  const [map, setMap] = useState<MapKind>('china')
  const [era, setEra] = useState<string>('modern')
  const [active, setActive] = useState<Composer | null>(null)

  const eras = map === 'china' ? CHINA_ERAS : EUROPE_ERAS
  const composers = map === 'china' ? CHINA_COMPOSERS : EUROPE_COMPOSERS
  const litIds = useMemo(
    () => new Set(composers.filter((c) => c.era === era).map((c) => c.id)),
    [composers, era]
  )

  if (!user) return null

  const switchMap = (m: MapKind) => {
    setMap(m)
    setActive(null)
    setEra(m === 'china' ? 'modern' : 'romantic')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">音乐史地图</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            沿时间线点亮作曲家，与「知音」一同走进他们的时代
          </p>
        </div>
        {/* 地图切换 */}
        <div className="flex rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: 'china', label: '中国音乐史', icon: Landmark },
              { key: 'europe', label: '欧洲音乐史', icon: Globe2 },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => switchMap(m.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm transition-colors',
                map === m.key
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* 时间线 */}
        <div className="lg:col-span-2">
          <div className="space-y-1 lg:sticky lg:top-8">
            {eras.map((e) => (
              <button
                key={e.id}
                onClick={() => setEra(e.id)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                  era === e.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                )}
              >
                <span
                  className={cn(
                    'h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors',
                    era === e.id ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  )}
                />
                <span>
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      era === e.id ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {e.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{e.span}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 地图 */}
        <div className="lg:col-span-6">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-border bg-card sm:aspect-square">
            {/* 地图底图 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={map === 'china' ? '/maps/china.png' : '/maps/europe.png'}
              alt={map === 'china' ? '中国地图' : '欧洲地图'}
              className="absolute inset-0 h-full w-full object-cover opacity-70"
            />
            {/* 光晕 */}
            <div aria-hidden className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />

            <div className="absolute left-4 top-4 z-10 rounded-lg bg-background/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
              {map === 'china' ? '中国 · 地域分布示意' : '欧洲 · 地域分布示意'}
            </div>

            {composers.map((c) => {
              const lit = litIds.has(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => lit && setActive(c)}
                  disabled={!lit}
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  className={cn(
                    'group absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500',
                    lit ? 'opacity-100' : 'pointer-events-none opacity-0 scale-75'
                  )}
                >
                  <span className="relative block">
                    <span className="absolute -inset-2 animate-pulse rounded-full bg-primary/20" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className={cn(
                        'relative h-14 w-14 rounded-full border-2 object-cover shadow-lg transition-transform group-hover:scale-110',
                        active?.id === c.id ? 'border-primary' : 'border-primary/50'
                      )}
                    />
                  </span>
                  <span className="mt-1.5 block rounded bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground backdrop-blur">
                    {c.name}
                  </span>
                </button>
              )
            })}

            {litIds.size === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                该时代暂无收录人物
              </p>
            )}
          </div>

          {/* 选中人物信息条 */}
          {active && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-card p-5">
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={active.avatar} alt={active.name} className="h-16 w-16 rounded-full border-2 border-primary/60 object-cover" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground">
                    {active.name}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{active.years}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">{active.region}</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">{active.intro}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-primary">代表作：</span>
                    {active.works}
                  </p>
                  <p className="mt-2 flex gap-1.5 rounded-lg bg-primary/8 px-3 py-2 text-xs leading-relaxed text-foreground/80">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {active.note}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 对话窗口 */}
        <div className="lg:col-span-4">
          {active ? (
            <ChatPanel
              key={active.id}
              className="h-[560px]"
              context={{ kind: 'composer', name: active.name }}
              autoPrompt={`请介绍${map === 'china' ? '中国音乐家' : '作曲家'}${active.name}：生平、创作经历与作品信息、代表作，以及代表作的时代背景。`}
              placeholder={`继续了解${active.name}…`}
            />
          ) : (
            <div className="flex h-[560px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <Globe2 className="mb-4 h-10 w-10 text-primary/40" />
              <p className="text-sm text-muted-foreground">
                先在左侧时间线选择一个时代，
                <br />
                再点击地图上被点亮的头像，
                <br />
                即可与「知音」对话了解这位音乐家。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
