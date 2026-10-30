# 西瓜视频：零付费影视预告接入

本项目把官方允许嵌入的西瓜视频，与电影 TMDB ID / 动漫作品 ID、年份、季数关联，保留影视中心现有的 Bilibili、YouTube、Dailymotion、Niconico、AcFun 视频卡片和总计 20 条上限。不对访客直接调用 SandBase，密钥只存在 GitHub Actions Secrets。

## 现状与限制（2026-10-30）

- 西瓜官方 `get_iframe_info` 在 GitHub Actions 实测 HTTP 200，但响应为 HTML 而不是预期 JSON；因此**真实西瓜视频并未完成审核入库，播放器效果仍须大陆手机网络确认**。
- 即使已配置 `SANDBASE_API_KEY`，只有官方接口可用、账户资金状态安全、每日调用额度剩余时才会启动搜索。缓存为空不会导致其他视频来源失效。
- 单独的[站内播放诊断页](../labs/xigua-embed-probe.html)可让中国大陆用户实际尝试 iframe 播放，不能把 HTTP 200 等同于“已经成功播放”。
- SandBase 共有 100 次/组织/UTC 日的免费适用 API 调用，**超出后不会自动拒绝计费**，且是跨本组织其他应用共享，单凭固定调用次数不能保证零费用。

## 这个项目的零付费限制（Fail closed）

1. 使用 SandBase **公开只读** `GET /v1/account/balance` 查询组织资金状态。如果 `balance` 非零、`credit_limit` 非零，或者无法确定资金状态，则直接终止；不会向 SandBase 提交视频搜索。
2. 仅在可计费余额与信用额度都为零时执行免费搜索，因此即使 SandBase 整个组织的 100 次免费额度已被其它项目占用，后续请求也不能从余额或授信扣款（可能返回 402 并停机）。如果将来给账户充值或授信，这个工作流会自动转为“禁用搜索”。
3. 本仓库搜索预算另外独立限流：**UTC 每日最多 20 次、每次工作流最多 8 次**。计数发生于发请求之前；失败也占用预算，不会盲目重试。
4. `data/media-xigua-budget.json` 持久化每日已尝试调用次数，由 GitHub Actions 同数据快照一起提交；重跑不会将本日配额重置。为降低跨任务竞争，单一工作流设置串行组。
5. 官方 iframe 返回非 JSON、API 无法授权、配额用尽或搜索返回错误，均**不展示未验证的西瓜视频**，不影响已有作品的其他视频来源。
6. **不会利用第三方直链、代理、绕过 DRM 或权限校验来实现强制播放**。西瓜官方仅允许部分视频站外嵌入，已嵌入视频也可能后来失效。

## 无需充值的使用办法

- 你可以在 GitHub Actions Secrets 中配置 `SANDBASE_API_KEY`。
- 检查 [西瓜刷新工作流](../.github/workflows/refresh-media-xigua-videos.yml) 的日志：`XIGUA_KEY_CONFIGURED`、`XIGUA_ZERO_FUNDS_VERIFIED`、`XIGUA_EMBED_API_UNAVAILABLE`、`XIGUA_ZERO_SPEND_STOP`。
- 不需要购买套餐。要让工作流搜索，当前组织必须满足可扣费余额 **0**、信用额度 **0**；如果存在余额，脚本将停止以履行零付费原则。
- 日志显示工作流 `success` 仅代表脚本执行无异常，不代表已匹配到视频。最终以 `data/media-xigua-videos.json` 中获得官方 iframe 认证的条目与中国大陆实际播放结果为准。

官方西瓜嵌入文档：https://developers.ixigua.com/iframe.html

SandBase 免费额度说明：https://sandbase.ai/docs/for-agents/full

SandBase 账户余额只读 API：https://www.sandbase.ai/docs/api-reference/account/balance
