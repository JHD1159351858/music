'use client'

import { useState } from 'react'
import { getDefaultScoreCover, getScoreCover, type CoverScore } from '@/lib/score-cover'
import { cn } from '@/lib/utils'

export function ScoreCover({ score, className, priority = false }: { score: CoverScore; className?: string; priority?: boolean }) {
  const source = getScoreCover(score)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  return (
    // Covers include signed private file URLs; keep the existing authenticated file endpoint.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={failedSource === source ? getDefaultScoreCover(score) : source} alt={`${score.title || '曲目'}封面`} draggable={false} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} onError={() => setFailedSource(source)} className={cn('h-full w-full object-cover', className)} />
  )
}
