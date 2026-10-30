# 西瓜视频：影视中心接入

接入分两步：SandBase 的公开视频搜索（第三方；需要密钥），以及西瓜视频官方 `get_iframe_info` 对每个搜索命中的 iframe 授权校验。只有官方返回可用的 iframe，才会进入影视中心站内播放列表。

1. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中新建 `SANDBASE_API_KEY`，值为你自己的 SandBase API Key。密钥只由 Actions 使用，不会进入网站前端。
2. 在 Actions 内手动运行 **Refresh Xigua verified in-page trailers**，或等待每天两次的定时任务。
3. 检查工作流日志的 `XIGUA_CHECKED`、`XIGUA_UNAVAILABLE` 及 `XIGUA_SUMMARY`，并确认 `data/media-xigua-videos.json` 有已核验的条目。
4. 检查国内手机网络真实播放，尤其 iPhone Safari 和西瓜视频自身的地域/版权限制；官方返回 iframe 不等于实际播放一定成功。

缺少密钥时，任务不会向第三方发送请求；旧站内视频来源不受影响。西瓜官方说明仅部分视频允许站外嵌入，视频下架或权限变化可能导致历史 iframe 失效。这个项目只嵌入官方允许的播放器，不绕过授权、不提取或代理站点 DRM/直链。

官方文档：https://developers.ixigua.com/iframe.html

SandBase：https://blog.sandbase.ai/zh-CN/xigua-data-api-on-sandbase/
