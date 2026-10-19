'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AdminColumn<T> {
  key: string
  label: string
  className?: string
  render: (row: T) => ReactNode
}

export function AdminPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>
}

export function AdminNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>重试</Button>}</div>
}

export function AdminTable<T>({ rows, columns, rowKey, emptyText = '暂无数据', pageSize = 20, pagination = true }: {
  rows: T[]; columns: AdminColumn<T>[]; rowKey: (row: T) => string; emptyText?: string; pageSize?: number; pagination?: boolean
}) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const visible = pagination ? rows.slice((current - 1) * pageSize, current * pageSize) : rows
  return <div className="overflow-hidden rounded-xl border border-border bg-card">
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/60 text-muted-foreground"><tr>{columns.map(column => <th key={column.key} scope="col" className={cn('whitespace-nowrap px-4 py-3 text-xs font-medium', column.className)}>{column.label}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">{visible.map(row => <tr key={rowKey(row)} className="hover:bg-muted/30">{columns.map(column => <td key={column.key} className={cn('px-4 py-3.5 align-middle', column.className)}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table>{visible.length === 0 && <div className="px-5 py-14 text-center text-sm text-muted-foreground">{emptyText}</div>}</div>
    {pagination && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>共 {rows.length} 条 · 每页 {pageSize} 条</span><div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>上一页</Button><span>{current} / {pages}</span><Button variant="outline" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>下一页</Button></div></div>}
  </div>
}
