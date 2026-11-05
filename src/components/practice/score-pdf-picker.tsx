import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_SCORE_PAGES } from '@/lib/score-pages'
import { cn } from '@/lib/utils'
import type { ScorePdfPreviewPage } from './score-pdf'
import { formatScorePdfRange, parseScorePdfRange, suggestScorePdfPages } from './score-pdf-selection'

export function ScorePdfPicker({ name, pages, busy, onCancel, onConfirm }: {
  name: string
  pages: ScorePdfPreviewPage[]
  busy: boolean
  onCancel: () => void
  onConfirm: (groups: number[][]) => void
}) {
  const [suggested] = useState(() => suggestScorePdfPages(pages.map(page => page.kind)))
  const [groups, setGroups] = useState(() => [{ id: 'first', range: formatScorePdfRange(suggested.length ? suggested : pages.map(page => page.number)) }])
  const [activeId, setActiveId] = useState('first')
  const ranges = groups.map(group => parseScorePdfRange(group.range, pages.length))
  const activeIndex = groups.findIndex(group => group.id === activeId)
  const activeRange = ranges[activeIndex]
  const checked = new Set(activeRange.pages)
  const suggestedPages = new Set(suggested)
  const valid = ranges.every(range => !range.error && range.pages.length > 0 && range.pages.length <= MAX_SCORE_PAGES)

  const setRange = (id: string, range: string) => setGroups(current => current.map(group => group.id === id ? { ...group, range } : group))
  const toggle = (page: number, select: boolean) => {
    if (select) checked.add(page)
    else checked.delete(page)
    setRange(activeId, formatScorePdfRange([...checked].sort((a, b) => a - b)))
  }
  const addGroup = () => {
    const id = crypto.randomUUID()
    setGroups(current => [...current, { id, range: '' }])
    setActiveId(id)
  }
  const removeGroup = (id: string) => {
    const next = groups.filter(group => group.id !== id)
    setGroups(next)
    if (id === activeId) setActiveId(next[0].id)
  }

  return <fieldset disabled={busy} className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="PDF 琴谱选页">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">确认 PDF 谱页</h3>
        <p className="break-all text-xs text-muted-foreground">{name} · 共 {pages.length} 页</p>
        {suggested.length ? <p className="text-sm text-primary">建议谱面：原第 {formatScorePdfRange(suggested)} 页（{suggested.length} 页）</p> : <p className="text-sm text-muted-foreground">暂未识别出谱面范围，请核对缩略图并调整选页。</p>}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消选页</Button>
    </div>
    <p className="text-xs text-muted-foreground">点选缩略图或输入原 PDF 页码。若一本 PDF 有多首曲目，可为每首单独填写范围，每首最多 {MAX_SCORE_PAGES} 页。</p>
    <div className="space-y-3">
      {groups.map((group, index) => {
        const range = ranges[index]
        const error = range.error ?? (range.pages.length > MAX_SCORE_PAGES ? `已选 ${range.pages.length} 页，单首最多 ${MAX_SCORE_PAGES} 页。请缩小范围或拆分为多首。` : '')
        const active = activeId === group.id
        return <div key={group.id} className={cn('space-y-2 rounded-lg border p-3', active ? 'border-primary/50' : 'border-border')}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`pdf-range-${group.id}`}>曲目 {index + 1} 的原 PDF 页码</Label>
            <div className="flex shrink-0 items-center gap-1">
              {active ? <Badge variant="secondary">正在选页</Badge> : <Button type="button" variant="ghost" size="sm" onClick={() => setActiveId(group.id)}>选页</Button>}
              {groups.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`移除曲目 ${index + 1} 的选页`} onClick={() => removeGroup(group.id)}><X className="size-4" /></Button>}
            </div>
          </div>
          <Input id={`pdf-range-${group.id}`} value={group.range} placeholder="例如 15-33, 40" aria-invalid={Boolean(error)} onFocus={() => setActiveId(group.id)} onChange={event => setRange(group.id, event.target.value)} />
          {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">已选 {range.pages.length} 页</p>}
        </div>
      })}
      <Button type="button" variant="outline" size="sm" onClick={addGroup}><Plus className="size-4" />添加另一首曲目</Button>
    </div>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">为曲目 {activeIndex + 1} 选择谱页</p>
        <div className="flex gap-1">
          {suggested.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setRange(activeId, formatScorePdfRange(suggested))}>恢复建议</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRange(activeId, formatScorePdfRange(pages.map(page => page.number)))}>全选</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRange(activeId, '')}>清空</Button>
        </div>
      </div>
      <div aria-label="PDF 原页缩略图" className="grid max-h-[42vh] grid-cols-2 gap-2 overflow-auto rounded-lg border border-border p-2 sm:grid-cols-4">
        {pages.map(page => <label key={page.number} className={cn('flex cursor-pointer flex-col gap-1 rounded-md border p-2', checked.has(page.number) ? 'border-primary/60 bg-primary/5' : 'border-border')}>
          {page.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.thumbnail} alt="" loading="lazy" decoding="async" className="h-28 w-full rounded-sm object-contain sm:h-32" />
          ) : <span className="grid h-28 place-items-center rounded-sm bg-muted/50 text-xs text-muted-foreground sm:h-32">预览失败</span>}
          <span className="flex items-center gap-1.5 text-xs font-medium"><Checkbox checked={checked.has(page.number)} onCheckedChange={value => toggle(page.number, value === true)} aria-label={`选择原第 ${page.number} 页`} />原第 {page.number} 页</span>
          <span className="text-xs text-muted-foreground">{suggestedPages.has(page.number) ? '建议谱面' : page.kind === 'other' ? '请核对' : '疑似谱面 · 请核对'}</span>
        </label>)}
      </div>
    </div>
    <div className="flex justify-end"><Button type="button" disabled={!valid || busy} onClick={() => onConfirm(ranges.map(range => range.pages))}>确认选页并转换 {groups.length} 份琴谱</Button></div>
  </fieldset>
}
