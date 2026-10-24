'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AnalysisHistoryItem, AnalysisHistoryPage } from '@/lib/analysis-history-types'

interface HistoryPanelProps {
  refreshVersion: number
  openingId: string | null
  disabled: boolean
  onOpen: (id: string) => void
}

function sourceLabel(item: AnalysisHistoryItem): string {
  if (item.engine === 'music21') return 'MusicXML · music21'
  if (item.engine === 'image-model') return '图片 · 模型识别'
  return item.provenance === 'abc' ? 'ABC · 基础解析' : 'MusicXML · 基础解析'
}

function historyTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

export function AnalysisHistoryPanel({ refreshVersion, openingId, disabled, onOpen }: HistoryPanelProps) {
  const [history, setHistory] = useState<AnalysisHistoryPage>({ items: [], hasMore: false, page: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [failedPage, setFailedPage] = useState(1)
  const requestRef = useRef<AbortController | null>(null)

  const loadPage = useCallback(async (page: number) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/analysis/history?page=${page}`, { cache: 'no-store', signal: controller.signal })
      const data: AnalysisHistoryPage & { error?: string } = await response.json().catch(() => {
        throw new Error('暂时无法读取分析历史，请稍后重试')
      })
      if (!response.ok) throw new Error(data.error ?? '暂时无法读取分析历史')
      if (controller.signal.aborted) return
      setHistory(current => ({ ...data, items: page === 1 ? data.items : [...current.items, ...data.items] }))
    } catch (cause: unknown) {
      if (controller.signal.aborted) return
      setFailedPage(page)
      setError(cause instanceof TypeError ? '暂时无法连接服务，请稍后重试' : cause instanceof Error ? cause.message : '暂时无法读取分析历史')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(1)
    return () => requestRef.current?.abort()
  }, [loadPage, refreshVersion])

  return (
    <section aria-label="分析历史" className="min-w-0 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground"><History className="h-5 w-5 text-primary" />分析历史</h2>
          <p className="mt-1 text-xs text-muted-foreground">打开已保存的分析结果，继续查看图表与讲解。</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 gap-2" disabled={loading} onClick={() => void loadPage(1)}><RefreshCw className="h-4 w-4" />刷新历史</Button>
      </div>
      {history.items.length > 0 && <ul className="mt-4 max-h-72 divide-y divide-border overflow-y-auto">
        {history.items.map(item => {
          const title = item.title || item.fileName || '未命名乐谱'
          return <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0 space-y-1">
              <p className="break-words text-sm font-medium text-foreground">{title}</p>
              {item.fileName && <p className="break-all text-xs text-muted-foreground">文件：{item.fileName}</p>}
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{sourceLabel(item)}</span>{item.composer && <span>{item.composer}</span>}{item.noteCount !== null && <span>{item.noteCount} 个音符</span>}
                <time dateTime={item.createdAt}>{historyTime(item.createdAt)}（北京时间）</time>
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" aria-label={`打开分析：${title}（${item.fileName ?? '记谱文本'}）`} disabled={disabled || openingId === item.id} onClick={() => onOpen(item.id)}>
              {openingId === item.id && <Loader2 className="h-4 w-4 animate-spin" />}{openingId === item.id ? '正在打开' : '打开'}
            </Button>
          </li>
        })}
      </ul>}
      {loading && <p role="status" className="mt-4 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取分析历史…</p>}
      {!loading && !error && history.items.length === 0 && <p className="mt-4 py-4 text-center text-sm text-muted-foreground">暂无分析记录，完成乐谱分析后会自动保存在这里。</p>}
      {error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>{error}</span><Button variant="outline" size="sm" disabled={loading} onClick={() => void loadPage(failedPage)}>重试</Button></div>}
      {!loading && !error && history.hasMore && <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => void loadPage(history.page + 1)}>加载更多</Button>}
    </section>
  )
}
