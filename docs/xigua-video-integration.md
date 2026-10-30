# 西瓜视频：谨慎免费调用与站内播放接入

## 2026-10-31 最新状态：$0.01 消费上限单次测试成功

用户把专用 SandBase 密钥消费上限由 $0 调整至累计 $0.01（余额中有赠送的 $1），明确授权一次 API 测试。使用当前官方示例的 `POST /v1/api/xigua/app-v2/search-video`、`{"keyword":"..."}`，GitHub Actions 运行号 `41089826853` 在 2026-10-30T16:26 UTC **成功发起唯一一次搜索**，返回符合程序预期的已完成响应；未出现 402。测试目录 `bangumi-390200` 未找到符合作品匹配规则的视频，西瓜可播放视频仍为 0。

- GitHub 本地预算账本当天从 2 次**已尝试**增加至 3 次，本轮只增加了 1 次。
- 真实是否使用了 SandBase 每天 100 次免费额度以及实际费用需要到 **Developer → Activities → Usage / Request History** 检查。GitHub 账户余额读取 API 依然不通，`SPENT $0` 可能受到前端金额精度影响，不能单凭四舍五入的数值断言完全免费。
- 授权的单次测试结束后，工作流已恢复 `XIGUA_AUTO_SEARCH_ENABLED=false`、`XIGUA_ONE_TIME_PAID_TEST=false`。**没有授权执行更多请求，自动搜索继续暂停**。
- 24/UTC 日、12/次运行是以后可选的技术配额，不是本次操作实际发起的搜索数量。以后若要启用每日自动搜索，需要确认真实免费额度或再次由用户明确授权付费预算。
- 西瓜官方 iframe 核验接口仍返回 HTML，搜索 API 通畅不等于能站内播放；所有其他视频平台保持正常。

[本轮 GitHub Actions 测试](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/41089826853)

## 2026-10-30 已验证的 $0 消费上限结果

用户明确表示已将此 SandBase 专用 API Key 的 Spending Limit 从默认 **unlimited** 改成 **$0**；GitHub Secret 可用。已在 GitHub Actions 用正式 `POST /v1/api/xigua/app-v2/search-video` 实际发起测试，SandBase 返回 **HTTP 402**（资金或 API Key 消费上限阻止请求），说明这把 $0 上限的密钥当前**不能通过该接口完成免费搜索**。

- 请求共尝试 2 次（GitHub 配额账本记录 `2026-10-30 2`），没有搜索结果，也没有 Xigua 视频新入库；这两次是调用尝试，不代表免费额度已扣减 2 次，更不代表产生账单。
- 正式 Xigua API 目录显示：**每个组织 UTC 每日前 100 次符合条件的数据 API 调用免费，之后收费；当前搜索接口单次价从 $0.0015 起**。文档同时说明 $0 组织余额也能使用免费额度，但 **$0 API Key 消费上限下的实测仍返回 402**，两者不可混为一谈。
- 自动工作流已设置 `XIGUA_AUTO_SEARCH_ENABLED=false`，防止每天重复向 SandBase 发出已知被拒绝的请求。将来若恢复，必须先确认依然不会产生任何费用，确认接口可用，然后再将这个变量改成 `true`。24/天、12/运行的本地预算配置保留，但不是免计费保证。
- 原有 B 站、YouTube、Dailymotion、AcFun、Niconico 等视频来源完全不受影响。西瓜官方 iframe API 仍返回 HTML，未验证的西瓜搜索结果绝不展示成可播放卡片。
- **不要为了解除 402 而直接把 $0 限额改成 unlimited 或充值。** 官方说明组织零余额可用免费额，只有在能够独立确认账户既无余额又无任何授信/付费能力、SandBase 的免费 API 可用时才考虑采用另一个安全配置。

参考：[SandBase Xigua API（免费额度及单次报价）](https://www.sandbase.ai/apis/xigua)、[SandBase API Key 文档](https://www.sandbase.ai/docs/getting-started/api-keys)、[SandBase AI API Guide](https://www.sandbase.ai/docs/for-agents/full)



## 状态（2026-10-30）

已接入影视情报中心的作品 ID 核对、站内播放器和静态视频快照。**但尚无可实际播放的西瓜视频通过审核上架。** GitHub Actions 实测：
- `SANDBASE_API_KEY` 已被 GitHub 识别；
- `GET /v1/account/balance` 返回 403，不能用这个密钥核实有无可付费余额；
- 西瓜 `get_iframe_info` 返回 HTML，不是文档列出的 JSON。因而无法从其公开 API 验证视频可嵌入性。

**注意：SandBase 官方免费 100 次是整个组织共享的 UTC 日限额。账户仅给西瓜视频使用时，本站 24 次/日有 76 次余量，但免费用完后依然可继续收费；即使本网站限于 24 次，也无法独立保证每次免费。** [SandBase 官方免费额度说明](https://sandbase.ai/docs/for-agents/full)。

## 网站侧已经设置的限制

1. 每天 UTC 最多 **24 次** SandBase 搜索；单次运行最多 **12 次**。每天 UTC 07:17、19:17 各调度一次，每次最多轮询 6 个作品（每作品最多 2 个关键词）；失败不重试、超限不再继续。
2. `data/media-xigua-budget.json` 记录当天已尝试的请求。工作流串行、记录会随 JSON 缓存写回 GitHub。
3. 如果官方嵌入接口暂时失效，可以在**有零付费硬保障**的前提下搜索公开元数据并记录匹配数量，但绝不把未经官方批准的视频当作可播放卡片展示。
4. 不影响 Bilibili、YouTube、Dailymotion、Niconico、AcFun 的视频抓取、20 条总上限与站内播放。

## 已确认的密钥设置与暂停策略

- 密钥由用户本人在 SandBase **从 unlimited 改为 $0 消费上限**，保持 active；不再怀疑列表上的 $0 是没有设置。
- GitHub Actions 现已依据这项用户确认启用 `SANDBASE_HARD_ZERO_SPEND_CONFIRMED=true`，实际尝试时 SandBase 对 Model API 西瓜搜索返回 **HTTP 402**，说明零付费硬限制生效，但当前不能借此使用免费额度。
- 自动搜索已被 `XIGUA_AUTO_SEARCH_ENABLED=false` 暂停，定时任务仅运行本地测试及官方 iframe 可用性探测；不会继续发送第三方收费 API 请求。
- 需要同时满足：①平台确实允许免费请求；②账户无可扣费余额/授信或有可靠平台级零扣费保障；③实测西瓜搜索接口返回有效数据，才能再开放自动搜索。**不可直接把密钥上限改回 unlimited 或充值来绕开 402**。
- 限额计数是“已尝试请求数”，不是 SandBase 真实免费额度扣减记录。

## 核验

- [每日西瓜检查 GitHub Actions](../.github/workflows/refresh-media-xigua-videos.yml)
- [西瓜官方 iframe 播放测试页](../labs/xigua-embed-probe.html)
- [西瓜视频 iframe 开发者文档](https://developers.ixigua.com/iframe.html)

日志 `XIGUA_CHECKED` 的 `matched` 只是名字匹配数量，`embedded` 才是官方接口核验并可供前端显示的条数。即使 `embedded` > 0，仍须在中国大陆实际播放，才能确认最终效果。
