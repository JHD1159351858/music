'use client'

import { ChatPanel } from '@/components/chat-panel'
import type { AnalysisResult } from '@/lib/score-analysis'
import { scoreExplanationOpening } from '@/lib/score-explanation'

export function ScoreExplanationPanel({ result, className }: { result: AnalysisResult; className?: string }) {
  if (!result.historyId) return <p className="text-sm text-muted-foreground">重新打开已保存的分析，即可查看智能讲解。</p>
  return <ChatPanel
    context={{ kind: 'score-intro', historyId: result.historyId }}
    autoPrompt={scoreExplanationOpening}
    hideAutoPrompt
    placeholder="继续问作品、作曲家或欣赏建议…"
    className={className}
  />
}
