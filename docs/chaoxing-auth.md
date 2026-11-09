# 超星登录接入

## 登录姓名与本人资料

登录验票后同步认证中心的 `displayName`（真实姓名）、`name`（学工号／登录名）、`orgName`（学校），以及 UID、FID 和认证角色。账号区优先显示真实姓名；点击「我的资料」查看本人认证资料、课堂身份、当前班级和最后同步时间。认证中心若把学工号或 UID 回退为 `displayName`，不会将其标为真实姓名。未返回的字段显示「未提供」，不编造院系、头像或联系方式。

白名单认证资料独立保存在本地 SQLite 的 `auth_identities` 表；远端使用 `drizzle/0005_auth_identities.sql`，仅后端 service_role 可读写。`/api/auth/session` 只按签名会话读取本人资料，使用 private/no-store。昵称和教师维护的班级保持原值，社区及花名册接口不会带出私有认证资料。教师回调只同步认证资料，安全密码通过前不建立教师会话、不更改课堂角色，票据与 Cookie 中不携带姓名学工号。

已有会话若尚无认证资料，需要退出后重新通过超星登录同步；刷新页面可读取已保存资料，不会重复使用一次性票据。此改动不需要重新部署认证中心。当前可获取字段以认证中心实际返回为准。

真实登录应设置 `.env.local` 中 `ZHIYIN_STUDENT_TEST_MODE=false` 并重启。登录框默认选中「学生」，仍需通过超星认证；点击教师入口则选中教师并保留额外安全密码验证。

仅本机临时测试时可设置 `ZHIYIN_STUDENT_TEST_MODE=true`，页面与 API 会自动使用「抚琴听雨」学生账号。此开关仅对本地数据模式生效，不能作为真实超星登录验收。

首页默认未登录。原浏览器 `zhiyin_user` 昵称身份会被清除，不能作为访问受保护页面或 API 的凭据。访客可直接浏览 `/practice`、`/analysis`、`/tasks`、`/community`、`/map`、`/stats` 六个模块根页面，复用学生端背景，展示公开资料、功能示例和登录入口，不加载真实课堂数据。仅放行这些根路径的 GET/HEAD；练习会话、任务详情、教师页面及业务 API 仍要求登录。使用个人课堂功能、AI 助教或学生／教师入口时，先通过超星统一认证；教师还需输入独立的安全密码。

## 当前接入方式

接入已部署认证中心 `https://sdtqvk3ybm.coze.site`，不在知音中收集超星账号密码，也无需在知音重复配置超星应用 AppID、应用 Secret 或超星侧回调域名：

1. 浏览器跳转认证中心 `/api/auth/chaoxing?return_to=...`。
2. 认证中心成功后回到知音 `/api/auth/callback?state=...&ticket=...`。
3. 知音服务端先核对签名上下文与 state，再向认证中心 `/api/sso/verify` 发送 `{ticket,secret}`。
4. 学生建立 HttpOnly 会话；教师只有通过超星身份和额外安全密码两步后才建立会话。未完成教师密码校验的票据不能访问业务 API。

## 需要配置

在项目根目录 `.env.local` 填写：

```dotenv
CHAOXING_SSO_BASE_URL=https://sdtqvk3ybm.coze.site
CHAOXING_SSO_SHARED_SECRET=与认证中心SSO_SHARED_SECRET一致的值
ZHIYIN_TEACHER_SECURITY_PASSWORD=123456
```

本机教师安全密码按要求设置为 `123456`，保存在 `.env.local` 的 `ZHIYIN_TEACHER_SECURITY_PASSWORD`。密码仅由后端校验，不在登录页面预填；可在本机文件中修改，修改后重启服务。

认证中心也需将当前知音站点的 origin（本机为 `http://localhost:5000`）登记到 `SSO_ALLOWED_RETURN_ORIGINS` 或认证中心的回调白名单。外部认证中心必须使用 HTTPS；仅本机 localhost／127.0.0.1 可使用 HTTP 做开发联调。

部署到 HTTPS 反向代理后，在知音运行环境设置 `ZHIYIN_PUBLIC_ORIGIN=https://实际知音域名`。来源校验、Cookie Secure 标记、超星回调与服务端跳转均使用此固定地址，避免使用容器内部地址；不会无条件信任 Host 或转发头。变量未设置时保留本机行为；设置了空值、路径、账号密码或查询参数会明确报配置错误。此地址还须与认证中心回跳白名单一致。Docker 部署包通过根目录 `.env` 中的同名变量传入，不将业务密钥写入镜像。

当前认证中心地址及验票共享密钥已配置到本机 `.env.local`，服务已重启生效。共享密钥仅用于服务端验票，不写入文档或前端，不提交 Git。认证中心负责现有学校 FID 白名单，知音不再重复维护一份学校白名单。

知音回跳白名单按 origin 登记，不含路径：

- 本地 origin：`http://localhost:5000`。
- 本地登录回调：`http://localhost:5000/api/auth/callback`，每次登录会动态附带 `state`。
- 线上 origin：当前项目未记录已部署的知音地址，需提供实际访问地址后登记；不能使用认证中心域名代替知音域名。

认证中心签票时须保留 `return_to` 中原有的 `state` 参数，再追加有效期 120 秒的一次性 `ticket`。服务端验票使用共享密钥，额外返回的姓名等资料不写入知音 profiles。

2026 年 10 月 16 日已完成本地真实学生登录：从知音学生入口发起，认证中心复用浏览器中已有的有效登录状态，携一次性票据回跳知音，由知音服务端验票并建立学生会话，最终进入 `/practice`。刷新后会话保持，浏览器访问 `/api/auth/session` 确认为已登录学生，未处于教师待验证状态。

本次复查已确认认证中心完整保留 `http://localhost:5000` 的回调与 `state`，先前本地回跳被过滤的问题已解除。随后按教师密码授权规则完成真实浏览器验证：同一超星账号选择教师入口后显示密码表单，错误密码被拒绝，正确密码进入 `/tasks`，服务端会话确认为 teacher 且不再处于待验证状态。未保存或输出认证 Cookie、票据或解码内容。本次复用了已有认证中心会话，首次扫码／账号密码输入、正式线上域名及学习通内置浏览器仍需单独验收。

以下仅供未来自行部署认证中心时使用，不属于本次接入现有认证中心的前置要求。自行部署时，另需在认证中心项目中配置：

- 超星应用的 `CHAOXING_APPID`、`CHAOXING_SECRET`、`CHAOXING_REDIRECT_URI`，以及学校机构 FID。应用回调应指向认证中心 `/api/auth/callback/chaoxing`，并在超星侧登记。
- Supabase 的 URL、anon key 和 `COZE_SUPABASE_SERVICE_ROLE_KEY`。当前认证中心真实回调和跨应用票据均依赖 Supabase，不能省略 service-role 凭据。
- `SSO_SHARED_SECRET`，与知音的 `CHAOXING_SSO_SHARED_SECRET` 保持一致；`SSO_ALLOWED_RETURN_ORIGINS` 允许知音站点 origin。
- 确认数据库已有可供服务端读写的 `sso_tickets` 表。本机认证中心仓库假定该表在线上已存在，未包含完整建表迁移，新部署前需补齐。

上述配置属于认证中心项目，超星应用 Secret 不应放入知音前端。若在本机启动两个项目，需分配不同端口；两份项目默认均使用 5000。

## 教师身份与昵称

超星认证验证账号真实性，知音课堂身份以登录时选择的入口为准：学生入口通过认证后建立学生会话；教师入口通过认证后仅建立教师待验证状态，输入正确教师安全密码才建立教师会话。认证中心返回学生角色时，也可经教师入口与正确安全密码进入教师端；仅选择教师或修改请求中的用户 ID 不能获得教师权限。

业务用户按超星 fid＋uid 稳定映射；沿用已有昵称，新用户使用匿名化昵称，不将超星返回的真实姓名、学工号写入 profiles。原业务数据保留，不把新账号自动绑定到旧演示昵称。

同一超星账号切换学生／教师入口时更新该账号的课堂角色，保留用户 ID、昵称、班级及既有数据；其他标签页的旧角色会话会失效，需要重新进入。

## 会话与验证

会话采用 HttpOnly、SameSite=Lax 的签名 Cookie，HTTPS 下使用 Secure；签名最长有效 8 小时，Cookie 不设持久记住登录时间。签名密钥默认持久保存在 `data/.auth-secret`，备份时随 data 目录一起保存；也可配置至少 32 字符的 `ZHIYIN_SESSION_SECRET`。浏览器 localStorage 不保存登录凭据。

教师密码连续错误 5 次后，该身份在当前服务进程内限制 10 分钟。退出登录会清理会话和待验证 Cookie。所有写请求检查 Origin；仅靠 user_id 参数或前端状态无法访问业务数据。

```powershell
pnpm exec tsx --test src/lib/auth-session.test.ts src/lib/chaoxing-auth.test.ts src/lib/teaching-auth.test.ts
pnpm exec next build
node scripts/testing/chaoxing-auth-smoke.mjs
```

协议测试和 HTTP smoke 使用独立临时数据与本机认证测试服务，不代表真实超星平台已经联通；真实联调需要上面的访问地址、共享密钥、白名单及本人账号授权。
