# 本机持久化存储与角色入口

当前项目已启用本地存储模式，无需配置云数据库或对象存储即可保存琴谱、练习、任务、提交和评分。学生／教师登录已改为超星认证，需另配置认证中心，见 `docs/chaoxing-auth.md`。

## 从哪里进入

- 首页顶部「学生入口」：通过超星认证后进入曲库与练习；直达链接 `http://localhost:5000/?role=student`。
- 首页顶部「教师入口」：通过超星认证及独立安全密码后进入任务管理；直达链接 `http://localhost:5000/?role=teacher`。
- 手机顶部同样显示两个入口。已有身份也可点击另一角色入口切换。

原有演示昵称和业务数据保留，但不再作为可选择的登录身份。新登录账号按超星唯一身份绑定，曲风、琴谱、练习任务与成绩由教师实际录入。

## 数据保存在哪里

项目根目录 `.env.local` 已设置 `ZHIYIN_STORAGE_MODE=local`。默认数据目录为项目下 `data/`：

- `zhiyin.sqlite`：SQLite 数据库，含琴谱、班级归属、待练列表、练习记录、任务、材料引用和评阅。
- `uploads/`：实际上传的琴谱、录音与视频，以及文件元数据。
- `.file-url-secret`：自动生成并持久保留的文件签名密钥，使重启前获得的有效文件链接重启后仍能读取。

刷新、切换角色及重启服务不会清空数据。首次查询自动建表和初始化身份，本地模式不需要运行 PostgreSQL 的 Drizzle 迁移。

文件支持图片／PDF／音频／视频，单个最多 100MB；媒体读取支持 HTTP Range，方便播放与拖动进度。文件 URL 有签名和有效期，重新读取业务数据时会按 fileId 刷新链接。

`data/` 已加入 `.gitignore`。备份与迁移请停止应用后复制整个 `data/` 目录，数据库、上传文件和签名密钥应一起保留。也可在启动前通过 `ZHIYIN_DATA_DIR` 指定其他持久目录。

## 启动

本机已用 Node.js 22.21.1 验证，使用内置 `node:sqlite`，无需新增数据库依赖。

```powershell
pnpm exec next build
pnpm exec next start -p 5000
```

开发时可运行 `pnpm exec next dev -p 5000`。修改 `.env.local` 后需重启。

浏览器使用 `http://localhost:5000/`；`0.0.0.0` 是监听地址，本机 5000／5003 端口会自动转到对应的 localhost 地址。

重新构建前先停止使用本项目 `.next` 的所有生产服务，构建完成后再一起启动。运行旧服务时覆盖 `.next` 会使旧页面引用已失效的 CSS／JS，出现白屏、图片丢失或客户端异常；不能只重启其中一个端口。

## 可选远程模式

需要继续使用远程 Supabase 时，将 `ZHIYIN_STORAGE_MODE` 设为 `supabase`，填写 `CODER_SUPABASE_URL`、`CODER_SUPABASE_TENANT_ID`、仅后端使用的 `CODER_SUPABASE_SERVICE_ROLE_KEY`（`service_role` / secret key）及云存储配置，并应用 `0002_requirements_completion.sql`、`0003_backend_service_role.sql`；完整升级步骤见 `docs/teaching-setup.md`。新迁移将全部 14 张业务表限定为后端角色访问，不允许匿名客户端直接读写。

显式 `local` 及无云配置时的本地默认行为不变。未显式选择模式时，完整的新服务配置或旧匿名配置会进入远程模式；仅有旧匿名密钥的远端配置返回 HTTP 503，不会继续匿名访问或自动切换到本地数据库。服务密钥不得进入浏览器。本次未连接真实远端执行迁移或联调，远端配置与数据库权限需在部署环境验证。

本地数据库不负责替代 AI 模型服务；原有助教和乐谱分析仍使用各自的模型配置。

## 验证

```powershell
pnpm exec tsx --test src/lib/local-database.test.ts src/lib/local-files.test.ts src/lib/storage-mode.test.ts
node scripts/testing/local-persistence-smoke.mjs
```

单元测试和 HTTP 验证均使用独立临时数据目录，不清理或写入正式 `data/`。HTTP 脚本使用实际 Next 服务与 SQLite，测试上传文件和材料评分后停止并重启服务，再验证数据与原签名链接仍可访问。
