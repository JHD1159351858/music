# Music21 乐谱分析 Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent parser and UI tasks; keep API integration in the current session.

**Goal:** 学生在乐谱分析页上传 MusicXML 文件，由真实 music21 解析，展示谱面指标并基于服务端签名结果继续提问。

**Architecture:** 保留现有 Next.js API 和鉴权，在服务端通过无 shell 的受限 Python 子进程调用 music21。文件仅作本次分析，不写入谱库；解析输出经 Zod 校验，返回与用户绑定的分析签名，聊天只把验签成功的结果作为音乐数据来源。

**Tech Stack:** Next.js / TypeScript / pnpm，Python 3.11+，music21 10.5.1，defusedxml。

**Completed:** 2026-10-24。Python25项、TypeScript/API/导航18项、浏览器12项验证通过，最终生产构建与定向ESLint通过。详见 `docs/verification/music21-2026-10-24/verification.md`。

## Global Constraints

- 保留当前未提交的地图改动，不改数据库、谱库字段或现有 API 路径。
- 文件入口接受 `.musicxml`、`.mxl`、MusicXML 内容的 `.xml`，单个文件与解压内容各不超过 8 MiB；图片和 ABC 原入口保留。
- 不访问文件内外部资源，不展开 XML 实体，不加载 pickle，不把用户输入作为本地路径、URL或 shell 指令。
- music21 计算结果与调性/和声推断分开标注；作品背景继续查课程资料。
- 不安装全局 Python 包，使用项目 `.venv-music21`；运行时缺失明确返回 503。

### Task 1: Python parser

Files: `scripts/music21/analyze.py`, `scripts/music21/test_analyze.py`, `scripts/music21/requirements.txt`, `public/examples/music21-demo.musicxml`.

- [x] 先以已知多声部乐谱、和弦、休止符与 MXL 编写失败测试。
- [x] 以 stdin 接收 `{name, contentBase64}`，验证 MusicXML/MXL，标准输出单行 JSON；错误返回 `{error, code}`。
- [x] 输出兼容 AnalysisResult 的基本字段，并在 `music21` 记录版本、小节/声部/休止数量、拍号、速度、标注调性、推断调性、音符事件和和声事件。限制 10,000 个有音高音符、5,000 个和声事件。
- [x] 验证恶意实体、非谱 XML、ZIP 路径、膨胀内容与不支持格式被拒绝，运行真实 music21 单元测试。

### Task 2: TypeScript API and verified chat

Files: `src/lib/music21-analysis.ts`, `src/lib/music21-analysis.test.ts`, `src/lib/score-analysis-receipt.ts`, corresponding tests, `/api/analysis`, `/api/chat`, `src/lib/score-analysis.ts`.

- [x] 先写真实 Python 桥接、multipart 文件鉴权、错误响应和聊天签名回归测试并观察失败。
- [x] 使用 `execFile` 调用项目 venv 的 Python（支持 `ZHIYIN_MUSIC21_PYTHON`），60 秒超时、输出限制、最多两个并发解析，不用 shell。
- [x] `/api/analysis` 增加 multipart 文件分支，复用原课程资料补全；原 JSON 接口继续可用。
- [x] 对完整分析结果生成绑定当前用户、两小时有效的 HMAC 摘要凭据；不新增数据库结构。
- [x] `/api/chat` 验签后允许仅依谱面数据提问，按问题中的小节筛选数据，拒绝伪造、跨用户和过期分析；历史背景仍需课程来源。
- [x] 测试命令：`pnpm exec tsx --test src/lib/music21-analysis.test.ts src/lib/score-analysis-receipt.test.ts src/lib/music21-api.test.ts src/lib/music21-chat.test.ts src/lib/analysis-grounding.test.ts src/lib/chat-grounding.test.ts src/lib/map-chat-grounding.test.ts`。

### Task 3: Upload and results UI

Files: `src/app/(app)/analysis/page.tsx`, `src/app/(app)/layout.tsx`, `src/proxy.ts`; `src/components/chat-panel.tsx` only if required.

- [x] 默认入口改为 MusicXML 上传，使用 multipart 向同一接口提交；保留原图片/文本标签页。
- [x] 解除原 `/analysis` 无条件跳转，保留登录校验；学生课堂导航增加“乐谱分析”。
- [x] 显示文件名、来源、基础指标、拍号/声部/小节、算法推断调性与和声表，并提供可下载的自编样谱。
- [x] 将完整结果及凭据传给现有 ChatPanel，开场先解释谱面数据，再根据课程资料说明背景。
- [x] 浏览器验证：有效 XML、MXL 上传结果，错误扩展名/损坏文件反馈，新文件重新分析，已验签结果的 SSE 追问，窄屏无横向溢出。

### Task 4: Delivery verification

Files: `.gitignore`, `.env.example`, `scripts/build.sh`, `docs/music21-analysis.md`, verification artifacts.

- [x] 记录本机与 Linux Python 安装命令、venv 路径、部署构建开关、解析限制与错误排查。
- [x] 执行 Python/TypeScript 相关测试、定向 ESLint、TypeScript 检查和 Next.js build。
- [x] 使用真实 music21 + 本地模型夹具验证端到端；明确夹具并非线上大模型服务验收。
- [x] 一次独立代码审查，修复实质问题，记录最终结果。
