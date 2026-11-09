# 琥珀音乐厅实施与验收记录

最终验收日期：2026-10-30（北京时间）。设计参考见 `docs/design/2026-10-27-amber-concert-hall/README.md`；视觉逐项对照见 `design-qa.md`。

## 已实施范围

- 学生：首页、曲谱库与封面选中大图、个人琴谱、待练列表、任务与提交、乐谱分析、社区、音乐史地图、练琴数据、沉浸练习、档案和课程助手。
- 教师：概览、琴谱管理、任务、提交评阅、学生班级、学期目标、课程知识、社区、练习记录及地图。琴谱/任务/评阅/知识/社区使用真实页内编辑或详情面板。
- 独立曲目封面与谱面分开上传、保存和授权读取；新增本地新旧库迁移、远程 Drizzle 0010 迁移和权限测试。旧曲目使用按曲名等信息稳定匹配的主题图，教师或本人可逐曲替换；不是为所有历史曲目逐首创作成品封面。
- 不改变真实身份与可见范围，不将设计稿的虚构统计、评价或史实写入业务数据。

## 验收环境及边界

浏览器操作使用 Codex 内置浏览器。隔离入口 5011/5013 经 5012 的实际生产构建、签名会话、权限、CSRF 与本地 SQLite/API 执行。fixture 使用本次专属临时数据库/上传目录；不写入当前项目的课堂数据，不在浏览器写测试会话 cookie。

初始种子为 1 班级、1 学期、3 曲目、8 练习记录、3 任务、3 提交及合成课程/社区资料；最后一次计时存档验证另增 1 条记录。谱图为自制合成五线谱，不是曲名对应作品原谱。MusicXML 历史使用真实本地 music21 解析，得到 20 个音符、2 声部、4 小节、3 休止符。回听使用自制 2 秒静音 WAV；不代表学生演奏。对话 SSE 明确标注合成界面验收示例，未调用真实模型；未验证真实超星登录或麦克风采集。

## 已通过检查

| 检查 | 实际结果 |
| --- | --- |
| 单元/权限/迁移回归 | 178/178，通过，见 `unit-tests.log` |
| 静态检查 | 全部变更 TS/TSX 的 ESLint 及最后局部修复 ESLint 退出 0；见 `eslint.log`、`final-lint.log`、`practice-lint.log`、`assistant-lint.log` |
| 生产构建 | 最终 `pnpm exec next build` 退出 0，含 TypeScript 检查，见 `build.log` |
| 曲目封面 | 教师上传、保存、替换、刷新后仍为受控 `/api/files/` 图片；学生曲库选中后同步显示。图片实际加载成功，谱页仍保留 |
| 评阅切换 | 已评阅记录为 88 分；切至待评阅记录，输入恢复为空，未沿用前人的评分/评语 |
| 评阅保存 | 隔离记录保存 86 分及明确合成评语，学生任务详情成功回显 |
| 地图 | 桌面及手机放大到 125%，全图复位为 100%，人物卡片和教师添加入口保留；本次未改坐标计算 |
| 助手 | 展开、课程资料、收起与暂停动效可用；暂停后 aria-pressed=true |
| 回听 | 2 秒合成静音 sample 实际播放到 currentTime=2、duration=2、readyState=4、error=null；筛选排除后教师播放器清空 |
| 沉浸练习 | 谱面放大到 125% 并复位；暂停/继续可用；约 60 秒非录音练习结束后进入档案，提示已存档 |
| 遮挡修复 | 桌面练习页机器人 y=792/h=96，结束保存 y=935/h=44，矩形不相交；实点保存成功 |
| 手机布局 | 390×844 检查学生主要模块和教师表单；教师评阅由原 566px 溢出修至 375px 内容宽度；多列表保留内部横向滚动 |
| 练习曲名 | 手机抬头曲名宽 315px，完整显示“月光奏鸣曲”，控件另行排列 |
| 本机预览 | 当前真实配置启动 `http://localhost:5000/`，首页载入完成，学生入口已启用 |

## 截图与复现

`final-*` 是实施后的截图；未带 final 的是首轮对照材料。桌面主要为 1440×1000，部分任务详情是 1280×720；手机为 390×844。部分长表/表单需原生纵向滚动。原生窗口尺寸与模拟页面尺寸不同步时使用同一 IAB 标签的 CDP 截取明确矩形，临时尺寸已恢复。

- 学生：`final-student-home-desktop.png`、`final-student-library-desktop.png`、`final-student-analysis-desktop.png`、`final-student-tasks-desktop.png`、`final-student-task-detail-desktop.png`、`final-student-practice-desktop.png`、`final-student-practice-mobile.png`、`final-student-practice-saved.png`、`final-student-archive-desktop.png`。
- 教师：`final-teacher-overview-desktop.png`、`final-teacher-scores-desktop.png`、`final-teacher-tasks-desktop.png`、`final-teacher-reviews-desktop.png`、`final-teacher-classes-desktop.png`、`final-teacher-semesters-desktop.png`、`final-teacher-knowledge-desktop.png`、`final-teacher-community-desktop.png`、`final-teacher-records-desktop.png`、`final-teacher-map-desktop.png`。
- `final-*-mobile.png` 为对应手机图，`mobile-width-checks.json` 为 DOM 尺寸记录；`compare-*`/`qa-compare-*` 为设计与真实截图的诊断对照，不是产品资源。
- `preview-5000-home.png` 为真实项目未登录首页；展示完整曲库的隔离截图含“验收同学”等明确测试资料。

再次复现：完成生产构建后运行 `pnpm exec tsx scripts/testing/concert-hall-fixture.mjs`，仅在本机打开打印出的 5011/5013 入口。每次 ID 不同，以 `/__fixture/ready` 为准。正常 Ctrl+C 关闭本脚本所有代理与自行启动的 Next 子进程，并核验目录后清理本次临时数据。

本轮最后一次隔离服务已正常输出“isolated temporary data cleaned”；随后检查仅 5000 监听，5011/5012/5013 均已关闭。真实项目预览保留在 5000。本轮未推送 GitHub、未部署、未在远程数据库应用迁移。