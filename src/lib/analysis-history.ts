import { randomUUID } from 'node:crypto'
import type { AnalysisResult } from './score-analysis'
import type { AnalysisHistoryItem, AnalysisHistoryPage } from './analysis-history-types'
import { createScoreAnalysisReceipt } from './score-analysis-receipt'
import { ApiError, dbCheck, type TeachingClient } from './teaching-server'
import type { ScoreGuide } from './score-guide'

type SummaryRow = Omit<AnalysisHistoryItem, 'fileName' | 'noteCount' | 'createdAt'> & {
  file_name: string | null
  note_count: number | null
  created_at: string
}
const summaryFields = 'id,title,composer,file_name,provenance,engine,note_count,created_at'
const pageSize = 20

export async function saveAnalysisHistory(client: TeachingClient, ownerId: string, result: AnalysisResult): Promise<string> {
  const id = randomUUID()
  const snapshot = { ...result }
  delete snapshot.analysisReceipt
  Reflect.deleteProperty(snapshot, 'historyId')
  const saved = await client.from('score_analyses').insert({
    id, user_id: ownerId, title: result.title, composer: result.composer, file_name: result.fileName ?? null,
    provenance: result.provenance, engine: result.music21 ? 'music21' : result.provenance === 'image-model' ? 'image-model' : 'basic',
    note_count: result.noteCount, result: snapshot,
  })
  dbCheck(saved.error)
  return id
}

export async function getAnalysisHistory(client: TeachingClient, ownerId: string, page = 1): Promise<AnalysisHistoryPage> {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(page * pageSize)) throw new ApiError('历史记录页码无效')
  const offset = (page - 1) * pageSize
  const found = await client.from('score_analyses').select(summaryFields).eq('user_id', ownerId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize)
  dbCheck(found.error)
  const rows = (found.data ?? []) as SummaryRow[]
  return {
    items: rows.slice(0, pageSize).map(row => ({
      id: row.id, title: row.title, composer: row.composer, fileName: row.file_name,
      provenance: row.provenance, engine: row.engine, noteCount: row.note_count, createdAt: row.created_at,
    })),
    hasMore: rows.length > pageSize,
    page,
  }
}

export async function getAnalysisHistoryResult(client: TeachingClient, ownerId: string, id: string): Promise<AnalysisResult & { historyId: string }> {
  const found = await client.from('score_analyses').select('id,result').eq('user_id', ownerId).eq('id', id).maybeSingle()
  dbCheck(found.error)
  if (!found.data) throw new ApiError('分析历史记录不存在', 404)
  const snapshot: unknown = found.data.result
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new ApiError('分析历史记录内容无效', 500)
  const result = { ...snapshot as AnalysisResult, historyId: found.data.id as string }
  delete result.analysisReceipt
  return result.music21 ? { ...result, analysisReceipt: createScoreAnalysisReceipt({ ...result }, ownerId) } : result
}

export async function saveHistoryGuide(client: TeachingClient, ownerId: string, current: AnalysisResult & { historyId: string }, scoreGuide: ScoreGuide) {
  const { historyId, ...snapshot } = current
  delete snapshot.analysisReceipt
  const updated = await client.from('score_analyses')
    .update({ result: { ...snapshot, scoreGuide } }).eq('user_id', ownerId).eq('id', historyId)
  dbCheck(updated.error)
}
