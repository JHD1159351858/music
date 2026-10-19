# 项目上下文

「知音」教学智能体：面向音乐教学场景的全栈应用（学生/教师双角色，接入超星统一认证，教师额外安全密码校验；配置见 `docs/chaoxing-auth.md`）。

## 五大板块与代码位置
- 练琴记录：`src/app/(app)/practice/`（列表页 + `session/[id]/` 沉浸练习页：计时 + MediaRecorder 录音 + 结束存档）
- 乐谱分析：`src/app/(app)/analysis/` + `src/app/api/analysis/route.ts`（LLM 视觉识别图片 / MusicXML·ABC 文本 → 结构化 JSON 指标）
- 练琴社区：`src/app/(app)/community/` + `/api/posts`、`/api/comments`、`/api/posts/[id]/like`
- 音乐史地图：`src/app/(app)/map/` + `src/lib/composers.ts`（中西作曲家史实数据，头像在 `public/avatars/`）
- 数据分析：`src/app/(app)/stats/` + `/api/stats`（教师端聚合统计）

## 关键约定
- 身份：超星认证中心的一次性票据由服务端验证，再建立 HttpOnly 签名会话；教师须额外安全密码校验。`src/lib/user-context.tsx` 仅读取服务端会话，不信任 localStorage 或请求 user_id 作为身份来源。登录账号区优先显示真实姓名，已验票的姓名、学工号、学校等白名单资料存于仅服务端可访问的 `auth_identities`；本人通过 `/api/auth/session` 读取。社区仍使用 `profiles.nickname`，不公开私有认证资料。
- 数据：本机默认 SQLite（`data/zhiyin.sqlite`，`src/lib/local-database.ts` 自动建库），可设 `ZHIYIN_DATA_DIR` 指定持久目录；业务 CRUD 一律走 `/api/*` + `createSupabaseServer()` 统一数据入口。`ZHIYIN_STORAGE_MODE=supabase` 可使用原 Supabase／PolarDB 配置；远程 schema 在 `src/db/schema.ts`，迁移在 `drizzle/`。
- LLM：`coder-coding-dev-sdk` LLMClient，对话统一走 `/api/chat`（SSE 流式），前端用 `src/components/chat-panel.tsx`（Reader 逐块渲染）
- 文件：录音／谱图／视频上传走 `/api/upload`。本地模式落盘 `data/uploads`，使用持久签名密钥与 `/api/files/[id]` 读取；远程模式使用 StorageClient。均存 fileId。
- 设计：深色音乐厅风格，规则见 `DESIGN.md`；只用语义主题变量，禁硬编码颜色

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
