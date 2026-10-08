import { NextResponse } from 'next/server'
import { LLMClient, Config, type Message } from 'coder-coding-dev-sdk'

const ANALYSIS_PROMPT = `你是一位专业的音乐乐谱分析引擎。请分析用户提供的乐谱（图片或 MusicXML/ABC 结构化文本），返回严格的 JSON 结果，不要输出任何 JSON 以外的内容。

JSON 结构如下：
{
  "title": "作品名称（能识别则填，否则填 null）",
  "composer": "作曲家（能识别则填，否则填 null）",
  "key": "调性判断，如 C大调 / a小调",
  "range": "音域跨度，如 c1 - a2（约十四度）",
  "noteCount": 音符总数（整数估计值）,
  "rhythmDensity": "节奏密度描述，如 中等（以八分音符为主）",
  "chordColor": "和弦色彩倾向，如 明亮的大三和弦为主，偶见属七",
  "pitchHistogram": { "C": 12, "D": 8, "E": 15, "F": 6, "G": 10, "A": 9, "B": 4 },
  "summary": "150 字以内的整体分析摘要，面向学琴的学生，语言亲切专业",
  "background": "作品背景、作曲家背景、创作年代与所属时期的简要介绍（200 字左右，若能识别作品）"
}

pitchHistogram 的 key 必须是 C D E F G A B 七个音名（可按实际调性合并升降音到就近音名），value 为该音名出现的次数统计。
所有数值必须来自你对乐谱内容的真实分析，禁止编造占位数据。若图片无法辨认乐谱内容，返回 {"error": "无法识别乐谱内容，请上传更清晰的图片或使用 MusicXML/ABC 文本"}。`

// POST /api/analysis — 乐谱结构化分析
// body: { mode: 'image', image: dataURI } | { mode: 'text', notation: string }
export async function POST(request: Request) {
  const body = await request.json()
  const client = new LLMClient(new Config())

  let userMessage: Message
  if (body?.mode === 'image' && typeof body.image === 'string' && body.image.startsWith('data:image')) {
    userMessage = {
      role: 'user',
      content: [
        { type: 'text', text: '请分析这张乐谱图片。' },
        { type: 'image_url', image_url: { url: body.image, detail: 'high' } },
      ],
    }
  } else if (body?.mode === 'text' && typeof body.notation === 'string' && body.notation.trim()) {
    const notation = body.notation.slice(0, 20000)
    userMessage = {
      role: 'user',
      content: `请分析以下结构化记谱（MusicXML 或 ABC 格式）：\n\n${notation}`,
    }
  } else {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 })
  }

  try {
    const res = await client.invoke(
      [
        { role: 'system', content: ANALYSIS_PROMPT },
        userMessage,
      ],
      { temperature: 0.2, maxTokens: 4096 }
    )
    const text = res.content.trim()
    // 提取 JSON（兼容模型包裹 markdown 代码块的情况）
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: '解析结果格式异常，请重试' }, { status: 502 })
    }
    const parsed = JSON.parse(match[0])
    if (parsed.error) return NextResponse.json(parsed, { status: 422 })
    return NextResponse.json(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '分析服务异常'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
