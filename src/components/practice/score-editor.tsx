'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, FileMusic, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Score } from '@/lib/teaching-types'
import { SCORE_PERIODS, SCORE_STYLES, SCORE_TYPES, scoreClassificationValue, type ScorePeriod, type ScoreStyle, type ScoreType } from '@/lib/score-classification'
import type { Classroom } from '@/lib/class-types'
import { getScorePages, MAX_SCORE_PAGES } from '@/lib/score-pages'
import { uploadScorePages, type ScoreUploadPage, type UploadedScoreFile } from './score-upload'
import { ScoreCoverUpload } from './score-cover-upload'
import { createScoreCoverCleanup } from './score-cover-cleanup'
import type { ScorePdfPreviewPage } from './score-pdf'
import { ScorePdfPicker } from './score-pdf-picker'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface Draft {
  id: string
  pages: ScoreUploadPage[]
  cover_file: File | null
  cover: UploadedScoreFile | null
  title: string
  composer: string
  category: Score['category'] | ''
  score_type?: ScoreType | null
  period?: ScorePeriod | null
  score_style?: ScoreStyle | null
  tips: string
  published: boolean
  target_classes: string[]
  status: 'pending' | 'saving' | 'done' | 'error'
  error: string
}

const scoreFileTypes = 'image/*,application/pdf,.pdf'
const isPdf = (file: { type: string; name: string }) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
const makePage = (file: File): ScoreUploadPage => ({ id: crypto.randomUUID(), file, uploaded: null })

function makeDraft(files: File[], title = files[0].name.replace(/\.[^.]+$/, '')): Draft {
  return {
    id: crypto.randomUUID(), pages: files.map(makePage), title, composer: '',
    cover_file: null, cover: null,
    category: '', tips: '', published: false, target_classes: [], status: 'pending', error: '',
  }
}

async function responseJson<T>(res: Response): Promise<T> {
  const data: unknown = await res.json()
  if (!res.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : '保存失败，请重试'
    throw new Error(message)
  }
  return data as T
}

export function ScoreEditor({ userId, score, isTeacher, classNames, onClose, onSaved, embedded = false, headerActions, onSavingChange }: {
  userId: string
  score: Score | null
  isTeacher: boolean
  classNames: string[]
  onClose: () => void
  onSaved: (savedScore?: Score) => void
  embedded?: boolean
  headerActions?: ReactNode
  onSavingChange?: (saving: boolean) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => score ? [{
    id: score.id,
    pages: getScorePages(score).map((page, index) => ({ id: `${score.id}-${index}`, file: null, uploaded: { fileId: page.file_id ?? '', url: page.image_url ?? '', name: page.file_name ?? `原琴谱第 ${index + 1} 页`, type: page.file_type ?? '' } })),
    cover_file: null, cover: score.cover_file_id ? { fileId: score.cover_file_id, url: score.cover_url ?? '', name: '当前曲目封面', type: '' } : null,
    title: score.title, composer: score.composer, category: score.category ?? '',
    tips: score.tips ?? '', published: score.published, target_classes: score.target_classes ?? [], status: 'pending', error: '',
  }] : [])
  const [uploadMode, setUploadMode] = useState('grouped')
  const [saving, setSaving] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfPreview, setPdfPreview] = useState<{ file: File; pages: ScorePdfPreviewPage[] } | null>(null)
  const pdfImport = useRef<AbortController | null>(null)
  const pdfBusy = Boolean(pdfProgress || pdfPreview)
  const [teacherClassNames, setTeacherClassNames] = useState<string[]>([])
  const [classLoading, setClassLoading] = useState(isTeacher)
  const [classError, setClassError] = useState('')
  const [classReload, setClassReload] = useState(0)
  const mounted = useRef(true)
  const [coverCleanup] = useState(() => createScoreCoverCleanup(async file => {
    const response = await fetch('/api/upload', { method: 'DELETE', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: file.fileId, receipt: file.receipt }) })
    return response.ok || response.status === 409
  }))
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; pdfImport.current?.abort(); coverCleanup.discardAll() }
  }, [coverCleanup])
  useEffect(() => {
    if (!isTeacher) return
    const controller = new AbortController()
    setClassLoading(true)
    setClassError('')
    fetch('/api/classes', { signal: controller.signal })
      .then(responseJson<Classroom[]>)
      .then((data) => setTeacherClassNames(data.map((item) => item.name)))
      .catch((error: unknown) => { if (!controller.signal.aborted) setClassError(error instanceof Error ? error.message : '读取班级失败，请重试') })
      .finally(() => { if (!controller.signal.aborted) setClassLoading(false) })
    return () => controller.abort()
  }, [isTeacher, userId, classReload])
  const availableClassNames = [...new Set([...classNames, ...teacherClassNames, ...(score?.target_classes ?? [])])].sort()
  const completed = drafts.filter((d) => d.status === 'done').length
  const pending = drafts.filter((d) => d.status !== 'done')
  const update = (id: string, patch: Partial<Draft>) => setDrafts((all) => all.map((d) => d.id === id ? { ...d, ...patch } : d))
  const close = () => { pdfImport.current?.abort(); coverCleanup.discardAll(); onClose() }
  const changeCover = (draft: Draft, file: File | null) => {
    coverCleanup.discard(draft.cover?.fileId)
    update(draft.id, { cover_file: file, cover: null, status: 'pending', error: '' })
  }
  const properties = (draft: Draft) => <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2"><Label htmlFor={`title-${draft.id}`}>曲名 *</Label><Input id={`title-${draft.id}`} value={draft.title} onChange={(e) => update(draft.id, { title: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor={`composer-${draft.id}`}>作曲家 *</Label><Input id={`composer-${draft.id}`} value={draft.composer} onChange={(e) => update(draft.id, { composer: e.target.value })} /></div>
    <div className="space-y-2"><Label>分类 *</Label><Select value={draft.category} onValueChange={(v: Score['category']) => update(draft.id, { category: v })}><SelectTrigger className="w-full"><SelectValue placeholder="选择国内 / 国外" /></SelectTrigger><SelectContent><SelectItem value="domestic">国内</SelectItem><SelectItem value="foreign">国外</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor={`score-type-${draft.id}`}>类型（选填）</Label><Select value={(draft.score_type === undefined ? scoreClassificationValue(SCORE_TYPES, score?.score_type) : draft.score_type) ?? 'none'} onValueChange={value => update(draft.id, { score_type: scoreClassificationValue(SCORE_TYPES, value) })}><SelectTrigger id={`score-type-${draft.id}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未设置</SelectItem>{SCORE_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor={`period-${draft.id}`}>时期（选填）</Label><Select value={(draft.period === undefined ? scoreClassificationValue(SCORE_PERIODS, score?.period) : draft.period) ?? 'none'} onValueChange={value => update(draft.id, { period: scoreClassificationValue(SCORE_PERIODS, value) })}><SelectTrigger id={`period-${draft.id}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未设置</SelectItem>{SCORE_PERIODS.map(period => <SelectItem key={period} value={period}>{period}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor={`score-style-${draft.id}`}>风格（选填）</Label><Select value={(draft.score_style === undefined ? scoreClassificationValue(SCORE_STYLES, score?.score_style) : draft.score_style) ?? 'none'} onValueChange={value => update(draft.id, { score_style: scoreClassificationValue(SCORE_STYLES, value) })}><SelectTrigger id={`score-style-${draft.id}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未设置</SelectItem>{SCORE_STYLES.map(style => <SelectItem key={style} value={style}>{style}</SelectItem>)}</SelectContent></Select></div>
  </div>

  const changePages = (id: string, change: (pages: ScoreUploadPage[]) => ScoreUploadPage[]) => setDrafts((all) => all.map((draft) => draft.id === id ? { ...draft, pages: change(draft.pages), status: 'pending', error: '' } : draft))
  const runPdf = async (label: string, run: (signal: AbortSignal, progress: (done: number, total: number) => void) => Promise<void>) => {
    if (pdfImport.current) return
    const controller = new AbortController()
    pdfImport.current = controller
    setPdfError('')
    setPdfProgress(`${label}…`)
    try {
      await run(controller.signal, (done, total) => {
        if (!controller.signal.aborted) setPdfProgress(`${label}：${done} / ${total} 页`)
      })
    } catch (error: unknown) {
      if (!controller.signal.aborted) setPdfError(error instanceof Error ? error.message : 'PDF 处理失败，请重试。')
    } finally {
      if (pdfImport.current === controller) {
        pdfImport.current = null
        if (mounted.current) setPdfProgress('')
      }
    }
  }
  const cancelPdfWork = () => {
    pdfImport.current?.abort()
    pdfImport.current = null
    setPdfProgress('')
  }
  const importPdf = (file: File) => runPdf('正在识别 PDF 谱页', async (signal, progress) => {
    const { scanScorePdf } = await import('./score-pdf')
    const pages = await scanScorePdf(file, signal, progress)
    if (!signal.aborted) setPdfPreview({ file, pages })
  })
  const confirmPdf = (groups: number[][]) => {
    if (!pdfPreview) return
    const { file } = pdfPreview
    void runPdf('正在转换已选谱页', async (signal, progress) => {
      const { renderScorePdf } = await import('./score-pdf')
      const converted = await renderScorePdf(file, groups, signal, progress)
      if (signal.aborted) return
      const title = file.name.replace(/\.pdf$/i, '')
      setDrafts(all => [...all, ...converted.map((pages, index) => makeDraft(pages, converted.length > 1 ? `${title}（曲目 ${index + 1}）` : title))])
      setPdfPreview(null)
    })
  }

  const chooseFiles = (files: FileList | null, draftId?: string) => {
    if (!files?.length || pdfBusy || pdfImport.current || saving) return
    const selected = Array.from(files)
    setPdfError('')
    if (selected.some((file) => file.size > 100 * 1024 * 1024)) {
      toast.error('单个琴谱文件不能超过 100MB')
      return
    }
    if (!isTeacher && selected.some(isPdf)) {
      if (draftId || selected.length !== 1) {
        setPdfError('请单独选择一个 PDF，再确认要导入的曲目和页码。')
        return
      }
      void importPdf(selected[0])
      return
    }
    if (selected.some((file) => !file.type.startsWith('image/') && (!isTeacher || !isPdf(file)))) {
      toast.error(isTeacher ? '请选择图片或 PDF 琴谱' : '个人琴谱请选择图片文件')
      return
    }
    const existingPages = draftId ? drafts.find((draft) => draft.id === draftId)?.pages ?? [] : []
    const grouped = !!draftId || uploadMode === 'grouped'
    if (grouped && existingPages.length + selected.length > MAX_SCORE_PAGES) {
      toast.error(`每份琴谱最多添加 ${MAX_SCORE_PAGES} 张图片`)
      return
    }
    if (grouped && existingPages.length + selected.length > 1 && (selected.some(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) || existingPages.some(page => (page.uploaded?.type ?? page.file?.type) === 'application/pdf' || (page.uploaded?.name ?? page.file?.name)?.toLowerCase().endsWith('.pdf')))) {
      toast.error('多页琴谱请选择图片；PDF 请作为一份独立琴谱上传')
      return
    }
    if (draftId) {
      changePages(draftId, (pages) => [...pages, ...selected.map(makePage)])
      return
    }
    const groups = grouped ? [selected] : selected.map(file => [file])
    setDrafts((all) => [...all, ...groups.map(files => makeDraft(files))])
  }

  const save = async () => {
    if (pdfBusy || pdfImport.current) return
    const invalid = pending.filter((d) => !d.title.trim() || !d.composer.trim() || !d.category || !d.pages.length)
    if (invalid.length) {
      invalid.forEach((d) => update(d.id, { status: 'error', error: isTeacher ? '请补全曲名、作曲家、分类，并选择琴谱文件' : '请补全曲名、作曲家、分类，并选择琴谱图片' }))
      toast.error('请先补全每份琴谱的必填内容')
      return
    }
    setSaving(true)
    onSavingChange?.(true)
    coverCleanup.beginSave()
    let successes = 0
    let lastSaved: Score | undefined
    for (const draft of pending) {
      update(draft.id, { status: 'saving', error: '' })
      try {
        const uploadedPages = await uploadScorePages(draft.pages, async (file) => {
          const body = new FormData()
          body.append('file', file)
          body.append('user_id', userId)
          return responseJson<UploadedScoreFile>(await fetch('/api/upload', { method: 'POST', body }))
        }, (id, uploaded) => setDrafts(all => all.map(item => item.id === draft.id ? { ...item, pages: item.pages.map(page => page.id === id ? { ...page, uploaded } : page) } : item)))
        let cover = draft.cover
        if (draft.cover_file && !cover) {
          const body = new FormData()
          body.append('file', draft.cover_file)
          body.append('user_id', userId)
          body.append('purpose', 'score-cover')
          cover = await responseJson<UploadedScoreFile>(await fetch('/api/upload', { method: 'POST', body }))
          coverCleanup.uploaded(cover)
          if (!mounted.current) coverCleanup.discard(cover.fileId)
          update(draft.id, { cover })
        }
        const uploaded = uploadedPages[0]
        const saved = await responseJson<Score & { warning?: string }>(await fetch(score ? `/api/scores/${score.id}?user_id=${userId}` : '/api/scores', {
          method: score ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: draft.id, user_id: userId, title: draft.title.trim(), composer: draft.composer.trim(),
            category: draft.category, score_type: draft.score_type, period: draft.period, score_style: draft.score_style,
            cover_file_id: cover?.fileId || null, cover_receipt: cover?.receipt,
            tips: draft.tips.trim() || null, published: isTeacher && draft.published, target_classes: isTeacher ? draft.target_classes : [],
            image_url: uploaded?.fileId ? null : uploaded?.url, file_id: uploaded?.fileId || null, file_name: uploaded?.name, file_type: uploaded?.type,
            pages: uploadedPages.map(file => ({ image_url: file.fileId ? null : file.url, file_id: file.fileId || null, file_name: file.name, file_type: file.type, upload_receipt: file.receipt })),
          }),
        }))
        coverCleanup.saved(cover?.fileId)
        lastSaved = saved
        if (saved.warning) toast.warning(saved.warning)
        update(draft.id, { status: 'done' })
        successes += 1
      } catch (error: unknown) {
        update(draft.id, { status: 'error', error: error instanceof Error ? error.message : '保存失败，请重试' })
      }
    }
    coverCleanup.endSave()
    setSaving(false)
    onSavingChange?.(false)
    if (successes && mounted.current) {
      onSaved(lastSaved)
      toast.success(`已保存 ${successes} 份琴谱`)
      if (drafts.length === 1 && !embedded) close()
    }
  }

  const content = <>
        {embedded ? <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">编辑琴谱信息</h2><p className="mt-1 text-xs text-muted-foreground">曲目封面与练习谱面分别维护</p></div><div className="flex shrink-0 items-center gap-1">{headerActions}<Button type="button" size="icon" variant="ghost" aria-label="关闭琴谱编辑面板" disabled={saving} onClick={close}><X className="size-4" /></Button></div></div> : <DialogHeader>
          <DialogTitle>{score ? '编辑琴谱属性与文件' : isTeacher ? '上传琴谱' : '上传个人琴谱'}</DialogTitle>
          <DialogDescription>{score ? '分别维护曲目封面与练习谱面，可追加、移除或调整谱页顺序。' : isTeacher ? '封面与谱面分别维护。一份琴谱可包含多张图片，也可批量上传独立曲目。PDF 请单独上传，默认未发布。' : '支持图片和 PDF。PDF 在浏览器内识别谱页，确认后可拆为多首。个人琴谱仅本人可见，保存后自动加入「我要练」。'}每份琴谱最多 {MAX_SCORE_PAGES} 页，单文件不超过 100MB。</DialogDescription>
        </DialogHeader>}
        <div className={embedded ? 'min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4' : 'space-y-4'}>
        {!score && <div className="space-y-2"><Label htmlFor="score-upload-mode">上传方式</Label><Select value={uploadMode} disabled={saving || pdfBusy} onValueChange={setUploadMode}><SelectTrigger id="score-upload-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="grouped">一份多页琴谱（多张图片属于同一首曲目）</SelectItem><SelectItem value="separate">批量独立琴谱（每个文件为一首曲目）</SelectItem></SelectContent></Select></div>}
        {(!embedded || !score) && <label className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-5 text-sm text-primary ${saving || pdfBusy ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-5 w-5" />
          {score ? '追加谱页（可多选）' : !isTeacher ? '选择琴谱图片（可多选）或单个 PDF' : uploadMode === 'grouped' ? drafts.length ? '添加另一份琴谱（可多选谱页）' : '选择一份琴谱的全部图片（可多选）' : '选择多份独立琴谱文件（可多选）'}
          <input type="file" aria-label={score ? '追加琴谱页面' : '选择琴谱文件'} accept={isTeacher || !score ? scoreFileTypes : 'image/*'} multiple disabled={saving || pdfBusy} className="hidden" onChange={(event) => { chooseFiles(event.target.files, score?.id); event.target.value = '' }} />
        </label>}
        {pdfProgress && <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><p role="status">{pdfProgress}</p><Button type="button" variant="ghost" size="sm" onClick={cancelPdfWork}>取消处理</Button></div>}
        {pdfError && <p role="alert" className="text-sm text-destructive">{pdfError}</p>}
        {pdfPreview && <ScorePdfPicker name={pdfPreview.file.name} pages={pdfPreview.pages} busy={Boolean(pdfProgress)} onCancel={() => { setPdfPreview(null); setPdfError('') }} onConfirm={confirmPdf} />}
        {isTeacher && classError && <div role="alert" className="flex items-center gap-2 text-sm text-destructive"><span>读取已创建班级失败：{classError}，可继续使用当前已知班级。</span><Button type="button" variant="outline" size="sm" onClick={() => setClassReload((value) => value + 1)}>重试</Button></div>}
        <div className="space-y-5">
          {drafts.map((draft, index) => (
            <fieldset key={draft.id} disabled={saving || draft.status === 'done'} className={embedded ? 'flex min-w-0 flex-col gap-4' : 'space-y-4 rounded-lg border border-border bg-card p-4'}>
              <div className="flex items-center gap-2 text-sm">
                {draft.status === 'done' ? <Check className="h-4 w-4 text-primary" /> : <FileMusic className="h-4 w-4 text-primary" />}
                <span className="min-w-0 flex-1 truncate">{index + 1}. {draft.title || '未命名琴谱'} · {draft.pages.length} 页</span>
                {draft.status === 'done' && <span className="text-primary">已保存</span>}
                {!score && draft.status !== 'done' && <Button type="button" variant="ghost" size="sm" onClick={() => { coverCleanup.discard(draft.cover?.fileId); setDrafts((all) => all.filter((d) => d.id !== draft.id)) }}>移除</Button>}
              </div>
              {embedded && properties(draft)}
              <div className={embedded ? 'score-editor-cover' : undefined}><ScoreCoverUpload id={draft.id} title={draft.title} composer={draft.composer} file={draft.cover_file} coverUrl={draft.cover?.url || null} hasCover={Boolean(draft.cover)} disabled={saving || draft.status === 'done'} onChoose={file => changeCover(draft, file)} onRemove={() => changeCover(draft, null)} /></div>
              <div className="space-y-3 rounded-lg border border-border p-4" aria-label={`${draft.title || '琴谱'}的页面顺序`}>
                <h3 className="text-sm font-medium">琴谱文件 *</h3>
                {draft.pages.map((page, pageIndex) => <div key={page.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs"><span className="shrink-0 text-primary">第 {pageIndex + 1} 页</span><span className="min-w-0 flex-1 truncate" title={page.file?.name ?? page.uploaded?.name}>{page.file?.name ?? page.uploaded?.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`第 ${pageIndex + 1} 页上移`} disabled={pageIndex === 0} onClick={() => changePages(draft.id, pages => { const next = [...pages]; [next[pageIndex - 1], next[pageIndex]] = [next[pageIndex], next[pageIndex - 1]]; return next })}><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`第 ${pageIndex + 1} 页下移`} disabled={pageIndex === draft.pages.length - 1} onClick={() => changePages(draft.id, pages => { const next = [...pages]; [next[pageIndex], next[pageIndex + 1]] = [next[pageIndex + 1], next[pageIndex]]; return next })}><ArrowDown className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="sm" aria-label={`移除第 ${pageIndex + 1} 页`} onClick={() => changePages(draft.id, pages => pages.filter(item => item.id !== page.id))}>移除</Button></div>)}
                {!draft.pages.length && <p className="text-xs text-muted-foreground">尚无谱页，请添加琴谱图片。</p>}
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-primary"><Upload className="h-3.5 w-3.5" />追加谱页<input type="file" aria-label={`为第 ${index + 1} 份琴谱追加页面`} accept={isTeacher ? 'image/*,application/pdf,.pdf' : 'image/*'} multiple disabled={saving || pdfBusy || draft.status === 'done'} className="hidden" onChange={event => { chooseFiles(event.target.files, draft.id); event.target.value = '' }} /></label>
              </div>
              {!embedded && properties(draft)}
              <div className="space-y-2"><Label htmlFor={`tips-${draft.id}`}>{isTeacher ? '教学要点 / 教师提醒' : '练习备注'}（选填）</Label><Textarea id={`tips-${draft.id}`} rows={2} value={draft.tips} onChange={(e) => update(draft.id, { tips: e.target.value })} placeholder={isTeacher ? '为学生留下一句练习提醒' : '记录自己的练习要点'} /></div>
              {isTeacher && <><div className="space-y-3 rounded-lg border border-border p-3"><Label>发布范围</Label>{classLoading && <p className="text-xs text-muted-foreground">正在读取已创建班级…</p>}<label className="flex items-center gap-2 text-sm"><Checkbox checked={!draft.target_classes.length} onCheckedChange={(checked) => update(draft.id, { target_classes: checked ? [] : availableClassNames.slice(0, 1) })} />全部班级</label><div className="flex flex-wrap gap-4">{[...new Set([...availableClassNames, ...draft.target_classes])].map(name => <label key={name} className="flex items-center gap-2 text-sm"><Checkbox checked={draft.target_classes.includes(name)} onCheckedChange={(checked) => update(draft.id, { target_classes: checked ? [...draft.target_classes, name] : draft.target_classes.filter(value => value !== name) })} />{name}</label>)}</div><p className="text-xs text-muted-foreground">未指定班级时，所有班级均可查看已发布琴谱。</p></div><label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={draft.published} onCheckedChange={(v) => update(draft.id, { published: v === true })} />发布琴谱，学生可见</label></>}
              {draft.error && <p role="alert" className="text-sm text-destructive">{draft.error}</p>}
            </fieldset>
          ))}
        </div>
        </div>
        <div className={`flex justify-between gap-3 border-t border-border ${embedded ? 'shrink-0 flex-col-reverse px-5 py-4' : 'items-center pt-4'}`}>
          <span className="text-xs text-muted-foreground">{completed ? `${completed} / ${drafts.length} 份已保存；重试仅处理未成功条目` : '同一琴谱的多张图片共用曲目属性，按页序保存'}</span>
          {pending.length ? <Button onClick={save} disabled={saving || pdfBusy} className="shrink-0 gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? '正在保存…' : drafts.some((d) => d.status === 'error') ? `重试未成功的 ${pending.length} 份` : score ? '保存修改' : `保存 ${pending.length} 份琴谱`}</Button> : <Button onClick={close}>{completed ? '完成' : '关闭'}</Button>}
        </div>
  </>
  return embedded ? <section aria-label="琴谱编辑面板" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">{content}</section> : <Dialog open onOpenChange={(open) => { if (!open && !saving) close() }}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl" showCloseButton={!saving}>{content}</DialogContent></Dialog>
}
