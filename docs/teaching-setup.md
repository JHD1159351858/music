# 知音教学功能配置与验收

当前本机已启用 SQLite 与本地文件持久化，无需先配置以下云服务。角色入口、目录和启动方式见 [本地存储说明](local-persistence.md)。以下环境变量与迁移步骤适用于选择 Supabase 远程模式时。

## 接入服务

将根目录 `.env.example` 复制为 `.env.local`，填入本项目的服务配置，完成后重启应用。

- `CODER_SUPABASE_URL`、`CODER_SUPABASE_TENANT_ID`：业务数据访问所用 Supabase / PolarDB 地址与租户配置。
- `CODER_SUPABASE_SERVICE_ROLE_KEY`：仅后端使用的 `service_role` / secret key。不可放进前端代码、公开环境变量或浏览器请求。旧的 `CODER_SUPABASE_ANON_KEY` 不再用于业务请求；远端仅配置匿名密钥时返回 HTTP 503，不会降级为匿名访问或另建本地数据。
- `DATABASE_URL`：执行迁移时使用的 PostgreSQL 连接串，需连接同一个业务库。
- `CODER_CODING_API_KEY`、`CODER_CODING_BASE_URL`：平台对象存储配置。
- `CODER_CODING_MODEL_API_KEY`、`CODER_CODING_MODEL_BASE_URL`：原有 AI 分析、助教所用模型服务；按实际平台配置填写。

密钥仅放服务端环境文件。用户通过超星认证建立签名会话，角色与数据归属由后端 API 校验；远端数据库不接受浏览器持匿名密钥直接读写业务表。

## 数据库迁移

```powershell
pnpm exec drizzle-kit migrate
```

空库会依次执行 `0000_orange_wolfpack.sql` 至 `0003_backend_service_role.sql`；已经记录初始迁移的库只执行新增迁移。若原库通过手动 SQL 建表，先核对其迁移记录，避免重复执行初始建表。升级前先备份数据库并停止应用，对同一业务库应用完全部待执行迁移，再使用新的后端服务密钥重启。

本次迁移新增琴谱属性、教师统一曲风、待练列表、学生班级、学期目标、任务、稳定选曲分配和提交评阅。旧琴谱默认未发布，需教师检查国内／国外分类、确认曲风并补齐文件后发布。没有预置未经教师确认的曲风选项。学期实际时长从原始练习记录按起止日期汇总，使用北京时间的练习日期。

`0002_requirements_completion.sql` 增加班级发布范围、教师私信、独立回课标记和课程知识库；`0003_backend_service_role.sql` 将全部 14 张业务表的策略目标收紧为 `service_role`，撤销 `anon`、`authenticated`、`PUBLIC` 的直接读写授权，并显式授予后端角色 CRUD 权限。两份迁移必须一起应用，旧的开放策略不适合承载真实练习、私信或评分数据。迁移不删除业务记录。

新迁移与 `drizzle/meta/0003_snapshot.json`、迁移日志已同步，后续可以继续使用 Drizzle 生成迁移。本次仅生成及检查迁移，未连接真实远端执行；远端部署仍需核验服务密钥权限、迁移执行结果及匿名直连被拒绝，再开展真实教学数据验收。

## 本机启动

Windows 可直接运行：

```powershell
pnpm exec next dev -p 5000
```

原 `pnpm dev` / `pnpm build` / `pnpm start` 继续保留项目的 Bash 启动链路。Windows 本机生产验证可使用 `pnpm exec next build`，再运行 `pnpm exec next start -p 5000`。

## 操作路径

1. 首页点击功能入口，选择教师身份。在曲库「曲风管理」录入任课教师确认的统一曲风。
2. 单份或批量选择图片／PDF，逐份填写曲名、作曲家、分类、难度、曲风和可选提醒；保存为未发布，检查后发布。支持编辑属性、替换文件、查看和删除。
3. 在「练习任务与评阅」维护学生班级，设置学期目标；创建任务并选择班级／学生／全体、指定／随机曲目和材料必交／选交要求。
4. 切换学生，曲库只展示已发布琴谱；加入「我要练」并一键进入练习。完整谱面可纵向滚动、缩放及全屏，工具栏显示实时计时和录音状态。
5. 从任务开始练习并结束保存，返回任务关联记录和录音，也可单独上传录音／视频、读取 TXT／Markdown 练习记录或填写文字。提交后查看本人材料。
6. 教师查看已交／未交名单、播放音视频和查看记录，提交 0–100 分及评语；学生重新进入同一任务可见结果。任务关闭／截止后不可继续提交。

单文件上限 100MB。音视频能否播放还取决于上传文件编码及浏览器支持。保存失败保留当前页面录音供重试；已经提交引用的练习记录禁止直接删除。琴谱与练习记录使用固定 UUID，避免响应丢失后重试重复入库。

## 验证命令

```powershell
pnpm exec tsx --test src/lib/teaching-validation.test.ts src/lib/teaching-files.test.ts src/components/practice/practice-save.test.ts
pnpm exec tsc --noEmit
pnpm exec next build
```

独立的离线接口验收服务完全不接入生产代码。在三个 PowerShell 终端中依次运行：

```powershell
# 终端一：仅测试数据，进程退出后清空。
node scripts/testing/mock-teaching-service.mjs

# 终端二：先停止其他 next dev 实例，避免 .next/dev 锁冲突。
$env:CODER_SUPABASE_URL='http://127.0.0.1:54329'
$env:CODER_SUPABASE_SERVICE_ROLE_KEY='offline-test-service-role'
$env:CODER_SUPABASE_TENANT_ID='offline-test'
$env:ZHIYIN_STORAGE_MODE='supabase'
pnpm exec next dev -p 5001

# 终端三：只重置明确标为 test_fixture 的本地服务。
node scripts/testing/teaching-api-smoke.mjs
```

测试环境提供 1 位教师、2 位不同班级学生、已发布／未发布琴谱。仅测试曲风和图片不代表正式课程数据。HTTP 验收覆盖真实 Next 路由与 Supabase 客户端，对象存储续签使用真实 SDK 对接本地夹具；不等于真实 Supabase、云存储、麦克风录制和外部 AI 服务验收。

结束离线验收后关闭测试进程，使用未设置测试环境变量的新终端启动真实预览。
