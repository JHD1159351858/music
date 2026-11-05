'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChatPanel } from '@/components/chat-panel'
import { AnalysisHistoryPanel } from '@/components/analysis/history-panel'
import { ScoreGuidePanel } from '@/components/analysis/score-guide-panel'
import type { AnalysisResult } from '@/lib/score-analysis'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
} from 'recharts'
import {
  Upload,
  FileMusic,
  Music2,
  AudioLines,
  Hash,
  Palette,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

export default function AnalysisPage() {
  const { user } = useRequireUser()
  if (!user) return null
  return <AnalysisWorkspace key={user.id} isStudent={user.role === 'student'} />
}

function AnalysisWorkspace({ isStudent }: { isStudent: boolean }) {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [notation, setNotation] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [scoreFile, setScoreFile] = useState<File | null>(null)
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [inputTab, setInputTab] = useState('musicxml')
  const [historyVersion, setHistoryVersion] = useState(0)
  const [openingHistoryId, setOpeningHistoryId] = useState<string | null>(null)
  const [historyOpenError, setHistoryOpenError] = useState<{ id: string; message: string } | null>(null)
  const [resultSession, setResultSession] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const scoreFileRef = useRef<HTMLInputElement>(null)
  const requestInFlight = useRef(false)
  const requestVersion = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  const chatContext = useMemo(() => result ? {
    kind: 'score' as const,
    name: result.title ?? undefined,
    analysis: result as unknown as Record<string, unknown>,
  } : undefined, [result])

  useEffect(() => () => {
    ++requestVersion.current
    activeRequest.current?.abort()
  }, [])

  const showError = (message: string) => {
    setAnalysisError(message)
    toast.error(message)
  }

  const analyze = async (input: { mode: 'musicxml'; file: File } | { mode: 'image'; file: File } | { mode: 'text'; notation: string }) => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const request = ++requestVersion.current
    setOpeningHistoryId(null)
    setHistoryOpenError(null)
    setAnalyzing(true)
    setResult(null)
    setPreview(null)
    setAnalysisError('')
    setSourceFileName(input.mode === 'text' ? null : input.file.name)
    try {
      let body: BodyInit
      let headers: HeadersInit | undefined
      if (input.mode === 'musicxml') {
        const form = new FormData()
        form.append('file', input.file)
        body = form
      } else {
        headers = { 'Content-Type': 'application/json' }
        if (input.mode === 'image') {
          const uri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败，请重新选择文件'))
            reader.onerror = () => reject(new Error('图片读取失败，请重新选择文件'))
            reader.readAsDataURL(input.file)
          })
          if (request !== requestVersion.current) return
          setPreview(uri)
          body = JSON.stringify({ mode: 'image', image: uri, fileName: input.file.name })
        } else {
          body = JSON.stringify({ mode: 'text', notation: input.notation })
        }
      }
      const res = await fetch('/api/analysis', { method: 'POST', headers, body, signal: controller.signal })
      const data: AnalysisResult & { error?: string } = await res.json().catch(() => {
        throw new Error('分析服务暂时未能返回结果，请稍后重试')
      })
      if (!res.ok) throw new Error(data.error ?? '分析未完成，请检查文件后重试')
      if (request !== requestVersion.current) return
      setResult(data)
      setResultSession(current => current + 1)
      setHistoryVersion(current => current + 1)
      setScoreFile(null)
      setPreview(null)
      toast.success('乐谱分析完成')
    } catch (e) {
      if (request !== requestVersion.current) return
      showError(e instanceof TypeError ? '暂时无法连接分析服务，请检查网络后重试' : e instanceof Error ? e.message : '分析失败，请重试')
    } finally {
      if (request === requestVersion.current) {
        requestInFlight.current = false
        setAnalyzing(false)
      }
    }
  }

  const openHistory = async (id: string) => {
    if (requestInFlight.current) return
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const request = ++requestVersion.current
    setOpeningHistoryId(id)
    setHistoryOpenError(null)
    setAnalysisError('')
    try {
      const response = await fetch(`/api/analysis/history/${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal })
      const data: AnalysisResult & { error?: string } = await response.json().catch(() => {
        throw new Error('暂时无法读取这份分析结果，请稍后重试')
      })
      if (!response.ok) throw new Error(data.error ?? '暂时无法读取这份分析结果')
      if (request !== requestVersion.current) return
      setResult(data)
      setResultSession(current => current + 1)
      setSourceFileName(data.fileName ?? null)
      setPreview(null)
      setScoreFile(null)
    } catch (cause: unknown) {
      if (request !== requestVersion.current) return
      setHistoryOpenError({ id, message: cause instanceof TypeError ? '暂时无法连接服务，请稍后重试' : cause instanceof Error ? cause.message : '暂时无法读取这份分析结果' })
    } finally {
      if (request === requestVersion.current) setOpeningHistoryId(null)
    }
  }

  const startNewAnalysis = () => {
    ++requestVersion.current
    activeRequest.current?.abort()
    setOpeningHistoryId(null)
    setHistoryOpenError(null)
    setResult(null)
    setPreview(null)
    setScoreFile(null)
    setSourceFileName(null)
    setAnalysisError('')
    setInputTab('musicxml')
  }

  const onPickScore = (file: File) => {
    setScoreFile(null)
    setAnalysisError('')
    if (!/\.(musicxml|mxl|xml)$/i.test(file.name)) {
      showError('请选择 .musicxml、.mxl 或 .xml 乐谱文件；图片请使用“乐谱图片”选项')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      showError('乐谱文件不能超过 8 MiB，请导出较小的 MusicXML 文件')
      return
    }
    if (file.size === 0) {
      showError('所选文件为空，请重新导出乐谱文件')
      return
    }
    setScoreFile(file)
  }

  const onPickImage = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      showError('图片不能超过 8 MiB')
      return
    }
    void analyze({ mode: 'image', file })
  }

  const metrics = result
    ? [
        { icon: KeyRound, label: result.music21 ? '谱面声明调性' : '调性判断', value: result.music21 ? result.music21.declaredKeys.join(' → ') || '未标注' : result.key ?? '未识别' },
        { icon: AudioLines, label: '音域跨度', value: result.range ?? '未识别' },
        { icon: Hash, label: '音符总数', value: result.noteCount === null ? '未识别' : String(result.noteCount) },
        { icon: Palette, label: '和弦色彩倾向', value: result.chordColor ?? '未识别' },
        ...(result.music21 ? [
          { icon: KeyRound, label: '算法推断调性', value: result.music21.estimatedKey ? `${result.music21.estimatedKey.name}${result.music21.estimatedKey.correlation === null ? '' : `（相关系数 ${result.music21.estimatedKey.correlation.toFixed(3)}）`}` : '无法推断' },
          { icon: Music2, label: '声部数', value: String(result.music21.partCount) },
          { icon: Hash, label: '小节数', value: String(result.music21.measureCount) },
          { icon: Hash, label: '休止符数', value: String(result.music21.restCount) },
          { icon: Music2, label: '拍号', value: result.music21.timeSignatures.join('、') || '未标注' },
          { icon: AudioLines, label: '速度标记', value: result.music21.tempos.length ? `${result.music21.tempos.join('、')} BPM` : '未标注' },
        ] : []),
      ]
    : []

  const histogram = result
    ? Object.entries(result.pitchHistogram ?? {}).map(([name, count]) => ({ name, 次数: count }))
    : []

  return (
    <div className={`space-y-6 ${isStudent ? 'concert-module concert-analysis' : ''}`}>
      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">乐谱分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传 MusicXML 乐谱，由 music21 解析实际音符、节拍与和声；乐曲背景仅引用已收录课程资料
        </p>
      </header>

      <div className={isStudent ? 'concert-analysis-workspace' : 'space-y-6'}>
      <aside className={isStudent ? 'concert-analysis-history' : undefined}><AnalysisHistoryPanel refreshVersion={historyVersion} openingId={openingHistoryId} disabled={analyzing} onOpen={(id) => void openHistory(id)} /></aside>
      <div className={isStudent ? 'concert-analysis-content' : 'space-y-6'}>
      {historyOpenError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span>{historyOpenError.message}</span><Button variant="outline" size="sm" onClick={() => void openHistory(historyOpenError.id)}>重试打开</Button></div>}

      {!result && !analyzing && (
        <Tabs value={inputTab} className="mx-auto max-w-2xl" onValueChange={(value) => { setInputTab(value); setAnalysisError('') }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="musicxml">MusicXML 文件</TabsTrigger>
            <TabsTrigger value="image">乐谱图片</TabsTrigger>
            <TabsTrigger value="text">记谱文本</TabsTrigger>
          </TabsList>
          <TabsContent value="musicxml">
            <div className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div>
                <h2 className="font-medium text-foreground">用 music21 解析乐谱文件</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">支持 .musicxml / .mxl / .xml，不超过 8 MiB。请从制谱软件导出 MusicXML；图片或 PDF 请先转换为乐谱文件。</p>
              </div>
              <button
                type="button"
                onClick={() => scoreFileRef.current?.click()}
                className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-10 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <FileMusic className="mb-3 h-8 w-8 text-primary/60" />
                <span className="font-medium text-foreground">{scoreFile ? '重新选择乐谱文件' : '点击选择 MusicXML 乐谱'}</span>
              </button>
              <input
                ref={scoreFileRef}
                type="file"
                accept=".musicxml,.mxl,.xml"
                aria-label="选择 MusicXML 乐谱文件"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPickScore(file)
                  e.target.value = ''
                }}
              />
              {scoreFile && <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <span className="min-w-0 break-all">{scoreFile.name} <span className="text-xs text-muted-foreground">（{(scoreFile.size / 1024).toFixed(1)} KiB）</span></span>
                <Button variant="ghost" size="icon" aria-label="清除已选文件" onClick={() => { setScoreFile(null); setAnalysisError('') }}><X className="h-4 w-4" /></Button>
              </div>}
              <Button className="w-full gap-2" disabled={!scoreFile || analyzing} onClick={() => { if (scoreFile) void analyze({ mode: 'musicxml', file: scoreFile }) }}>
                <FileMusic className="h-4 w-4" />开始解析
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground"><a href="/examples/music21-demo.musicxml" download className="text-primary underline-offset-4 hover:underline">下载 MusicXML 示例乐谱</a>：项目编写的演示文件，不是真实学生作品。下载后可在此上传体验。</p>
            </div>
          </TabsContent>
          <TabsContent value="image">
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">图片使用模型识别，不经过 music21；识别结果需对照原谱复核。</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-20 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Upload className="mb-4 h-10 w-10 text-primary/60" />
              <p className="font-medium text-foreground">点击选择乐谱图片</p>
              <p className="mt-1 text-xs text-muted-foreground">支持 PNG / JPG，不超过 8 MiB</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPickImage(f)
                e.target.value = ''
              }}
            />
          </TabsContent>
          <TabsContent value="text">
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">文本使用现有基础解析器，不经过 music21。需要声部、节拍及和声分析，请上传 MusicXML 文件。</p>
              <Textarea
                rows={10}
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
                placeholder={'粘贴完整 MusicXML（score-partwise）或 ABC 记谱文本，例如：\nX:1\nT:小星星\nM:4/4\nK:C\nC C G G | A A G2 |'}
                className="font-mono text-xs"
              />
              <Button className="w-full gap-2" onClick={() => { if (notation.trim()) void analyze({ mode: 'text', notation }) }} disabled={!notation.trim() || analyzing}>
                <FileMusic className="h-4 w-4" />
                开始分析
              </Button>
            </div>
          </TabsContent>
          {analysisError && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{analysisError}</p>}
        </Tabs>
      )}

      {analyzing && (
        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-border bg-card px-6 py-20">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="乐谱预览" className="mb-6 max-h-48 rounded-lg opacity-60" />
          )}
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          {sourceFileName && <p className="mt-4 max-w-full break-all text-sm text-foreground">{sourceFileName}</p>}
          <p className="mt-4 text-sm text-muted-foreground">{inputTab === 'musicxml' ? 'music21 正在解析实际音符、节拍与和声…' : '正在识别谱面并解析音乐结构…'}</p>
        </div>
      )}

      {result && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 左侧：分析结果 */}
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  {result.title ?? '未命名乐谱'}
                </h2>
                <p className="text-sm text-muted-foreground">{result.composer ?? '作曲者不详'}</p>
                {sourceFileName && <p className="mt-1 break-all text-xs text-muted-foreground">文件：{sourceFileName}</p>}
                {result.historyId && <p className="mt-1 text-xs text-muted-foreground">已保存至历史记录</p>}
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={startNewAnalysis}>
                分析新乐谱
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <m.icon className="h-4 w-4 text-primary" />
                    {m.label}
                  </div>
                  <div className="mt-2 font-medium leading-snug text-foreground">{m.value}</div>
                </div>
              ))}
              <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Music2 className="h-4 w-4 text-primary" />
                  分析摘要
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{result.summary ?? '未识别'}</p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
              <p>指标来源：{result.music21 ? `music21 ${result.music21.version} · MusicXML 实际解析` : result.provenance === 'musicxml' ? 'MusicXML 基础文本解析（非 music21）' : result.provenance === 'abc' ? 'ABC 基础文本解析（非 music21）' : '图片模型识别（非 music21），须对照原谱复核'}</p>
              {result.music21 && <p>谱面声明调性来自乐谱标注；算法推断调性和和声解释供练习参考，相关系数不是正确率。</p>}
              {result.warnings.map(warning => <p key={warning}>{warning}</p>)}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-2 font-serif text-base font-semibold">{result.music21 ? '音符时间线' : '音高走向'}</h3>
              <p className="mb-4 text-xs text-muted-foreground">{result.music21 ? `横轴为起拍位置（四分音符 = 1），纵轴为 MIDI 音高；散点保留多声部同时发音。展示前 ${Math.min(500, result.music21.notes.length)} / ${result.music21.notes.length} 个音符。` : '横轴为谱面音符顺序，纵轴为 MIDI 音高；多声部按谱面读取顺序展示。'}</p>
              {result.music21 ? result.music21.notes.length ? <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <XAxis type="number" dataKey="offset" name="起拍位置" stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis type="number" dataKey="midi" name="MIDI 音高" stroke="var(--muted-foreground)" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    <Scatter data={result.music21.notes.slice(0, 500)} fill="var(--chart-1)" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div> : <p className="py-8 text-center text-sm text-muted-foreground">暂无有音高的音符</p> : result.pitchSequence?.length ? <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={result.pitchSequence}><XAxis dataKey="index" stroke="var(--muted-foreground)" fontSize={12} /><YAxis dataKey="midi" stroke="var(--muted-foreground)" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} /><Tooltip labelFormatter={label => `第${label}个音符`} formatter={(value, _name, item) => [String(item.payload?.note ?? value), '音高']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} /><Line type="linear" dataKey="midi" stroke="var(--chart-1)" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="py-8 text-center text-sm text-muted-foreground">未识别，暂无可靠音高数据</p>}
            </div>

            {result.music21 && <>
              <section className="min-w-0 rounded-xl border border-border bg-card p-5">
                <h3 className="font-serif text-base font-semibold">音符解析预览</h3>
                <p className="mb-4 mt-2 text-xs text-muted-foreground">展示前 {Math.min(40, result.music21.notes.length)} / {result.music21.notes.length} 个音符。起拍位置与时值均以四分音符为 1；“—”表示谱面未提供。</p>
                <Table>
                  <TableHeader><TableRow><TableHead>音符</TableHead><TableHead>声部</TableHead><TableHead>小节</TableHead><TableHead>拍位</TableHead><TableHead>起拍位置</TableHead><TableHead>时值</TableHead><TableHead>声线</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.music21.notes.slice(0, 40).map((note) => <TableRow key={note.index}>
                      <TableCell>{note.note}</TableCell><TableCell>{note.part}</TableCell><TableCell>{note.measure ?? '—'}</TableCell><TableCell>{note.beat === null ? '—' : Number(note.beat.toFixed(3))}</TableCell><TableCell>{Number(note.offset.toFixed(3))}</TableCell><TableCell>{Number(note.duration.toFixed(3))}</TableCell><TableCell>{note.voice ?? '—'}</TableCell>
                    </TableRow>)}
                    {!result.music21.notes.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">暂无有音高的音符</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </section>
              <section className="min-w-0 rounded-xl border border-border bg-card p-5">
                <h3 className="font-serif text-base font-semibold">和声解析预览</h3>
                <p className="mb-4 mt-2 text-xs text-muted-foreground">展示前 {Math.min(40, result.music21.chords.length)} / {result.music21.chords.length} 个和声切片。由同时发声的音组合识别，罗马数字为算法参考。</p>
                <Table>
                  <TableHeader><TableRow><TableHead>小节 / 拍位</TableHead><TableHead>起拍位置</TableHead><TableHead>构成音</TableHead><TableHead>和弦名称</TableHead><TableHead>罗马数字</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.music21.chords.slice(0, 40).map((chord, index) => <TableRow key={index}>
                      <TableCell>{chord.measure ?? '—'} / {chord.beat === null ? '—' : Number(chord.beat.toFixed(3))}</TableCell><TableCell>{Number(chord.offset.toFixed(3))}</TableCell><TableCell>{chord.notes.join('、')}</TableCell><TableCell>{chord.name}</TableCell><TableCell>{chord.romanNumeral ?? '—'}</TableCell>
                    </TableRow>)}
                    {!result.music21.chords.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">暂无可识别的和声切片</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </section>
            </>}

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 font-serif text-base font-semibold text-foreground">音名出现次数</h3>
              {histogram.length ? <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogram}>
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        color: 'var(--foreground)',
                      }}
                    />
                    <Bar dataKey="次数" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div> : <p className="py-8 text-center text-sm text-muted-foreground">未识别，暂无可靠统计数据</p>}
            </div>

            <ScoreGuidePanel key={resultSession} result={result} />
          </div>

          {/* 右侧：对话窗口 */}
          <div className="lg:col-span-2">
            <ChatPanel
              key={resultSession}
              className="h-[640px]"
              context={chatContext}
              autoPrompt={`请先依据这份乐谱${result.title ? `《${result.title}》` : ''}的实际解析统计，说明音域、音符、节拍与和声特点，并给出具体练习参考；区分谱面声明调性与算法推断，图片识别须提示复核。作品及作曲家背景、创作年代和所属时期，仅在已收录课程资料有来源时介绍，未收录则明确说明，不作推测。`}
              placeholder="就这份乐谱继续提问…"
            />
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  )
}
