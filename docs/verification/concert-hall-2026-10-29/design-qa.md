# 设计对照与视觉验收

2026-10-30。对照已批准“琥珀音乐厅”系列，采用内置浏览器实际页面截图。检查的是配色、资产使用、布局层级和操作可达性，不将设计稿中的虚构数量、姓名或作品描述作为业务数据。页面是现有真实业务的适配实现，不宣称逐像素复刻。

## 对照结果

| 页面与参考 | 实际证据 | 观察与结论 |
| --- | --- | --- |
| 学生曲库 · 01 左 | `final-student-library-desktop.png`、`compare-student-library.png` | 深色侧栏、琥珀色主操作、选中曲目大图与三列封面关系成立。封面、曲名、作者及开始链接随选中同步；真实筛选和原有操作保留。对照图为较早轮次，最终业务上传另有实测 |
| 教师琴谱 · 01 右 | `final-teacher-scores-desktop.png`、`final-teacher-cover-saved-desktop.png` | 暖白正文、真实曲库列表与独立编辑栏并列；封面与谱页分开维护，保存栏可见。实际字段较多，正文有内部滚动。已验证封面上传/替换/刷新及学生同步 |
| 教师任务 · 07 左 | `final-teacher-tasks-desktop.png` | 列表与真实编辑表单并列。原先只有详情+弹窗的差距已修；去掉表格被右栏高度拉伸的空白，缩紧表格后桌面操作不挤出。日期在较窄编辑栏纵向排列，保留原时间与材料要求 |
| 教师评阅 · 07 右 | `final-teacher-reviews-desktop.png`、`final-teacher-reviews-mobile.png` | 提交选择与材料/0–100评分/评语同时可见。沿用跨任务表格，未照抄设计稿的虚构头像列表。切换已评阅88分至待评阅后评分为空，保存86分后学生可见。手机外层溢出已由566px修至375px，表格内部横向滚动保留 |
| 学期目标 · 08 右 | `final-teacher-semesters-desktop.png`、`final-teacher-semesters-mobile.png` | 学期记录、学生进度和底部真实编辑条与参考的上下关系一致。目标、进度来自真实统计；未增加设计稿中的新业务规则 |
| 学生数据 · 05 右 | `student-stats-desktop.png`、`compare-student-stats.png`、`final-student-stats-mobile.png` | 四项真实统计、两张图表、深色卡片与金色数据层级成立。图表数据不同于设计稿为正常现象，保留原统计口径 |
| 学生首页 · 02 左 | `final-student-home-desktop.png`、`final-student-home-mobile.png` | 独立曲目图、琴房环境图、练习入口和六个模块入口形成统一层级。已修入口箭头堆叠与琴房主视觉被封面遮住的问题 |
| 学生分析 · 02 右 | `final-student-analysis-desktop.png` | 分析历史、实际结构化指标、右侧讲解形成工作区。实际MusicXML结果为20音符；示例对话明确标记合成内容，未假称真实模型输出 |
| 任务与提交 · 03-v2 | `final-student-tasks-desktop.png`、`final-student-task-detail-desktop.png` | 目标栏已改紧凑全宽，任务封面与三步流程保留。详情封面在最新复拍前确认complete=true且naturalWidth>0，修正了旧截图过早捕捉的空框证据；最新详情图为1280×720 |
| 社区、知识与助手 · 04-v2/09 | `student-community-desktop.png`、`final-teacher-community-desktop.png`、`final-teacher-knowledge-desktop.png`、`final-student-assistant-mobile.png` | 教师原有编辑/回复面板已嵌入，私密与公开视图保留。助手资料列表、收起和暂停动效可用；手机表单纵向排列 |
| 地图与教师记录 · 05/10 | `student-map-person-desktop.png`、`final-teacher-map-desktop.png`、`final-teacher-records-desktop.png` | 全图、缩放与人物卡片保留，教师维护入口保留；未改地图定位算法。记录回听使用真实签名音频地址，筛选排除所选项后播放器清空 |
| 练习与档案 · 06-v2 | `final-student-practice-desktop.png`、`final-student-practice-mobile.png`、`final-student-practice-saved.png`、`final-student-archive-desktop.png` | 真实谱面为主体，封面用于抬头与档案标识。手机曲名已完整显示。桌面悬浮助手原先遮挡结束保存，已抬高：机器人y792/h96，保存y935/h44，实际矩形不相交；点击保存成功存档60秒非录音练习 |

## 修复闭环

- 高优先级：练习页助手遮挡保存 → 按沉浸路径抬高 → 矩形与实际点击/存档复验通过。
- 中优先级：教师评阅手机外层溢出 → 单列minmax及子项min-width修正 → 390宽下内容375，表格仅内部滚动。
- 中优先级：教师页面缺少真实并列面板、概览标题占高、任务表格空白、编辑保存栏下沉、手机练习曲名被压缩 → 已实施并重新截图。
- 数据安全：未将稿中虚构成绩/统计写入当前课堂。隔离API验证与真实登录/模型服务分别记录，封面权限与本地新旧库回归测试通过。

本轮已检查页面没有尚未处理的P0/P1/P2视觉或操作阻断。保留的适配差异：实际表格列与表单字段多于设计稿，多列表手机内部横向滚动、长表单纵向滚动；部分图表/正文密度和列表形式与生成图不同；旧曲目可先用三类主题图，独立上传后逐曲替换。以上不视为逐像素一致或全部历史曲目已人工补图。

## 证据边界

- 所有带“验收同学/界面验收”的截图使用专属临时数据。合成谱图并非原作乐谱，静音WAV并非学生演奏；实际播放器已读到duration=2/currentTime=2/readyState=4/error=null。
- 真实麦克风采集、超星SSO及实时模型本轮未验证；没有为验收授予麦克风权限或将合成模型结果冒称真实调用。
- 最终生产构建与TypeScript成功，178项回归通过，变更文件ESLint通过；详细记录见 `README.md` 和日志。
- 隔离服务正常关闭并清理其临时数据；只有当前真实项目5000预览继续运行。没有执行GitHub推送、部署或远程数据库迁移。