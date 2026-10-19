export interface PracticeSaveDraft {
  audioBlob: Blob | null
  audioUrl: string | null
  audioFileId: string | null
  recordId: string | null
}

export async function savePracticeDraft(
  draft: PracticeSaveDraft,
  upload: (blob: Blob) => Promise<{ url: string; fileId: string }>,
  createRecord: (audio: { audio_url: string | null; audio_file_id: string | null }) => Promise<{ id: string }>
): Promise<string> {
  if (draft.recordId) return draft.recordId
  if (draft.audioBlob && !draft.audioUrl) {
    const audio = await upload(draft.audioBlob)
    draft.audioUrl = audio.url
    draft.audioFileId = audio.fileId
  }
  const record = await createRecord({ audio_url: draft.audioUrl, audio_file_id: draft.audioFileId })
  draft.recordId = record.id
  return record.id
}
