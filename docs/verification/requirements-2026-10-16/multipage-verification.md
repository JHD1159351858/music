# 多页琴谱验证

- 测试命令：`pnpm exec tsx --test src/app/api/scores/route.test.ts src/lib/score-pages.test.ts src/lib/local-database.test.ts src/lib/teaching-files.test.ts src/lib/teaching-validation.test.ts src/lib/score-upload-receipt.test.ts src/lib/score-remote-files.test.ts src/components/practice/score-upload.test.ts`，41/41 通过，日志见 `multipage-tests.txt`。
- 修改文件定向 ESLint 与 `pnpm exec next build` 通过。最终构建后已重启 5000 本地服务，再次在浏览器打开已保存琴谱并切换第 2 / 2 页，图片正常显示。
- 覆盖：页面顺序与首图同步、所有页的签名续签、个人/班级权限、共享引用清理、旧数据库加列兼容、旧单图/PDF、最多 50 页、上传中断重试、POST 幂等冲突、远端凭证所有权与篡改/过期拒绝、凭证不落库。
- 浏览器真实链路：学生端多选两张 SVG，只生成一份琴谱；调整页序并保存，刷新后顺序保留；编辑追加第三页、移除旧页、保存后仍为两页。预览正确加载横版 1600×1100 与竖版 1200×1600，整页适配可视画布。
- 沉浸练习：翻页时缩放从 125% 复位到 100%，计时从 00:00:12 连续到 00:00:13；专注模式可翻页、拖动和缩放，Esc 返回。未授予麦克风权限，未保存本次临时练习记录，录音实际采集不属于本次验收证据。
- 保留样例：`[测试]多页琴谱翻页练习`，id `06fc6224-9eb5-4934-bb75-7fd3154e9f27`，当前学生“个人琴谱”和“我要练”可查看；最终页序为 `multipage-01.svg`、`multipage-02.svg`。谱图为功能测试素材，不代表真实教学曲谱。
- 本地迁移前备份：`data/backups/before-multipage-2026-10-16T08-07-20-080Z.sqlite`。本地 SQLite 自动迁移；远端提供 `drizzle/0004_score_pages.sql`，未连接真实远端执行迁移，远端鉴权逻辑通过独立测试验证。
- 截图：`multipage-upload.png`、`multipage-practice.png`、`multipage-preview.png`。
