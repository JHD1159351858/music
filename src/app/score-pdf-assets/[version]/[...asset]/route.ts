import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { version } from 'pdfjs-dist/package.json'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ version: string; asset: string[] }> }) {
  const { version: requestedVersion, asset } = await params
  const name = asset.join('/')
  let mime: string
  if (/^legacy\/build\/pdf(?:\.worker)?\.min\.mjs$/.test(name) || /^wasm\/(?:jbig2|openjpeg)_nowasm_fallback\.js$/.test(name)) mime = 'text/javascript; charset=utf-8'
  else if (/^wasm\/(?:jbig2|openjpeg|qcms_bg)\.wasm$/.test(name)) mime = 'application/wasm'
  else if (/^(?:cmaps\/[A-Za-z0-9_-]+\.bcmap|standard_fonts\/[A-Za-z0-9_-]+\.(?:pfb|ttf)|iccs\/CGATS001Compat-v2-micro\.icc)$/.test(name)) mime = 'application/octet-stream'
  else return new Response(null, { status: 404 })

  if (requestedVersion !== version) return new Response(null, { status: 404 })
  try {
    const file = await readFile(resolve(process.cwd(), 'node_modules/pdfjs-dist', ...asset))
    return new Response(new Uint8Array(file), { headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch {
    return new Response(null, { status: 404 })
  }
}
