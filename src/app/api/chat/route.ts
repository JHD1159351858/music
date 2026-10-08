import { LLMClient, Config, type Message } from 'coder-coding-dev-sdk'

// POST /api/chat — SSE 流式对话
// body: { messages: {role, content}[], context?: { kind: 'score' | 'composer', name?: string, analysis?: object } }
export async function POST(request: Request) {
  const body = await request.json()
  const { messages, context } = body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    context?: { kind: 'score' | 'composer'; name?: string; analysis?: Record<string, unknown> }
  }
  if (!messages?.length) {
    return new Response(JSON.stringify({ error: '缺少消息' }), { status: 400 })
  }

  let systemPrompt =
    '你是「知音」音乐教学智能体的讲解助手，面向学琴的学生。语言亲切、专业、有据可查。不确定或超出已收录范围的内容，要明确告诉学生「这部分超出已收录范围」，禁止编造史实。回答用中文，适度分段，单次不超过 300 字。'

  if (context?.kind === 'score' && context.analysis) {
    systemPrompt += `\n\n当前学生正在分析一份乐谱，结构化分析结果如下：\n${JSON.stringify(context.analysis)}\n请围绕这份谱展开讲解与答疑，优先介绍作品背景、作曲家背景、创作年代与所属时期。`
  } else if (context?.kind === 'composer' && context.name) {
    systemPrompt += `\n\n当前学生正在音乐史地图上了解作曲家「${context.name}」。请输出该作曲家的生平、创作经历与作品信息、代表作及代表作的时代背景。若为中文语境下的中国作曲家，请着重讲清其创作与时代、民族的关系；若为欧洲作曲家，可对照同时期中国音乐的发展状况。内容必须有据可查。`
  }

  const llmMessages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const client = new LLMClient(new Config())
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of client.stream(llmMessages, { temperature: 0.7, maxTokens: 2048 })) {
          if (chunk.content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        const msg = e instanceof Error ? e.message : '对话服务异常'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
