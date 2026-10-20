# 2026-10-16 需求改造验证

## 结果

- `pnpm run validate`：TypeScript 与 ESLint 均通过，退出码0。
- `pnpm exec next build`：生产构建通过，退出码0，包含新增 `/knowledge` 页面与知识接口。
- `rg --files src -g '*.test.ts'` 收集后使用 `pnpm exec tsx --test`：82项通过、0失败。完整输出见 `unit-tests.txt`。
- `node scripts/testing/local-persistence-smoke.mjs`：35项通过、0失败。使用真实生产 Next、临时 SQLite 和实际文件，进程3796→37768重启后记录、评分和既有文件签名仍可使用；见 `http-tests.txt`。
- `node scripts/testing/requirements-browser-smoke.mjs`：9组 Chromium 浏览器流程通过，未捕获页面错误；见 `results.json`。

## 浏览器实际验证内容

教师通过页面新增课程知识；学生解析 ABC，获得8个实际音符、音高折线与音名统计，页面不含节奏密度，未收录背景及 SSE 超范围提示正确显示。

浏览器使用自动化麦克风设备真实运行 MediaRecorder，检查放大、浏览器全屏、暂停期间计时不变、继续与结束保存，数据库产生含录音fileId和一次暂停的实际记录。自动化麦克风不是学生真人演奏质量验收。

学生通过页面选择教师发送私密留言，其他学生公开和私信列表均不可读；教师回复并标记回课，下载完整TXT包含问题及刚刚保存的回复。验收发现导出在回复保存中可能读旧快照，已将导出按钮在保存／刷新时禁用，并在最终构建复测通过。

学生个人统计仅含本人记录。教师收取学生通过页面独立上传的有效1秒WAV与H.264/AAC MP4，两种媒体在浏览器均加载成功（readyState=4、duration=1）并实际执行play，随后评分91和评语回传学生。

知识、地图、社区、统计、评阅页面已截图检查。390×844知识页面无横向页面溢出。地图人物和来源的完整性另有自动化测试；不把本次有限页面检查称为全部设备／全部交互验收。

## 模型与平台边界

对已录入的“连奏练习”发起真实 `/api/chat` 请求：命中课程条目并输出来源，但生成服务立即返回“智能讲解服务暂时不可用”。SSE错误能显示给用户；**外部生成式讲解未真实接通，图片模型识别也未通过真实验收**。需要补齐有效模型配置并联调，不能以本地解析或空知识回退代替模型成功。

本次使用隔离签名会话模拟学生和教师。真实学习通SSO、课程内链接、学习通消息、内置浏览器PDF／麦克风／视频兼容，以及真实远端数据库和对象存储均未在本次验收。

远端新迁移 `0002_requirements_completion.sql`、`0003_backend_service_role.sql` 已生成；配置测试验证匿名凭据不会降级为远端业务访问，schema与授权语句已检查，但未连接远端执行迁移。配置说明见 `docs/teaching-setup.md`。

## 复现

先构建，再运行HTTP回归。浏览器脚本需要可用的Playwright和Chromium，可通过 `PLAYWRIGHT_MODULE_PATH` 指向已安装的Playwright目录。`ZHIYIN_TEST_WAV`、`ZHIYIN_TEST_MP4` 传入有效音视频素材路径后包含播放评阅流程；`RUN_LIVE_LLM=1` 另外记录外部模型调用结果，模型失败与本地功能检查分别报告。

测试均使用临时数据目录，结束后停止测试服务并清理自己的目录，不清空正式 `data/`。

正式本地应用已按原配置重启至 `http://localhost:5000`。保留现有 `ZHIYIN_STUDENT_TEST_MODE=true` 便于本地试用；正式教学部署必须关闭该测试模式并配置真实认证。未替用户改写现有认证配置。

## 截图

- `teacher-knowledge.png`：教师课程知识维护。
- `student-analysis.png`：真实ABC指标与未收录导读。
- `teacher-community.png`：私密留言、回复与回课重点。
- `student-stats.png`：学生个人数据。
- `teacher-review.png`：音视频材料与评分。
- `student-map.png`：中国音乐史地图。
- `student-knowledge-mobile.png`：手机知识页。
