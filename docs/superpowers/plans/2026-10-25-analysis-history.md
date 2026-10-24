# 乐谱分析历史记录 Implementation Plan

**Goal:** 每次成功分析自动保存完整结果，登录用户可以分页查看本人历史、重新打开图表并继续提问；验证后将本次乐谱分析代码推送 GitHub。

**Architecture:** 通过现有 `createSupabaseServer()` 统一入口使用独立 `score_analyses` 表，本地SQLite自动建表，远程Drizzle新增0009迁移。保存分析结果快照，不保存上传原文；打开历史时重新签发对话凭据。

**Scope:** 既有图片、文本、MusicXML输入及宽松解析方式保留。历史仅本人可读，不增加教师跨用户浏览、删除或导出。地图未提交改动保留本地，不纳入此次提交。

## Tasks and acceptance

- [x] 存储与迁移：新表保存用户归属、曲名/作者/来源/音符数等摘要和完整JSON；旧SQLite可自动升级；远端schema、迁移、RLS及Drizzle元数据一致。
- [x] 后端：成功的 `/api/analysis` 写入记录并返回 `historyId`；GET `/api/analysis/history?page=1` 每页20条摘要；GET `/api/analysis/history/[id]` 只读取本人结果，重新签发music21凭据，读取不新建记录。
- [x] 前端：历史列表展示文件名、曲名、时间、来源及音符数；新分析后更新；刷新后仍可打开旧结果；空列表、加载、错误重试和更多记录状态清楚。
- [x] 回归：真实XML解析自动保存；ABC保存；跨用户与匿名拒绝；列表不带大JSON；详情恢复且凭据可用于聊天；分页和服务重启持久化。
- [x] 构建交付：相关单元/API测试、定向ESLint、生产构建、浏览器验收通过；更新说明并重启5000服务。
- Git交付方式：检查当前远端分支与待提交文件，排除数据、环境密钥、虚拟环境及临时输出；只提交本次乐谱分析文件，正常推送origin/main并验证远端SHA。

## File ownership

- Backend worker: `src/lib/local-database.ts`, `src/db/schema.ts`, `drizzle/`, `src/lib/analysis-history*.ts`, `src/app/api/analysis/history/**`。
- UI worker: `src/app/(app)/analysis/page.tsx`, `src/components/analysis/history-panel.tsx`。
- Browser worker: `scripts/testing/music21-smoke.mjs`, `docs/verification/analysis-history-2026-10-25/`。
- Root: POST分析集成、结果类型、文档、整体回归及Git提交/推送。
