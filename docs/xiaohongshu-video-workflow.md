# 良友资源中心 · 小红书原创视频站内播放工作流程

> 记录日期：2026-10-30。适用于本人拥有发布与使用权的小红书视频。用于复用已验证的方法，不保证小红书 CDN 政策不变。

## 当前站点位置

- 页面：https://maddestalistar.github.io/LiangYou-ResourceHub/#liangyou-video
- 插入位置：良友科技圈新闻之后、首页“好资源，一处找到”之前
- 视频展示：`index.html` 中的 `#liangyou-video`，一条视频一张 `.ly-video-panel`。
- 按钮交互：`ly-video.js` 维护视频卡片 ID 到独立播放页的白名单映射。统一使用同一个 `#ly-video-dialog` 弹窗，点击后才动态建立 iframe。
- 样式：视频样式合并到 `tech-news.css`，与新闻板块共享一个 CSS 请求，包含手机端响应式布局。
- 语言：`site-i18n.js` 增加新视频标题和描述的英文文本。
- 视频页分别独立：`xhs-player.html`、`xhs-player-n90.html`。

## 已验证作品

| 视频 | 小红书分享链接 | 笔记 ID | 独立播放页 |
| --- | --- | --- | --- |
| 如何在 CarPlay 上看影视｜途播 | https://xhslink.cn/o/3eUyzuksTQC | 6a990b54000000002601637c | xhs-player.html |
| 小米澎程 N90 在 CarPlay 部分 APP 实际演示 | https://xhslink.cn/o/7X4yBrtmKpu | 6aa4eb4d000000002502c505 | xhs-player-n90.html |

2026-10-29 已得到第一条视频作者在真实网站中**能够实际播放**的明确确认。第二条 2026-10-30 已通过 GitHub Actions 媒体网络检查，尚未收到访客对新卡片的实际播放确认。

## 新视频接入顺序

1. **取得原帖的官方分享链接**：只接受作者分享链接，完整保留短链和必要的分享参数；确认视频为作者本人作品或取得使用授权。
2. **独立测试 RedNote Downloader**：在 GitHub Actions 临时工作流启动 `icekale/rednote-downloader`，调用本地 `POST /api/resolve`，发送 `{"input":"小红书分享链接","download":false}`。读取返回的 `note.title`、`note.noteId`、`note.media`、封面地址。注意此项目 JSON 返回结构可能升级。
3. **必要时交叉核验 XHS-Downloader**：使用 `JoeanAmier/XHS-Downloader`，启动 API 模式，携带本地 API 服务启动时生成的 Bearer Token 调用 `POST /xhs/detail`、`{"url":"小红书分享链接","download":false}`。确认 `data.作品ID`、`data.作品标题`、`data.下载地址`、`data.封面地址`。Token 严禁提交到仓库或网页。
4. **挑选适合网页的 MP4**：在 `https://sns-bak-v10.xhscdn.com/stream/...` 等解析结果候选中优先测试不需要临时签名的 H.264 MP4。不得根据旧视频 ID 猜测地址；每次必须对当前作品重新解析。
5. **检查 HTTP 和防盗链**：对实际选中的 HTTPS 链接发送 `Range: bytes=0-1023`；要求返回 `206`、`video/mp4`、MP4 文件头中含 `ftyp`。对比不发送 Referer 与发送 `maddestalistar.github.io` 来源的结果。已观察到该 CDN **不带 Referer 为 206，站点 Referer 为 403**，因此不能直接从普通主站视频标签引用。
6. **独立无 Referer 播放页**：复制当前 `xhs-player.html`，给每条新视频建立独立静态页。只在该视频播放页写入 `<meta name="referrer" content="no-referrer">`，而不是对整个网站修改 Referrer Policy。视频使用 `<video controls playsinline preload="metadata">`，带封面及原帖故障回退链接。
7. **新增卡片与路由**：在 `index.html` 同一区域增加 `.ly-video-panel`；触发按钮设置唯一 `data-ly-video-open` 标识；在 `ly-video.js` 的 `players` 映射中配置白名单播放页路径。同步完善文案翻译与 CSS，更新静态资源缓存查询参数。
8. **核验、清理**：检查新闻区—视频区—首页内容顺序，现有视频仍可播放，手机端布局正常，视频弹窗关闭后不继续发声；首页保持 5 个直载 CSS 和唯一的静态 3D Logo iframe。删除 GitHub Actions **一次性测试工作流**，保留本说明。

## 两次有效测试的重要发现

- RedNote Downloader 能用小红书短链取回作品元数据和多个视频候选。
- XHS-Downloader 能交叉提供标题、笔记 ID、封面和下载地址。
- 两条视频的 `sns-bak-v10.xhscdn.com` 媒体链接通过了 HTTP 206 与 MP4 魔数检查。
- 第二条验证结果：`https://sns-bak-v10.xhscdn.com/stream/1/110/258/01eaa4e9a60a2e6c01037001a09437ef94_258.mp4`，不带 Referer 返回 206；带主站 Referer 返回 403。
- 解析成功和浏览器实际播放是不同的验证阶段。第一条有作者真实浏览器验证；第二条媒体请求成功，但浏览器实机仍需确认。
- 若以后某条视频失效，**先重新解析、验证当前 CDN 路径，再改动对应独立播放页**，不要同时改动其他正常视频。

## 安全与性能要求

- 不公开 Cookie、API Token、签名密钥。
- 不为小红书视频添加主站级全局 `no-referrer`，避免影响其他外链及视频接口。
- 不预加载视频主体：用 `preload="metadata"`，点击后才挂载 iframe；关闭时移除 iframe `src`。
- 使用真实封面，按需懒加载；保留小红书官方原帖入口。
- 遇到接口风控、CDN 政策变化或链接失效时，显示合理的失败提示，不能宣称播放成功。
