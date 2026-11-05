export type ScorePdfPageKind = 'score' | 'uncertain' | 'other'

function countStaves(shade: Float32Array, top: number, bottom: number): number {
  const peaks = new Uint8Array(shade.length)
  for (let row = top + 2; row < bottom - 2; row++) {
    if (shade[row] > 0.36 && shade[row] - (shade[row - 2] + shade[row + 2]) / 2 > 0.105) peaks[row] = 1
  }
  let count = 0
  for (let row = top + 2; row < bottom - 2; row++) {
    if (!peaks[row]) continue
    for (let spacing = 3; spacing <= 6; spacing += 0.5) {
      let last = row
      for (let line = 1; line <= 4; line++) {
        const expected = row + line * spacing
        const low = Math.ceil(expected - 0.75)
        const high = Math.floor(expected + 0.75)
        if (peaks[low]) last = low
        else if (peaks[high]) last = high
        else break
      }
      if (last < row + spacing * 4 - 0.75) continue
      count++
      if (count === 2) return count
      row = last
      break
    }
  }
  return count
}

export function inspectScorePdfPage({ width, height, data }: Pick<ImageData, 'width' | 'height' | 'data'>): ScorePdfPageKind {
  if (width < 40 || height < 40) return 'other'
  const gray = new Uint8Array(width * height)
  for (let pixel = 0, i = 0; pixel < gray.length; pixel++, i += 4) {
    gray[pixel] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8
  }
  const top = Math.floor(height * 0.08), bottom = Math.floor(height * 0.91)
  const left = Math.floor(width * 0.09), right = Math.floor(width * 0.91)
  const shade = new Float32Array(height)
  const offset = new Int32Array(right - left), fraction = new Float32Array(right - left)
  let best = 0
  // A small vertical shear compensates for the slant in scanned sheet music.
  for (const angle of [0, -0.5, 0.5, -1, 1, -1.5, 1.5]) {
    const slope = Math.tan(angle * Math.PI / 180)
    for (let x = left; x < right; x++) {
      const dy = slope * (x - width / 2)
      const rowOffset = Math.floor(dy)
      offset[x - left] = rowOffset * width + x
      fraction[x - left] = dy - rowOffset
    }
    for (let y = top; y < bottom; y++) {
      let dark = 0
      for (let x = 0; x < offset.length; x++) {
        const i = y * width + offset[x]
        const value = gray[i] + (gray[i + width] - gray[i]) * fraction[x]
        if (value < 188) dark++
      }
      shade[y] = dark / offset.length
    }
    best = Math.max(best, countStaves(shade, top, bottom))
    if (best === 2) return 'score'
  }
  return best === 1 ? 'uncertain' : 'other'
}

export function suggestScorePdfPages(kinds: readonly ScorePdfPageKind[]): number[] {
  let start = 0, last = 0, bestStart = 0, bestEnd = -1
  kinds.forEach((kind, index) => {
    if (kind !== 'score') return
    const page = index + 1
    if (!start || page - last > 3) start = page
    last = page
    if (page - start > bestEnd - bestStart) {
      bestStart = start
      bestEnd = page
    }
  })
  return Array.from({ length: bestEnd - bestStart + 1 }, (_, index) => bestStart + index)
}

export function parseScorePdfRange(input: string, total: number): { pages: number[]; error?: string } {
  if (!input.trim()) return { pages: [] }
  const selected = new Set<number>()
  for (const token of input.trim().split(/[,，、]/)) {
    const match = /^(\d+)(?:\s*[-–—－~～至]\s*(\d+))?$/.exec(token.trim())
    if (!match) return { pages: [], error: '请输入原 PDF 页码，例如 15-33, 40。' }
    const start = Number(match[1]), end = Number(match[2] ?? match[1])
    if (start < 1 || end < start || end > total) return { pages: [], error: `请输入 1 到 ${total} 之间、起点不大于终点的页码。` }
    for (let page = start; page <= end; page++) selected.add(page)
  }
  return { pages: [...selected].sort((a, b) => a - b) }
}

export function formatScorePdfRange(pages: readonly number[]): string {
  const parts: string[] = []
  for (let index = 0; index < pages.length; index++) {
    const start = pages[index]
    while (pages[index + 1] === pages[index] + 1) index++
    const end = pages[index]
    parts.push(start === end ? String(start) : `${start}-${end}`)
  }
  return parts.join(', ')
}
