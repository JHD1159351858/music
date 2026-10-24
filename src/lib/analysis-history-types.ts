import type { AnalysisResult } from './score-analysis'

export interface AnalysisHistoryItem {
  id: string
  title: string | null
  composer: string | null
  fileName: string | null
  provenance: AnalysisResult['provenance']
  engine: 'music21' | 'basic' | 'image-model'
  noteCount: number | null
  createdAt: string
}

export interface AnalysisHistoryPage {
  items: AnalysisHistoryItem[]
  hasMore: boolean
  page: number
}
