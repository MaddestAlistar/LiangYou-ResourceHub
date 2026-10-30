# 西瓜视频：影视中心接入

## 2026-10-30 实测状态

**接入代码已部署，但西瓜视频数据源尚未启用。** 2026-10-30 GitHub Actions 从官方 `get_iframe_info` 请求公开视频时，HTTP 状态为 200，但返回 `text/html` 而不是文档描述的 JSON。即使配置 SandBase 搜索密钥，此时仍无法完成官方嵌入许可验证；自动刷新会在 API 预检异常时提前结束，不消耗第三方搜索额度。静态数据 `data/media-xigua-videos.json` 目前为空，页面不会显示未经验证的西瓜卡片。

不要因为 GitHub Action 显示 success，就误以为已经拿到公开视频或完成中国大陆播放验证。需进一步找到可用的官方分享嵌入代码/正式接口，并实测中国大陆 iPhone Safari 播放后才能正式启用。


> **实测状态（2026-10-30）：尚未证明西瓜视频能在本站播放。** GitHub Actions 从西瓜官方 `get_iframe_info` 拿到 HTTP 200 HTML 而不是文档要求的 JSON；仓库还没有 `SANDBASE_API_KEY`，因此视频快照为 0 条。刷新程序先检查官方接口的 JSON 可用性，失败就不会向可能收费的 SandBase 发起搜索。即使配好密钥，也需要官方接口恢复并经过国内用户的实际播放验证。请先用 [西瓜视频测试页](../labs/xigua-embed-probe.html) 在中国大陆网络下测试。

接入分两步：SandBase 的公开视频搜索（第三方；需要密钥），以及西瓜视频官方 `get_iframe_info` 对每个搜索命中的 iframe 授权校验。只有官方返回可用的 iframe，才会进入影视中心站内播放列表。

1. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中新建 `SANDBASE_API_KEY`，值为你自己的 SandBase API Key。密钥只由 Actions 使用，不会进入网站前端。
2. 在 Actions 内手动运行 **Refresh Xigua verified in-page trailers**，或等待每天两次的定时任务。
3. 检查工作流日志的 `XIGUA_CHECKED`、`XIGUA_UNAVAILABLE` 及 `XIGUA_SUMMARY`，并确认 `data/media-xigua-videos.json` 有已核验的条目。
4. 检查国内手机网络真实播放，尤其 iPhone Safari 和西瓜视频自身的地域/版权限制；官方返回 iframe 不等于实际播放一定成功。

缺少密钥时，任务不会向第三方发送请求；旧站内视频来源不受影响。西瓜官方说明仅部分视频允许站外嵌入，视频下架或权限变化可能导致历史 iframe 失效。这个项目只嵌入官方允许的播放器，不绕过授权、不提取或代理站点 DRM/直链。

官方文档：https://developers.ixigua.com/iframe.html

SandBase：https://blog.sandbase.ai/zh-CN/xigua-data-api-on-sandbase/
