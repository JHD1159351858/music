# 首页动效分层素材

## 追加调整：乐谱解析区浮动，机器人静止

当前背景使用 `public/home/music-journey-motion-v2.webp`（1672 × 941，537508 bytes）。内置 `image_gen` 从上一版背景中去除乐谱解析面板，前端复用原画徽章并单独渲染可浮动的解析入口；机器人取消自身动画并抵消父层指针视差。其余动效保留。

本次原始输出：`C:/Users/Administrator/.codex/generated_images/01a13da6-6e36-7652-9819-4b7173a6e191/exec-b95e7406-fb31-4709-a535-ab4771279ab5.png`。仅转为 WebP quality 98。

本次实际提示词：

Use case: precise-object-edit. Image 1 is the edit target, an existing website background. Remove ONLY the small 乐谱解析区 panel at left-middle, including its circular open-book icon, the label 乐谱解析区, the subtitle 调性和声·结构分析, the dark backing, dotted bottom border and gold dot. This panel is within x=22% to 40.5%, y=30.5% to 42% of the whole image. Fill this small area with seamlessly continuous forest, piano island greenery and golden clouds matching its surroundings. Preserve absolutely everything else: same full 16:9 framing, identical logo and main heading, architecture, trees, winding river, musical notes, stage ring, papers, metronome, colors, lighting and textures. Do not add any replacement sign, text, icon or object. Do not redesign or shift the scene. This is only removal of that one panel for a separate animated HTML layer.

以下为上一版素材记录。

日期：2026-10-16。使用内置 `image_gen` 工具编辑本项目原画，没有使用 CLI 或视频生成服务。网站动效由原生 CSS、SVG 和指针视差实现，没有自动播放音频。

- 输入：`public/home/music-journey-clean.webp`，3840 × 2160。
- 背景：`public/home/music-journey-motion.webp`，1672 × 941，597560 bytes。内置工具生成 PNG 后转 WebP quality 98，保留生成的实际像素尺寸，没有将放大尺寸描述为真实高清细节。
- 机器人：`public/home/journey-robot.png`，852 × 1049，1227259 bytes。内置工具输出透明 PNG 后，仅裁去透明边距；保留 alpha。
- 六个徽章通过 SVG viewBox 使用原画，文字改为独立 HTML；原图保留。
- 内置工具输出原文件：`C:/Users/Administrator/.codex/generated_images/01a13da6-6e36-7652-9819-4b7173a6e191/exec-523a40a1-fd75-4650-831a-455d227e444b.png` 与 `exec-26b97b23-24a3-4b13-8382-65dedb0b0b36.png`。

## 背景提示词（实际使用）

Use case: precise-object-edit. Asset type: clean 16:9 background plate for layering an animated website. Image 1 is the edit target. Preserve this exact black and gold fantasy music hall, architecture, clouds, floating piano-key island, golden winding musical river, trees, stage, small flying birds, foreground music paper and metronome, lighting, camera framing and every edge. Keep the logo 知音 and main title 钢琴知音之旅 and subtitle at upper left unchanged. Keep the 乐谱解析区 panel at left-middle unchanged. REMOVE ONLY these foreground UI objects and all their attached labels: the top-middle 音乐史地图区 portrait and panel; right-middle 练琴社区 icon and panel; lower-left 曲库知识图谱 round book medallion and its two text lines; lower left-center 练习任务引擎 hourglass medallion and text; lower right-center 练习档案 folder medallion and text; lower-right 测评评阅 clipboard medallion and text; central small robot and the AI助教 label and subtitle; bottom center golden 开始弹奏吧 button. Inpaint each removed item with the naturally continuous existing clouds, forest, stage or floor behind it. Keep central luminous floor ring. Do not insert replacement icons, buttons, signs, extra text or people. Do not redesign the scene. Keep full original landscape 16:9 composition, no cropping. Render sharply at highest available resolution.

## 机器人提示词（实际使用）

Use case: background-extraction. Image 1 is the edit target/reference for the robot. Extract ONLY the small full body robot standing in the lower center of this image as a clean transparent PNG asset for a website. Preserve the exact silver helmet, black rounded face with two glowing golden eyes, gold headphones, small black tuxedo, gold bowtie, short black legs and shoes, both hands and its same pose, materials, lighting and proportions. Robot centered, full body visible with a little transparent margin. Remove ALL background, floor, ring, shadows beyond feet, text, labels, landscape, cards and other objects. Actual transparent alpha background, no checkerboard. Do not redesign the robot, do not add anything, no text.
