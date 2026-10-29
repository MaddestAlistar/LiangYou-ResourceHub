# 视频精选发布规则 · 良友科技圈新闻

## 适用范围
- 首页“良友科技圈新闻”保留原有文字新闻卡片。
- “视频精选”统一提供 **原网站链接 / 上传视频 / 内容标题 / 内容描述** 四个必填字段。
- 原网站域名是小红书 `xhslink.cn`、`xiaohongshu.com` 时展示小红书笔记卡片（红色圆形播放按钮 + 红色“书”标识，其他按钮深蓝色）。
- 原网站域名是 Telegram `t.me` 或 `telegram.me` 时展示 TG 频道视频卡片（蓝色纸飞机标识）。
- 网页内播放使用上传到 GitHub 的 MP4，不依赖原网站嵌入播放器，原网站链接仅用于“查看原帖”。两个旧版小红书视频保留现有固定播放方案。

## 文件规范
- **必填上传视频：MP4，不超过 20 MB（20,000,000 字节）**。选择超限文件时立即提示“文件过大，无法上传”，并清除文件选择；Worker 同样拒绝大文件。
- **视频精选内容标题最多 20 字，内容描述最多 38 字**；前后端均做实际校验。普通新闻仍为标题最多 120 字、正文最多 3000 字。
- 推荐 H.264 + AAC、720p。高码率原视频建议先压缩。
- 浏览器尽力截取视频第一帧作为 JPG 封面，不可提取时显示平台渐变占位图。
- 存储地址：`MaddestAlistar/videos` 的 `main/clips/<UUID>.mp4`，可选 `main/clips/<UUID>.jpg`。
- 新闻标题、描述、链接与文件 URL 仍写入 `MaddestAlistar/Icon-Review-Queue` 的 `news/tech-news.json`。
- 删除文章只删除新闻记录，**不会自动删除 GitHub 视频文件**；编辑时可保留视频或上传替换旧视频。

## 首次启用：Cloudflare 密钥（必须）
原新闻系统的 `GITHUB_TOKEN` 按设计只负责 `Icon-Review-Queue`，没有跨仓库上传视频的权限。因此需要在 **Cloudflare Worker: liangyou-icon-review** 配置单独的密钥：

1. 在 GitHub 创建 fine-grained personal access token，Repository access 只选 `MaddestAlistar/videos`，Repository permissions -> Contents: Read and write。
2. 进入 Cloudflare Workers & Pages -> `liangyou-icon-review` -> Settings -> Variables and Secrets。
3. 添加加密 Secret：**`VIDEOS_GITHUB_TOKEN`**，值为上述 token，随后部署或保存使其生效。
4. 回到新闻管理后台，选择“视频精选”，填写四个必填项并提交一个拥有发布权的视频，确认能播放、修改和删除新闻。
5. 该令牌 **不得** 填在 GitHub Pages 前端、`wrangler.jsonc`、仓库 README 中或消息里。

后台若未配置密钥会显示 503 和可读错误，不会假装成功。Worker 默认使用原有 ADMIN_KEY 鉴权。

## 注意
- GitHub Raw 下载域名在部分大陆网络下可能受限；媒体文件存 GitHub 并不等于大陆用户一定能直连播放。
- `videos` 仓库需要保持 public；当前视频地址是 `https://raw.githubusercontent.com/MaddestAlistar/videos/main/clips/...`。
- 单条 20 MB 是本站发布限制，并非 GitHub 官方上限；大量视频会迅速增长仓库体积。后续可按情况迁移视频对象存储/CDN，保持新闻数据和卡片结构不变。
- Cloudflare Worker 端同样校验管理员密钥、MP4 文件签名、体积及原链接域名，不能仅依赖浏览器表单检查。
