export async function teachingApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : '请求失败，请稍后重试'
    throw new Error(message)
  }
  return body as T
}

export function jsonBody(value: unknown): Pick<RequestInit, 'headers' | 'body'> {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export function teachingDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function teachingDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds % 60} 秒`
}
