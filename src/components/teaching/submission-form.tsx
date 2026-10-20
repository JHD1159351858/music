'use client'

import { useEffect, useState } from 'react'
import { Upload, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage, jsonBody, teachingApi, teachingDate, teachingDuration } from './api'
import type { PracticeRecord, PracticeTask, TaskSubmission } from '@/lib/teaching-types'

interface UploadResult { fileId: string; url: string }
interface Props { userId: string; task: PracticeTask; records: PracticeRecord[]; initialRecordId: string | null; submission: TaskSubmission | null; onSaved: () => void }

export function SubmissionForm({ userId, task, records, initialRecordId, submission, onSaved }: Props) {
  const initialRecord = records.find((record) => record.id === initialRecordId)
  const [audio, setAudio] = useState<UploadResult | null>(submission?.audio_url ? { url: submission.audio_url, fileId: submission.audio_file_id ?? '' } : initialRecord?.audio_url ? { url: initialRecord.audio_url, fileId: initialRecord.audio_file_id ?? '' } : null)
  const [video, setVideo] = useState<UploadResult | null>(submission?.video_url ? { url: submission.video_url, fileId: submission.video_file_id ?? '' } : null)
  const [recordId, setRecordId] = useState(submission?.practice_record_id ?? initialRecord?.id ?? '')
  const [recordText, setRecordText] = useState(submission?.record_text ?? '')
  const [uploading, setUploading] = useState<'audio' | 'video' | 'record' | null>(null)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const started = now !== null && now >= new Date(task.start_at).getTime()
  const ended = now !== null && now > new Date(task.end_at).getTime()
  const blocked = task.closed || ended || !started
  const busy = saving || uploading !== null || blocked

  async function upload(file: File, kind: 'audio' | 'video') {
    if (!file.type.startsWith(`${kind}/`)) return toast.error(kind === 'audio' ? '请选择音频文件' : '请选择视频文件')
    setUploading(kind)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('user_id', userId)
      const result = await teachingApi<UploadResult>('/api/upload', { method: 'POST', body: formData })
      if (kind === 'audio') setAudio(result)
      else setVideo(result)
      toast.success('文件已上传，请提交任务以保存材料')
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setUploading(null) }
  }

  async function uploadRecord(file: File) {
    if (file.size > 1024 * 1024) return toast.error('文字练习记录请控制在 1MB 以内')
    if (!/\.(txt|md)$/i.test(file.name)) return toast.error('练习记录支持 TXT、Markdown 文字文件')
    setUploading('record')
    try {
      const text = await file.text()
      if (text.length > 5000) throw new Error('练习记录最多支持 5000 字，请精简后上传')
      setRecordText(text)
      toast.success('练习记录已读取，请提交保存')
    }
    catch (error) { toast.error(errorMessage(error)) }
    finally { setUploading(null) }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (task.requirements.audio === 'required' && !audio) return toast.error('请提交必交的练习录音')
    if (task.requirements.video === 'required' && !video) return toast.error('请提交必交的演奏视频')
    if (task.requirements.record === 'required' && !recordId && !recordText.trim()) return toast.error('请选择或填写必交的练习记录')
    setSaving(true)
    try {
      await teachingApi(`/api/tasks/${task.id}/submissions`, { method: 'POST', ...jsonBody({ user_id: userId, audio_url: task.requirements.audio !== 'off' ? audio?.url ?? null : null, audio_file_id: task.requirements.audio !== 'off' ? audio?.fileId || null : null, video_url: task.requirements.video !== 'off' ? video?.url ?? null : null, video_file_id: task.requirements.video !== 'off' ? video?.fileId || null : null, practice_record_id: task.requirements.record !== 'off' ? recordId || null : null, record_text: task.requirements.record !== 'off' ? recordText.trim() || null : null }) })
      toast.success('任务材料已提交')
      onSaved()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setSaving(false) }
  }

  return <form onSubmit={submit} className="space-y-6 rounded-xl border border-border bg-card p-6"><div><h2 className="font-serif text-xl">{submission ? '更新提交材料' : '提交练习材料'}</h2><p className="mt-2 text-sm text-muted-foreground">{blocked ? task.closed ? '任务已关闭，无法提交。' : ended ? '任务已截止，无法提交。' : `任务将于 ${teachingDate(task.start_at)} 开始。` : submission ? '重新提交后，教师将重新评阅你的最新材料。' : '可关联在线练习记录，也可单独上传自己的练习材料。'}</p></div>
    {(['audio', 'video'] as const).filter((kind) => task.requirements[kind] !== 'off').map((kind) => {
      const material = kind === 'audio' ? audio : video
      return <div key={kind} className="space-y-3"><Label htmlFor={`submission-${kind}`}>{kind === 'audio' ? '练习录音' : '自制演奏视频'}<span className="ml-2 text-xs text-primary">{task.requirements[kind] === 'required' ? '必交' : '选交'}</span></Label><Input id={`submission-${kind}`} type="file" accept={`${kind}/*`} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, kind); event.target.value = '' }} />{uploading === kind && <p className="text-xs text-primary">正在上传文件，请等待…</p>}{material && <div className="space-y-2">{kind === 'audio' ? <audio controls preload="metadata" className="w-full" src={material.url} /> : <video controls preload="metadata" className="max-h-72 w-full rounded-lg bg-muted" src={material.url} />}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => kind === 'audio' ? setAudio(null) : setVideo(null)}>移除{kind === 'audio' ? '录音' : '视频'}</Button></div>}</div>
    })}
    {task.requirements.record !== 'off' && <div className="space-y-3"><Label>练习记录<span className="ml-2 text-xs text-primary">{task.requirements.record === 'required' ? '必交' : '选交'}</span></Label><Select value={recordId || 'none'} disabled={busy} onValueChange={(value) => { const id = value === 'none' ? '' : value; setRecordId(id); const record = records.find((item) => item.id === id); if (record?.audio_url && task.requirements.audio !== 'off' && !audio) setAudio({ url: record.audio_url, fileId: record.audio_file_id ?? '' }) }}><SelectTrigger className="w-full"><SelectValue placeholder="关联一条在线练习记录" /></SelectTrigger><SelectContent><SelectItem value="none">不关联在线记录，填写文字说明</SelectItem>{records.map((record) => <SelectItem key={record.id} value={record.id}>{record.piece_title} · {teachingDuration(record.duration_seconds)} · {record.practice_date}</SelectItem>)}</SelectContent></Select><Textarea aria-label="练习记录文字" disabled={busy} rows={4} maxLength={5000} value={recordText} onChange={(event) => setRecordText(event.target.value)} placeholder="填写练习内容、时长和心得；也可以上传 TXT / Markdown 练习记录（最多 5000 字）。" /><label className="inline-flex cursor-pointer items-center gap-2 text-xs text-primary"><Upload className="h-4 w-4" />读取文字练习记录<input type="file" className="hidden" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadRecord(file); event.target.value = '' }} /></label></div>}
    <Button type="submit" disabled={busy} className="gap-2"><Send className="h-4 w-4" />{saving ? '提交中…' : uploading ? '文件上传中…' : submission ? '更新提交' : '提交任务'}</Button>
  </form>
}
