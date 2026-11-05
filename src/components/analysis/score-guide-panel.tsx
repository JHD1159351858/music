'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AnalysisResult } from '@/lib/score-analysis'
import { baselineScoreGuide, guideLabels, type GuideField, type ScoreGuide } from '@/lib/score-guide'

const originLabels = { course: '教师资料', score: '谱面解析', public: '公开资料' }

export function ScoreGuidePanel({ result }: { result: AnalysisResult }) {
  const [guide, setGuide] = useState(() => result.scoreGuide ?? baselineScoreGuide(result))
  const [attempt, setAttempt] = useState(0)
  const initialStatus = result.scoreGuide?.publicStatus ?? 'pending'
  const historyId = result.historyId
  const [requestState, setRequestState] = useState<'loading' | 'settled' | 'error'>(() =>
    historyId && initialStatus === 'pending' ? 'loading' : 'settled',
  )

  useEffect(() => {
    if (!historyId || (initialStatus !== 'pending' && attempt === 0)) return
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/analysis/history/${encodeURIComponent(historyId)}/guide`, {
          method: 'POST', signal: controller.signal,
        })
        if (!response.ok) throw new Error('无法补全导读')
        const { scoreGuide } = await response.json() as { scoreGuide: ScoreGuide }
        if (controller.signal.aborted) return
        setGuide(scoreGuide)
        setRequestState('settled')
      } catch {
        if (!controller.signal.aborted) setRequestState('error')
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt, historyId, initialStatus])

  const loading = requestState === 'loading'
  const canRetry = historyId && !loading && (requestState === 'error' || guide.publicStatus === 'unavailable')
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 font-serif text-lg font-semibold">乐曲导读</h3>
      <p className="mb-4 text-xs text-muted-foreground">优先使用教师课程资料，结合当前谱面和可核验的公开资料自动补全。</p>
      <dl className="space-y-4">
        {(Object.keys(guideLabels) as GuideField[]).map(field => {
          const entry = guide.fields[field]
          return (
            <div key={field}>
              <dt className="text-xs text-muted-foreground">{guideLabels[field]}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {entry?.text ?? (loading ? '正在补全…' : '暂无可核验资料')}
              </dd>
              {entry && <dd className="mt-1 text-xs text-muted-foreground">
                <span className="mr-2">{originLabels[entry.kind]}</span>
                {entry.source.url && /^https?:\/\//i.test(entry.source.url)
                  ? <a href={entry.source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">{entry.source.title}</a>
                  : entry.source.title}
              </dd>}
            </div>
          )
        })}
      </dl>
      {canRetry && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <p role="status" className="text-xs text-muted-foreground">
            {requestState === 'error' ? '导读补全暂时失败。' : '公开资料检索暂不可用，已展示可用内容。'}
          </p>
          <Button size="sm" variant="outline" onClick={() => { setRequestState('loading'); setAttempt(value => value + 1) }}>
            重试补全
          </Button>
        </div>
      )}
    </section>
  )
}
