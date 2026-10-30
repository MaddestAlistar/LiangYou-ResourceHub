# 西瓜视频：谨慎免费调用与站内播放接入

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

## 关于 SandBase API Keys 的 SPENT $0 / LIMIT $0 显示

SandBase API Keys 列表中 `SPENT $0` 仅说明这把密钥目前没有产生消费；`LIMIT $0` **不能单凭列表断定已设置 $0 硬限制**。官方文档说明新建/编辑密钥时 **Spending limit 留空意味着 unlimited**，列表可能将未设置的值显示为 $0。需要进入该密钥的 **Edit** 界面核实输入框：如果为空，则不是零消费硬限制。即使明确填入 0，也需进一步确认平台是否支持这项设置、免费额度调用是否允许通过，以及超额是否会被拒绝。

**不要只因为截图显示 `LIMIT $0` 就将 `SANDBASE_HARD_ZERO_SPEND_CONFIRMED=true` 写入 GitHub。** 余额读取因 403 不可用时，网站继续暂停 SandBase 自动搜索；这不会影响原有视频来源。

官方依据：https://www.sandbase.ai/docs/getting-started/api-keys

## 什么时候才允许搜索？

两条路径满足任意一条才允许：

- **路径 A（自动验证）**：`GET /v1/account/balance` 成功，且组织余额、授信都等于 0。当前密钥返回 403，因此此路径暂不可用。
- **路径 B（账户明确设置）**：在 SandBase Developer → API Keys 把**本网站专用密钥**设置为平台强制执行的 **$0 付费上限**（如果平台支持），确认 SandBase 允许免费配额请求且对超额请求实行硬拒绝；然后才在 GitHub 仓库 Settings → Secrets and variables → Actions → **Variables** 添加：
  `SANDBASE_HARD_ZERO_SPEND_CONFIRMED=true`

> 此变量代表网站所有者已经亲自核实 SandBase 的硬限制；GitHub 无法从这个变量验证平台实际配置。**官方文档没有明确保证 $0 消费上限能否成功创建或是否允许免费请求。** 如果控制台不提供有效的零金额硬限制，**不要设置此变量**，程序继续安全暂停。仅靠“每天 1 次”不是零付费保证。

这两个条件之外不会向 SandBase 发送可能收费的搜索请求。密钥只放在 Actions Secret 内，不得放在网站前端。

## 核验

- [每日西瓜检查 GitHub Actions](../.github/workflows/refresh-media-xigua-videos.yml)
- [西瓜官方 iframe 播放测试页](../labs/xigua-embed-probe.html)
- [西瓜视频 iframe 开发者文档](https://developers.ixigua.com/iframe.html)

日志 `XIGUA_CHECKED` 的 `matched` 只是名字匹配数量，`embedded` 才是官方接口核验并可供前端显示的条数。即使 `embedded` > 0，仍须在中国大陆实际播放，才能确认最终效果。
