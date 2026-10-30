# 西瓜视频：SandBase 每日最多 50 次搜索与站内播放

## 使用前提

- 此 SandBase 账户由用户确认**仅用于西瓜视频**，API Key 单独设置了**累计 $0.01 付费上限**，并有首次正式调用成功、用户核对未扣费的反馈。
- SandBase 合资格数据 API：**整个组织每天 UTC 最多 100 次免费调用**，包括这个账户下其他项目可能的 API 请求。超额会收费，免费额度不会自动在第 101 次中断。本项目因此额外限制 **UTC 每日最多 50 次**，留有 50 次余量。
- $0.01 是 **密钥累计付费上限**，不是每日付费上限；它仍允许极少量收费。用户不得把 $0.01 当成“0 费用保证”，也不得通过将它改为 unlimited 来保证免费搜索。
- Github Actions 不能从这把 key 的 Account Balance 端点读取组织余额（曾返回 403）。此安全机制主要依赖用户主动设置的密钥限额，GitHub 本地硬限制与每日调用预算；**不能自动核实 SandBase 的真实扣费情况**。

## 自动搜索计划

- 每天 UTC **01:17、05:17、09:17、13:17、17:17**，共五次刷新，每次最多 **10 次 SandBase 请求**，总计**50 次/UTC 日**。
- 每次最多搜索 10 部作品，**每部作品只用 1 个关键词**。后续轮次自动切换另一种关键词写法，避免同一作品连续消耗两次额度。
- 动漫、电视剧、电影交替选择，优先查最久没有核验的作品，避免排队时只覆盖某一类。
- `data/media-xigua-budget.json` 记录 UTC 日累计已尝试调用数量和失败暂停状态；跨运行读取远端最新账本，合并时只增不减。搜索失败不重试；出现 402、429 或未知错误，将本日后续批次暂停，下一 UTC 日再检查。
- 搜索密钥只放在 GitHub Actions Secret `SANDBASE_API_KEY`，不出现在网页、用户端脚本或公开输出中。

## 匹配与视频上线严格分开

- 搜索匹配到的视频候选保存在 `data/media-xigua-videos.json` 的 `candidateVideos` 中，供后续核验；每部最多保留 8 条候选，只包含公开视频的题名、视频 ID、作者和安全封面 URL。
- **候选不代表允许站内播放**。只有西瓜官方 iframe 审核接口返回合格代码时，才进入对访客展示的 `videos` 字段。
- 目前西瓜官方 `get_iframe_info` 接口在 GitHub Actions 实测返回 HTML 而不是预期 JSON，**所以即使每天搜索 50 次，也不保证立即在影视情报中心看到西瓜视频**。下一步仍需解决官方嵌入授权及中国大陆 Safari 实际播放验证。
- 原有 B 站、YouTube、AcFun、Dailymotion、Niconico 等来源和最多 20 个统一视频位保持不变。

## 测试与核对

- [西瓜刷新 GitHub Actions](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/workflows/refresh-media-xigua-videos.yml)
- [公开西瓜站内播放测试页](https://maddestalistar.github.io/LiangYou-ResourceHub/labs/xigua-embed-probe.html)
- [SandBase 官方免费配额说明](https://sandbase.ai/docs/for-agents/full)
- [SandBase 西瓜视频搜索](https://www.sandbase.ai/model/xigua/app-v2/search-video)

运行成功说明代码正常执行，不等于每部都找到了视频。关注日志 `XIGUA_CHECKED`（当批已搜索作品）、`XIGUA_SUMMARY`（当天累计尝试次数）、`XIGUA_SANDBASE_SEARCH_HTTP`（API 拒绝），以及 SandBase 控制台真实消费记录。若你今后使用 SandBase 其他 API，或改动这把密钥的 $0.01 限额，请重新调整每日 50 次预算。
