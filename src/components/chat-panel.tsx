'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { explanationResourcesSchema, type ExplanationResource } from '@/lib/score-explanation'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  /** SSE 对话上下文，透传给 /api/chat */
  context?: { kind: 'score' | 'composer'; name?: string; composerId?: string; analysis?: Record<string, unknown> } |
    { kind: 'score-intro'; historyId: string }
  /** 自动发送的开场指令（传入即自动触发一条助手消息） */
  autoPrompt?: string
  hideAutoPrompt?: boolean
  placeholder?: string
  className?: string
}

/** 通用流式对话面板：后端 SSE，前端逐块渲染 */
export function ChatPanel({ context, autoPrompt, hideAutoPrompt = false, placeholder, className }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sources, setSources] = useState<{ title: string; url: string | null }[]>([])
  const [resources, setResources] = useState<ExplanationResource[]>([])
  const [streamError, setStreamError] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const autoFired = useRef(false)
  // 用 ref 追踪 context 引用，避免对象字面量导致的重复触发
  const contextRef = useRef(context)
  contextRef.current = context

  const send = async (text: string, history: ChatMessage[]) => {
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: text }]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setStreaming(true)
    setStreamError('')
    setSources([])
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextHistory,
          context: contextRef.current,
        }),
      })
      if (!res.ok || !res.body) throw new Error('请求失败')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json: unknown = JSON.parse(payload)
            if (!json || typeof json !== 'object') continue
            if ('error' in json && typeof json.error === 'string') {
              setStreamError(json.error)
              if (!acc) {
                acc = json.error
                setMessages(current => [...current.slice(0, -1), { role: 'assistant', content: acc }])
              }
            }
            if ('sources' in json && Array.isArray(json.sources)) {
              setSources(json.sources.filter((source): source is { title: string; url: string | null } => !!source && typeof source === 'object' && 'title' in source && typeof source.title === 'string' && 'url' in source && (source.url === null || typeof source.url === 'string' && /^https?:\/\//i.test(source.url))))
            }
            if (contextRef.current?.kind === 'score-intro' && 'resources' in json) {
              const checked = explanationResourcesSchema.safeParse(json.resources)
              if (checked.success) setResources(checked.data)
            }
            if ('content' in json && typeof json.content === 'string') {
              acc += json.content
              setMessages((m) => {
                const copy = [...m]
                copy[copy.length - 1] = { role: 'assistant', content: acc }
                return copy
              })
            }
          } catch {
            /* 忽略不完整分块 */
          }
        }
      }
      return acc
    } catch {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: '对话服务暂时不可用，请稍后再试。' }
        return copy
      })
      return ''
    } finally {
      setStreaming(false)
    }
  }

  // 自动开场白
  useEffect(() => {
    if (autoPrompt && !autoFired.current) {
      autoFired.current = true
      send(autoPrompt, [])
    }
  }, [autoPrompt])

  useEffect(() => {
    const container = messagesRef.current
    if (container && !(hideAutoPrompt && messages.length <= 2)) container.scrollTop = container.scrollHeight
  }, [hideAutoPrompt, messages])

  return (
    <div className={cn('concert-chat flex min-h-0 flex-col rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        知音 · 智能讲解
      </div>
      <div ref={messagesRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 && !streaming && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            输入问题，开始与知音对话
          </p>
        )}
        {messages.map((m, i) => hideAutoPrompt && i === 0 && m.content === autoPrompt ? null : (
          <Fragment key={i}>
          <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              data-role={m.role}
              className={cn(
                'concert-chat-message rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                hideAutoPrompt && i === 1 ? 'w-full' : 'max-w-[85%]',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-foreground'
              )}
            >
              {m.content || (streaming && i === messages.length - 1 ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null)}
            </div>
          </div>
          {i === 1 && m.role === 'assistant' && resources.length > 0 && (
            <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-3" aria-label="拓展资料">
              <h3 className="text-sm font-medium">拓展资料</h3>
              <ul className="space-y-2 text-sm">
                {resources.map(resource => (
                  <li key={resource.url}>
                    <a className="block text-primary underline-offset-4 hover:underline" href={resource.url} target="_blank" rel="noopener noreferrer">
                      {resource.imageUrl && <Image
                        src={resource.imageUrl}
                        alt={resource.title}
                        width={112}
                        height={140}
                        className="mb-2 max-h-36 w-auto rounded object-contain"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />}
                      {resource.title}
                    </a>
                  </li>
                ))}
              </ul>
              {resources.some(resource => resource.kind === 'search') && <p className="text-xs text-muted-foreground">
                搜索入口按曲名和作曲家打开平台结果。
              </p>}
            </section>
          )}
          </Fragment>
        ))}
      </div>
      {sources.length > 0 && <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground"><span>本轮参考：</span>{sources.map((source, index) => <span key={`${source.title}-${index}`} className="mr-2">{source.url ? <a className="text-primary underline-offset-4 hover:underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</span>)}</div>}
      {streamError && <p role="alert" className="px-4 py-2 text-xs text-destructive">{streamError}</p>}
      <div className="flex gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? '继续追问…'}
          disabled={streaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim() && !streaming) {
              const text = draft.trim()
              setDraft('')
              send(text, messages)
            }
          }}
        />
        <Button
          size="icon"
          disabled={!draft.trim() || streaming}
          onClick={() => {
            const text = draft.trim()
            setDraft('')
            send(text, messages)
          }}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
