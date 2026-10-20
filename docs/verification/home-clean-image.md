# 首页底图旧导航清理

- 使用内置 imagegen 工具编辑，非 CLI。
- 输入：`public/home/music-journey-hd.webp`，3840 × 2160。
- 生图原始结果：`C:/Users/Administrator/.codex/generated_images/01a13da6-6e36-7652-9819-4b7173a6e191/exec-fdf6311a-a9b1-4fd4-8303-67c160871cb1.png`。
- 项目最终素材：`public/home/music-journey-clean.webp`，3840 × 2160，无损 WebP，6,683,034 bytes。
- 仅将生图结果的右上角修补区域合回高清原图：left=2840, top=16, width=960, height=240，边缘羽化 32 px。解码像素校验确认区域外改动像素数为 0，保留其余中文文字、图标和高清细节。

## 生图提示词

Edit the provided image as the target asset. Use case: precise object removal/inpainting for an existing Chinese piano teaching website. Remove ONLY the two small gold-outlined oval navigation buttons at the very top right: the one reading 曲库选谱 (approximately x=76.2%-85.5%, y=3.3%-9.0%) and the one reading 音乐史地图 (approximately x=86.7%-97.1%, y=3.3%-9.0%). Remove the entire two button shapes, outlines, dark fill, text, and any shadows. Reconstruct that small area as seamless dark atmospheric clouds and concert-hall architectural background continuous with its surroundings. Do not add replacement labels or UI there. Preserve EVERYTHING ELSE exactly: all other Chinese text, all icons/badges, the logo 知音 top left, large title 钢琴知音之旅 and subtitle, the Beethoven music history map badge, analysis/community labels, floating piano-key island, golden music path, AI robot, lower task/archive/review badges, and the complete bottom 开始弹奏吧！ button. No cropping, no zoom, no reframing, no moving objects, no color or lighting change, no redesign, no new text, no watermark. Maintain original 16:9 composition and crisp fine detail. Output at 3840x2160 if supported. This is a surgical removal of only the top-right two old navigation pills.
