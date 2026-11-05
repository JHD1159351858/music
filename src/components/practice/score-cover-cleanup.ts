interface CoverUpload { fileId: string; receipt?: string }

export function createScoreCoverCleanup(remove: (file: CoverUpload) => Promise<boolean>) {
  const uploads = new Map<string, { file: CoverUpload; discarded: boolean; cleaning: boolean }>()
  let saving = false
  async function clean(fileId: string) {
    const entry = uploads.get(fileId)
    if (!entry || saving || !entry.discarded || entry.cleaning) return
    entry.cleaning = true
    try { if (await remove(entry.file)) uploads.delete(fileId) }
    catch { /* Closing the editor cannot guarantee cleanup while offline. */ }
    finally { entry.cleaning = false }
  }
  return {
    uploaded(file: CoverUpload) {
      if (file.receipt) uploads.set(file.fileId, { file, discarded: false, cleaning: false })
    },
    saved(fileId?: string) { if (fileId) uploads.delete(fileId) },
    discard(fileId?: string) {
      const entry = fileId ? uploads.get(fileId) : undefined
      if (entry) { entry.discarded = true; void clean(entry.file.fileId) }
    },
    discardAll() {
      for (const [fileId, entry] of uploads) { entry.discarded = true; void clean(fileId) }
    },
    beginSave() { saving = true },
    endSave() {
      saving = false
      for (const fileId of uploads.keys()) void clean(fileId)
    },
  }
}
