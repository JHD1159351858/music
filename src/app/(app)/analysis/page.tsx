'use client'

import { useRef, useState } from 'react'
import { useRequireUser } from '@/lib/user-context'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatPanel } from '@/components/chat-panel'
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
} from 'lucide-react'
import { toast } from 'sonner'

export default function AnalysisPage() {
  const { user } = useRequireUser()
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [notation, setNotation] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  const analyzeImage = async (dataUri: string) => {
    setAnalyzing(true)
    setResult(null)
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'image', image: dataUri }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '分析失败')
      setResult(data)
      toast.success('乐谱分析完成')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败，请重试')
    } finally {
      setAnalyzing(false)
    }
  }

  const analyzeText = async () => {
    if (!notation.trim()) return
    setAnalyzing(true)
    setResult(null)
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'text', notation }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '分析失败')
      setResult(data)
      toast.success('乐谱分析完成')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '分析失败，请重试')
    } finally {
      setAnalyzing(false)
    }
  }

  const onPickImage = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('图片不能超过 8MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const uri = reader.result as string
      setPreview(uri)
      analyzeImage(uri)
    }
    reader.readAsDataURL(file)
  }

  const metrics = result
    ? [
        { icon: KeyRound, label: '调性判断', value: result.key ?? '未识别' },
        { icon: AudioLines, label: '音域跨度', value: result.range ?? '未识别' },
        { icon: Hash, label: '音符总数', value: result.noteCount === null ? '未识别' : String(result.noteCount) },
        { icon: Palette, label: '和弦色彩倾向', value: result.chordColor ?? '未识别' },
      ]
    : []

  const histogram = result
    ? Object.entries(result.pitchHistogram ?? {}).map(([name, count]) => ({ name, 次数: count }))
    : []

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-bold text-foreground">乐谱分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传乐谱图片，或粘贴 MusicXML / ABC 文本；未识别的指标保留空值，乐曲背景优先引用课程资料
        </p>
      </header>

      {!result && !analyzing && (
        <Tabs defaultValue="image" className="mx-auto max-w-2xl">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image">上传乐谱图片</TabsTrigger>
            <TabsTrigger value="text">MusicXML / ABC 文本</TabsTrigger>
          </TabsList>
          <TabsContent value="image">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/50 px-6 py-20 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <Upload className="mb-4 h-10 w-10 text-primary/60" />
              <p className="font-medium text-foreground">点击选择乐谱图片</p>
              <p className="mt-1 text-xs text-muted-foreground">支持 PNG / JPG，不超过 8MB</p>
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
              <Textarea
                rows={10}
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
                placeholder={'粘贴完整 MusicXML（score-partwise）或 ABC 记谱文本，例如：\nX:1\nT:小星星\nM:4/4\nK:C\nC C G G | A A G2 |'}
                className="font-mono text-xs"
              />
              <Button className="w-full gap-2" onClick={analyzeText} disabled={!notation.trim()}>
                <FileMusic className="h-4 w-4" />
                开始分析
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {analyzing && (
        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border border-border bg-card px-6 py-20">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="乐谱预览" className="mb-6 max-h-48 rounded-lg opacity-60" />
          )}
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">正在识别谱面并解析音乐结构…</p>
        </div>
      )}

      {result && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 左侧：分析结果 */}
          <div className="space-y-6 lg:col-span-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  {result.title ?? '未命名乐谱'}
                </h2>
                <p className="text-sm text-muted-foreground">{result.composer ?? '作曲者不详'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setResult(null); setPreview(null) }}>
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
              <p>指标来源：{result.provenance === 'musicxml' ? 'MusicXML 实际音符解析' : result.provenance === 'abc' ? 'ABC 实际音符解析' : '图片模型识别，须对照原谱复核'}</p>
              {result.warnings.map(warning => <p key={warning}>{warning}</p>)}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-2 font-serif text-base font-semibold">音高走向</h3>
              <p className="mb-4 text-xs text-muted-foreground">横轴为谱面音符顺序，纵轴为 MIDI 音高；多声部按谱面读取顺序展示。</p>
              {result.pitchSequence?.length ? <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={result.pitchSequence}><XAxis dataKey="index" stroke="var(--muted-foreground)" fontSize={12} /><YAxis dataKey="midi" stroke="var(--muted-foreground)" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} /><Tooltip labelFormatter={label => `第${label}个音符`} formatter={(value, _name, item) => [String(item.payload?.note ?? value), '音高']} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} /><Line type="linear" dataKey="midi" stroke="var(--chart-1)" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="py-8 text-center text-sm text-muted-foreground">未识别，暂无可靠音高数据</p>}
            </div>

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

            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 font-serif text-lg font-semibold">乐曲导读</h3>
              <p className="mb-4 text-xs text-muted-foreground">以下内容来自已收录课程资料。未收录的项目显示未识别，可向教师补充询问。</p>
              <dl className="space-y-4">{[['作品背景', result.workBackground], ['作曲家背景', result.composerBackground], ['创作年代', result.creationYear], ['所属时期', result.period], ['乐曲曲调', result.melody]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{value ?? '未识别（课程资料未收录）'}</dd></div>)}</dl>
            </section>
          </div>

          {/* 右侧：对话窗口 */}
          <div className="lg:col-span-2">
            <ChatPanel
              className="h-[640px]"
              context={{ kind: 'score', name: result.title ?? undefined, analysis: result as unknown as Record<string, unknown> }}
              autoPrompt={`请依据已收录课程知识介绍这份乐谱${result.title ? `《${result.title}》` : ''}的作品背景、作曲家背景、创作年代、所属时期与乐曲曲调；未收录的项目请明确说明。`}
              placeholder="就这份乐谱继续提问…"
            />
          </div>
        </div>
      )}
    </div>
  )
}
