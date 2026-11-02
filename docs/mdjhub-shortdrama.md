# DJHUB · 短剧热播接入

已核对 DJHUB 官方开发者文档 `https://themdjhub.org/docs`，其动态加载的公开文档源为 `/api-docs`。

## 前端

影视情报中心 → **短剧热播**。导航四列两排、第二排最右侧是预留入口“敬请期待”。

榜单含热播榜、最新上新、真人短剧、AI 短剧、漫剧。卡片展示可核验的官方封面、剧情简介、题材、集数、平台、站内热度、作品状态和首播日期，点击“查看作品来源”进入 DJHUB 作品页。不展示未经核验的 AI 推算分数，不把站内热度当作播放量。

## 正确的服务端 API

官方原生 API：`GET https://themdjhub.org/openapi/v1/dramas?page=1&limit=50&sort=popular`

认证头：`X-API-Key: YOUR_API_KEY`。

本项目的密钥配置在仓库 Settings → Secrets and variables → Actions → Repository secrets → `MDJHUB_API_KEY`；**不要放在公开代码或 GitHub Pages 前端**。

以前建议配置的 `MDJHUB_API_URL` 和 `MDJHUB_AUTH_MODE` 不再需要；现在由后端脚本写死核实过的官方 URL 和请求头，不会走错误的 Bearer 默认值。

## 同步流程

- `scripts/refresh_short_drama.py` 在 GitHub Actions 中请求四类数据：`popular`、`new`、`ai_drama`、`motion_comic`，去重合并并严格按接口的内容类型归类；最多收录 180 条。
- `data/media-short-dramas.json` 只存公开元数据，不包含密钥、原始响应、临时播放地址。
- `.github/workflows/refresh-short-drama.yml` 每天北京时间约 01:23 和 13:23 采集，可在 Actions 中手动运行。GitHub Cron 可能延迟。
- 若接口请求失败，原有的成功数据保留不被清空。只对热门榜原始排序显示 TOP 名次；AI 推算的初始评分不作为真实评分。
- 用 `python scripts/test_short_drama.py` 验证字段适配。

2026-11-02 的首次有效采集成功写入 169 部公开短剧，覆盖真人、AI 剧和漫剧。后续采集按 API 返回结果变化。

**说明：** 此处只展示作品资料和来源页面，不擅自中转受保护视频流，也不在浏览器里直接请求含 Key 的 API。
