# 教师管理后台

教师完成超星身份认证与教师安全密码验证后，默认进入 `/teacher`。学生继续使用原页面。未登录访问后台转入教师登录；学生访问后台跳回学生曲库，新增教师接口对学生返回 403。

| 地址 | 用途 |
| --- | --- |
| `/teacher` | 学期教学概览 |
| `/teacher/scores` | 本人琴谱、批量上传、属性与文件维护、发布 |
| `/teacher/tasks`、`/teacher/tasks/[id]` | 任务管理、学生提交与未交清单 |
| `/teacher/reviews` | 跨任务提交汇总、按需打开材料、评分评语 |
| `/teacher/students` | 创建班级、班级 ID／入班码、学生花名册与归属维护 |
| `/teacher/semesters` | 学期日期、时长目标、完成进度 |
| `/teacher/knowledge` | 本人课程知识条目维护 |
| `/teacher/community` | 帖子、求助、私密留言、回课标记和导出 |
| `/teacher/records` | 学生有效练习、暂停次数与录音 |

旧教师链接 `/practice`、`/tasks`、`/knowledge`、`/community`、`/stats` 按会话角色导向对应后台；`/practice?tab=history` 导向练习记录。沉浸练习页保持原流程；音乐史地图保留在侧栏的教学工具区。学生导航与页面不变。

## 统计口径

`GET /api/teacher/overview` 支持 `period=semester|week|month`、`semester_id`、`class_name`。默认选择教师本人当前有效学期，多项有效时选择起始日期最近的一项；没有有效学期显示设置提示，也可选择历史学期。

- 日期以北京时间计算。本周从周一、本月从一日统计至当天；学期视图采用所选学期完整起止日期。
- 学生人数与练习数据沿用系统学生范围；按当前班级归属筛选。有效时长直接累计已保存的 `duration_seconds`，不重复扣减暂停时间。
- 任务按截止日归入周期。提交率按当前任务受众的学生／任务应交人次计算；移出任务范围的历史提交保留材料，但不计入当前受众的提交率。
- 时长达标按 `completed_seconds >= target_minutes * 60` 判断。周／月视图中的达标率仍使用所选学期的完整时长，不以四舍五入百分比判定。
- 零分是有效成绩；是否已评阅以 `reviewed_at` 判断。无分母时界面显示“—”。

`GET /api/teacher/submissions` 支持任务、班级、评阅状态、昵称／任务搜索，以及 `page`、`page_size`。默认每页 20 条，最大 100 条，评阅后页码越界会自动归一。列表只返回材料类型等摘要；打开评阅才通过现有任务详情接口读取材料。

接口与后台布局均校验服务端签名会话；布局也核对数据库角色。琴谱修改、任务、知识和目标仍由原 API 校验教师本人归属，未增加管理员角色。花名册和练习统计继续沿用系统范围。

## 班级创建与学生加入

教师在「学生班级 → 我的班级」输入名称创建班级，系统生成稳定的班级 ID 和 8 位入班码，均支持复制。教师只能查询本人创建班级的代码；花名册仍可查看系统学生并手动调整班级。学生登录后打开「我的资料」，输入教师提供的入班码即可加入，资料和任务范围随即按新归属刷新。

每名学生当前属于一个班级，加入新班级会替换原归属。为兼容现有任务与琴谱的 `target_classes`，班级名称全系统唯一，本轮不提供改名或删除。归属继续保存在 `profiles.class_name`；创建同名的既有班级会计入原有学生，不改写认证资料。创建后即使尚无学生，也能在任务和琴谱的指定班级范围中选中。

`GET /api/classes`、`POST /api/classes { name }` 仅教师可用；`POST /api/classes/join { code }` 仅学生可用。身份和归属均取自服务端签名会话；学生无法列举入班码，错误代码不改变归属。本地 SQLite 自动创建 `classes` 表；远端使用 `drizzle/0006_classes.sql`，仅后端 `service_role` 可读取和创建，部署远端前需应用迁移。

## 界面与验证

深色侧栏、浅色内容区和金色操作，表格默认每页 20 条。后台弹窗、下拉框与提示消息随主题切换，返回公共首页恢复黑金主题。窄屏侧栏折叠为抽屉，表格在容器内横向滚动。

定向自动验证：

```powershell
pnpm exec tsx --test src/lib/teacher-overview.test.ts src/lib/task-counts.test.ts src/lib/teaching-auth.test.ts src/lib/auth-session.test.ts
pnpm exec tsx --test src/lib/classes.test.ts src/lib/local-database.test.ts
node scripts/testing/teacher-admin-smoke.mjs
```

HTTP smoke 使用临时 SQLite、独立端口和合成签名会话，不修改业务数据。`--keep-service` 可为受控浏览器验收临时保留服务，退出后清理测试数据。此验证不代表重新验收真实超星外部登录服务。

练习记录列表复用现有接口的最近 500 条上限，页面明确提示；教学概览的聚合查询会分页读取全部统计元数据。上线构建前需停止共用 `.next` 的服务，构建后统一启动 5000、5003，避免旧进程引用失效资源。
