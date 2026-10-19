export interface UploadedScoreFile { fileId: string; url: string; name: string; type: string; receipt?: string }
export interface ScoreUploadPage { id: string; file: File | null; uploaded: UploadedScoreFile | null }

export async function uploadScorePages(
  pages: readonly ScoreUploadPage[],
  upload: (file: File) => Promise<UploadedScoreFile>,
  onUploaded: (id: string, uploaded: UploadedScoreFile) => void,
): Promise<UploadedScoreFile[]> {
  const files: UploadedScoreFile[] = []
  for (const page of pages) {
    let uploaded = page.uploaded
    if (!uploaded) {
      if (!page.file) throw new Error('请为每一页选择琴谱图片')
      uploaded = await upload(page.file)
      onUploaded(page.id, uploaded)
    }
    files.push(uploaded)
  }
  return files
}
