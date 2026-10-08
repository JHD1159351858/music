'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  /** SSE 对话上下文，透传给 /api/chat */
  context?: { kind: 'score' | 'composer'; name?: string; analysis?: Record<string, unknown> }
  /** 自动发送的开场指令（传入即自动触发一条助手消息） */
  autoPrompt?: string
  placeholder?: string
  className?: string
}

/** 通用流式对话面板：后端 SSE，前端逐块渲染 */
export function ChatPanel({ context, autoPrompt, placeholder, className }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoFired = useRef(false)
  // 用 ref 追踪 context 引用，避免对象字面量导致的重复触发
  const contextRef = useRef(context)
  contextRef.current = context

  const send = async (text: string, history: ChatMessage[]) => {
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: text }]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setStreaming(true)
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
            const json = JSON.parse(payload)
            if (json.content) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        知音 · 智能讲解
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !streaming && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            输入问题，开始与知音对话
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
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
        ))}
        <div ref={bottomRef} />
      </div>
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
