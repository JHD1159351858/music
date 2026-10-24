# MusicXML 文件分析与 music21 部署

学生入口：登录知音 → 乐谱分析 → MusicXML 文件 → 选择文件 → 开始解析。页面提供项目编写的四小节示例下载；这是演示材料，不是学生数据。

## 输入与输出

- 接受 `.musicxml`、`.mxl`、内容为 MusicXML 的 `.xml`，当前读取制谱软件常用的 `score-partwise` 结构，不依赖浏览器填写的 MIME。每次一个非空文件，上传与解压后的 XML 均不超过 8 MiB。
- 文件格式可读取后直接交给 music21，不再预先校验音符、声部、调号或完整度。无固定音高的打击乐单独提示数量，不阻止其他声部的分析；和声计算失败时保留其余结果。
- 图片/PDF不能通过这个入口识谱。原图片模型、MusicXML/ABC 基础文本解析入口保留并单独标注来源。
- music21 10.5.1 读取实际音高、时值、起拍位置、小节、声部、休止符、拍号和速度标记，计算音符数、音域与音名统计。
- 谱面声明调性只来自明确标注；推断调性单独显示。相关系数不是正确率。和声切片、和弦名称和罗马数字是算法候选，需结合音乐语境复核。
- 和弦中每个有音高的成员计一个音符，休止符单独计数。按谱面记录计数，不展开反复，延音线的谱面片段按记录保留。音名直方图按字母 C–B 归类，升降记号的精确值在音符表中查看。
- 多声部按实际起拍位置排序；小节数取声部中的最大值，不能理解为所有声部小节相加。未标注字段保留空值。
- 单谱最多 10,000 个有音高音符、5,000 个和声切片；每个 Node 进程最多两个解析子进程，60 秒超时。大谱请按乐章或段落导出。
- 单个和声切片最多 128 个音，解析结果不超过 8 MiB；声部/声线名称过长时分别截取 80/40 个字符并提示，不改变音符数据。

分析完成后自动保存结果快照到本人“历史分析记录”，重新打开可恢复指标、图表和音乐数据上下文；上传原文不加入教师谱库，也不保留。原谱库的图片/PDF发布与权限规则不受影响。

## 历史分析记录

历史列表显示曲名、文件名、分析时间、解析来源和音符数，每页20条，可继续加载。点击“打开”恢复保存时的完整结果，无须重新上传或重新运行music21；music21对话凭据会重新签发，原凭据过期不影响历史查看。读取历史不会增加一条新的记录。

历史按当前登录用户隔离，教师账号也只能查看自己产生的分析。本地模式保存于原SQLite数据库，刷新或重启服务后仍保留；远端模式需要部署新增的 `0009_analysis_history` 迁移，并使用原有后端service_role入口。

启用前未保存的分析不会自动补回，重新上传分析一次即可进入历史。图片分析只保存指标及文件名，不保存图片Base64；历史结果中的作品背景是当时引用课程资料的快照，聊天仍按当前课程资料检索。

## Windows 本机安装

项目的 JS 包管理继续使用 pnpm。Python 包安装在独立虚拟环境，不进入全局 Python：

```powershell
py -3.12 -m venv .venv-music21
.\.venv-music21\Scripts\python.exe -m pip install -r scripts/music21/requirements.txt
.\.venv-music21\Scripts\python.exe -c "import music21; print(music21.__version__)"
pnpm exec next dev -p 5000
```

也可用 `uv venv --python 3.12 .venv-music21`，再用 `uv pip install --python .venv-music21/Scripts/python.exe -r scripts/music21/requirements.txt` 安装。支持 Python 3.11 或更新版本。

服务端优先使用 `ZHIYIN_MUSIC21_PYTHON` 指定的解释器，其次使用项目 `.venv-music21`，最后尝试系统 `python`（Windows）或 `python3`（Linux）。需要覆盖时在服务端环境设置真实路径，不放进公开前端变量。

## Linux / 平台部署

运行镜像需要 Node/pnpm 与 Python >=3.11，并具备 venv、pip 和依赖下载能力。在平台构建环境设置 `ZHIYIN_INSTALL_MUSIC21=true` 后，原 `scripts/build.sh` 会在项目 `.venv-music21` 安装固定的 Python 依赖；构建和启动使用同一个项目目录。

如果构建/运行分属不同镜像，必须把 `.venv-music21`、`scripts/music21/analyze.py` 及 Python 运行环境带到运行镜像，或在运行镜像重新安装依赖。不能只复制 `dist/` 或 `.next/`。venv 不能从 Windows 拷贝到 Linux 使用；部署机器要重新创建。

手动准备 Linux 环境的等价命令：

```bash
python3 -m venv .venv-music21
.venv-music21/bin/python -m pip install -r scripts/music21/requirements.txt
.venv-music21/bin/python -c "import music21; print(music21.__version__)"
pnpm build
pnpm start
```

这里只做数据分析，不调用 MuseScore、LilyPond 或桌面程序，不需要安装它们。本机通过不代表平台运行镜像已具备 Python，部署后必须再上传示例验收。

## API 与对话

`POST /api/analysis` 支持 `multipart/form-data`，唯一文件字段为 `file`。需本人已登录的 HttpOnly 会话。成功响应为现有 AnalysisResult 加 `fileName`、`music21`、`sources`、`historyId` 和 `analysisReceipt`；原 JSON 图片/文本协议保留。图片JSON可附 `fileName`。

`GET /api/analysis/history?page=1` 返回 `{items, page, hasMore}`，列表只含摘要；`GET /api/analysis/history/[id]` 返回本人的完整分析结果及重新签发的对话凭据。两者均禁止缓存，不接受客户端指定其他人的身份。

客户端将完整返回对象作为 `context.analysis` 发往原 `POST /api/chat`。凭据绑定当前用户及完整结果，两小时有效；后端验签后才允许把谱面解析结果作为音乐数据来源。凭据过期时重新打开历史即可续用；篡改或跨用户结果会被拒绝。凭据不能证明文件内作者/标题真实，元数据仅作为引用文本。

对话会按“第2小节”或“第2至4小节”选取音符和和声；单次最多向模型传 60 个音符、40 个和声切片，并附实际范围及总数，避免把局部预览描述为整曲。作品背景、创作年代和音乐史仍需课程知识库来源。外部模型不可用时保留已计算的页面指标，并提示讲解服务不可用。

## 错误排查

| 状态 | 含义 | 处理 |
|---|---|---|
| 401 | 无有效登录会话 | 重新登录 |
| 413 | 文件、解压内容或音符规模超限 | 分段导出 |
| 415 | 扩展名不支持 | 从制谱软件导出 MusicXML，不要只改后缀 |
| 422 | 损坏/不完整谱、非 MusicXML 或分析签名无效 | 重新导出/上传；凭据过期则重新分析 |
| 429 | 当前两路解析均忙 | 等待后重试 |
| 503 | Python、music21 或 defusedxml 不可用 | 检查解释器路径和虚拟环境依赖 |
| 504 | 解析超过 60 秒 | 缩短谱面再分析 |

XML 外部资源与实体不会被读取，不支持 pickle、任意路径或 URL 输入。MXL只读取声明的谱面 XML，不解压到用户文件系统。

## 验证

```powershell
.\.venv-music21\Scripts\python.exe -m unittest discover -s scripts/music21 -p test_analyze.py -v
pnpm exec tsx --test src/lib/music21-analysis.test.ts src/lib/score-analysis-receipt.test.ts src/lib/music21-api.test.ts src/lib/music21-chat.test.ts src/lib/music21-navigation.test.ts src/lib/analysis-grounding.test.ts src/lib/chat-grounding.test.ts src/lib/map-chat-grounding.test.ts
pnpm exec tsc --noEmit
pnpm exec next build
```

端到端脚本：`node scripts/testing/music21-smoke.mjs`，需要 `PLAYWRIGHT_MODULE_PATH` 指向已安装的 Playwright。脚本使用真实 music21、本地隔离数据库和本地 SSE 模型夹具，不能作为线上大模型或真实超星认证的联调证明。
