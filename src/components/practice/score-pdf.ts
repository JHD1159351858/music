import type { PDFDocumentProxy } from 'pdfjs-dist'
import { version } from 'pdfjs-dist/package.json'
import { MAX_SCORE_PAGES } from '@/lib/score-pages'
import { inspectScorePdfPage, type ScorePdfPageKind } from './score-pdf-selection'

const assets = `/score-pdf-assets/${version}`
const PREVIEW_EDGE = 500
const MAX_PAGE_EDGE = 2600
type Progress = (done: number, total: number) => void

export interface ScorePdfPreviewPage {
  number: number
  thumbnail: string | null
  kind: ScorePdfPageKind
}

function encodePage(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('无法生成谱页图片'))
    }, 'image/png')
  })
}

async function readPdf<T>(file: File, signal: AbortSignal, read: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  const { getDocument, GlobalWorkerOptions }: typeof import('pdfjs-dist') = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${assets}/legacy/build/pdf.min.mjs`)
    .catch(() => { throw new Error('PDF 转换组件加载失败，请刷新页面后重试。') })
  signal.throwIfAborted()
  const data = new Uint8Array(await file.arrayBuffer())
  signal.throwIfAborted()

  GlobalWorkerOptions.workerSrc = `${assets}/legacy/build/pdf.worker.min.mjs`
  const task = getDocument({
    data,
    cMapUrl: `${assets}/cmaps/`,
    cMapPacked: true,
    iccUrl: `${assets}/iccs/`,
    standardFontDataUrl: `${assets}/standard_fonts/`,
    wasmUrl: `${assets}/wasm/`,
    stopAtErrors: true,
  })
  let cleanup: Promise<void> | undefined
  const destroy = () => cleanup ??= task.destroy()
  let rejectLoad: (reason: unknown) => void = () => {}
  const interrupted = new Promise<never>((_, reject) => { rejectLoad = reject })
  const abort = () => { rejectLoad(signal.reason); void destroy().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const pdf = await Promise.race([task.promise, interrupted])
    if (pdf.numPages < 1) throw new Error('这份 PDF 没有可导入的页面。')
    return await read(pdf)
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('这份 PDF 需要密码。请用可打开的未加密副本重新导入。')
    if (error instanceof Error && ['InvalidPDFException', 'FormatError', 'UnknownErrorException'].includes(error.name)) throw new Error('无法读取 PDF，文件可能已损坏。请重新导出或选择另一份 PDF。')
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    await destroy().catch(() => {})
  }
}

async function readPage<T>(pdf: PDFDocumentProxy, number: number, edge: number, signal: AbortSignal, read: (canvas: HTMLCanvasElement) => T | Promise<T>): Promise<T> {
  signal.throwIfAborted()
  const page = await pdf.getPage(number)
  signal.throwIfAborted()
  const natural = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(4, edge / Math.max(natural.width, natural.height)) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const render = page.render({ canvas, viewport })
  const cancel = () => render.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    await render.promise
    signal.throwIfAborted()
    const result = await read(canvas)
    signal.throwIfAborted()
    return result
  } finally {
    signal.removeEventListener('abort', cancel)
    canvas.width = 0
    canvas.height = 0
    page.cleanup()
  }
}

export async function scanScorePdf(file: File, signal: AbortSignal, onProgress: Progress): Promise<ScorePdfPreviewPage[]> {
  return readPdf(file, signal, async pdf => {
    const pages: ScorePdfPreviewPage[] = []
    onProgress(0, pdf.numPages)
    for (let number = 1; number <= pdf.numPages; number++) {
      try {
        pages.push(await readPage(pdf, number, PREVIEW_EDGE, signal, canvas => {
          const context = canvas.getContext('2d')
          const kind = context ? inspectScorePdfPage(context.getImageData(0, 0, canvas.width, canvas.height)) : 'uncertain'
          return { number, kind, thumbnail: canvas.toDataURL('image/jpeg', 0.8) }
        }))
      } catch (error: unknown) {
        if (signal.aborted) throw error
        pages.push({ number, kind: 'uncertain', thumbnail: null })
      }
      onProgress(number, pdf.numPages)
    }
    return pages
  })
}

export async function renderScorePdf(file: File, groups: readonly (readonly number[])[], signal: AbortSignal, onProgress: Progress): Promise<File[][]> {
  return readPdf(file, signal, async pdf => {
    if (!groups.length || groups.some(group => !group.length || group.length > MAX_SCORE_PAGES)) {
      throw new Error(`每份琴谱须选择 1 至 ${MAX_SCORE_PAGES} 页。`)
    }
    const selected = [...new Set(groups.flat())].sort((a, b) => a - b)
    if (selected.some(number => !Number.isInteger(number) || number < 1 || number > pdf.numPages)) {
      throw new Error('选中的页码超出这份 PDF 的范围。')
    }
    const files = new Map<number, File>()
    const title = file.name.replace(/\.pdf$/i, '')
    onProgress(0, selected.length)
    for (const number of selected) {
      try {
        const image = await readPage(pdf, number, MAX_PAGE_EDGE, signal, encodePage)
        files.set(number, new File([image], `${title}-${String(number).padStart(2, '0')}.png`, { type: 'image/png' }))
        onProgress(files.size, selected.length)
      } catch (error: unknown) {
        if (signal.aborted) throw error
        throw new Error(`PDF 原第 ${number} 页转换失败，请核对该页后重试。`)
      }
    }
    return groups.map(group => group.map(number => files.get(number)!))
  })
}
