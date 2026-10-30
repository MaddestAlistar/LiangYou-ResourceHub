# 影视情报中心 · 视频站内播放维护记录

更新：2026-10-30

## 已验证与展示规则

- 用户已在 iPhone 端实测：Bilibili、YouTube、Niconico、AcFun 的影视资讯相关视频可以从网站的弹窗直接播放（2026-10-30 的站内实测反馈）。不要把这些卡片重新改成跳转外部网页。
- Dailymotion：账号专属 Player ID 为 `x1oa0y`，已通过 GitHub Actions 向官方申请 OAuth 令牌、创建并验证播放器；官方嵌入地址和 GitHub Pages 配置在自动检查中通过 HTTP 200，但不能由此保证每条视频都不受平台、地区或作者的播放限制。
- 页面 `#media → 资讯推荐 → 预告片/相关视频` 仍用同一个视频卡片网格，每部作品上限 **20 条**。只采用通过作品 TMDB ID、年份、原始视频链接验证的对应内容，不伪造视频、封面、播放量或点赞数。
- 当该作品有验证过且支持站内播放的 **Bilibili、AcFun** 时，优先取两平台各自最优的一条作为前两张卡片，顺序为 B站 → AcFun；不存在则自动跳过。后续各可用平台保留代表视频，剩余名额继续按预告片优先和互动数据排序。YouTube、KinoCheck（实际 YouTube）、Niconico、Dailymotion 不能被挤出前 20 条。
- 封面左下角不再加“站内播放 / Play here”视觉提示。保留中间播放按钮、平台名称、标题和底下的“原站观看”作为备用入口。只有无法站内播放的卡片才在封面提示“原站观看”，避免误导。
- 不更改网站视觉风格、移动端双列布局或字幕、评分、新闻功能。新增功能需要能正常通过项目回归测试。

## 播放路径（避免回退）

1. **Bilibili**：使用核对 BV ID 的官方 `player.bilibili.com/player.html` iframe，在本站已有模态框内展示。封面优先使用本地真实视频封面、失败再使用官方验证图片/有标记的作品海报。
2. **AcFun**：本站点击后经已有 Worker `/api/video/acfun/{id}` 请求临时公开 HLS 地址；在弹窗用原生 HTML5 video（Safari）或 hls.js（其他支持的浏览器）播放。失败可重新获取流或手动打开原站。不要改回提示升级播放内核的旧版官方 iframe。
3. **Niconico**：`embed.nicovideo.jp/watch/{id}` 站内 iframe；仅验证真实视频 ID 与平台原网址。
4. **YouTube**：`youtube.com/embed/{id}` 或 `youtube-nocookie.com/embed/{id}`，保留已有手动切换和限制视频回退；KinoCheck 的影片预告片按来源归类但实际使用 YouTube 嵌入。
5. **Dailymotion**：公开网页只读 `data/media-video-player-config.json` 的 `dailymotionPlayerId`。使用 `https://geo.dailymotion.com/player/x1oa0y.html?video={videoId}` 作为官方站内 iframe。发布者、账号、地区限制导致的失败可以用原站链接兜底，不宣称所有视频都可播。

## Dailymotion 安全自动化（已打通）

- 凭据保存在 GitHub Actions Secrets：`DAILYMOTION_PRIVATE_API_KEY` 和 `DAILYMOTION_PRIVATE_API_SECRET`；绝不可放入仓库、Pages、浏览器脚本或日志。
- 工作流 `.github/workflows/provision-dailymotion-player.yml` 调用 `scripts/manage_dailymotion_player.py`，使用 Dailymotion OAuth2 `client_credentials` 取得短期访问令牌。
- 使用授权的 Profile 和 `player.manage` 权限查询/复用站点播放器；没有才创建，核验成功后**只提交公开 Player ID**。重复运行应复用而非重建。
- `.github/workflows/check-dailymotion-player.yml` 验证 Pages 配置和官方嵌入端点。不要把 HTTP 200 与用户实际视频播放混为一谈。
- 有播放器配置后自动显示站内播放卡片，不能因为短时网络失败删掉已验证的平台数据。
- 回归：`node --test scripts/test_media_domestic_trailers.mjs scripts/test_media_player.mjs`。对 B站、AcFun 前排规则、无提示标签、20 条上限、无视频时的安全退化进行验证。

这份记录作为后续维护的固定工作流程。新增平台或改动播放器时优先核对实际页面播放结果，并继续保留官网原始链接供用户选择。
