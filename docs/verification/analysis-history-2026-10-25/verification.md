# 乐谱分析历史验证（2026-10-25）

新增独立 `score_analyses` 表保存登录用户的完整分析结果快照；列表每页20条摘要，详情按本人归属读取并重新签发music21对话凭据。保留宽松的music21直接解析方式。

## 结果

- 5项历史后端测试通过；连同本地数据库、既有查询/关系及需求数据库回归共18项通过。
- 另5项分析集成、课程背景、聊天、凭据和导航回归通过；真实XML成功后返回可验证签名的 `historyId`，写入本人历史。
- 定向ESLint和TypeScript检查通过，最终Next.js生产构建通过。
- 扩展浏览器验收18项通过：自动保存、历史面板更新、刷新后GET恢复同一快照、新凭据继续SSE、无重复保存、跨用户隔离、ABC自动保存、20+3分页、移动页面，以及同一隔离SQLite目录下真实服务重启后数据仍在。
- 独立代码审查未发现阻断问题。默认5000本地服务已重启，首页HTTP200。

## 数据与外部服务边界

浏览器与API验收使用临时SQLite、合成学生会话和本地SSE模型夹具，未修改现有教学数据。未执行真实远端数据库迁移，也未将本地模型夹具当成线上模型或超星认证联调证明。部署Supabase模式前须应用 `0009_analysis_history.sql`。

以前未保存的分析不会自动生成历史；部署后新的成功分析会自动保存。历史不保留上传原文或图片Base64。原上传入口、图片/ABC文本模式及地图既有本地改动保留。

## 重现

```powershell
pnpm exec tsx --test src/lib/analysis-history.test.ts src/lib/local-database.test.ts src/lib/requirements-database.test.ts
pnpm exec tsx --test src/lib/music21-api.test.ts src/lib/analysis-grounding.test.ts src/lib/music21-chat.test.ts src/lib/score-analysis-receipt.test.ts src/lib/music21-navigation.test.ts
pnpm exec next build
node scripts/testing/music21-smoke.mjs
```

浏览器脚本需要安装Playwright并设置 `PLAYWRIGHT_MODULE_PATH`（或使用可解析的playwright包）。运行后在本目录产生JSON、检查日志和两张截图；这些本机生成物不随代码提交。
