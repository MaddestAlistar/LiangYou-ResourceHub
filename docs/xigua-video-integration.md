# 西瓜视频旧接口失效与抖音精选官方站内播放替代

## iPhone Safari 站内弹窗适配修复（2026-10-31）

用户真机截图显示：抖音 iframe 仅出现抖音 Logo、右侧白边、视频控件完全不可见。用 GitHub Actions 的 Playwright WebKit（iPhone UA、触屏、390px 视口）复现：浏览器窗口只有约 322×219px，但官方抖音嵌入页面实际生成宽 324、高 **624px** 的播放器。视频自身可加载、播放进度增加，问题主要是**站内弹窗把其竖版播放器裁成 16:9**。

验证过“给 iframe 760px 后 CSS 缩放回横屏”的思路，但 iOS WebKit 的跨域 iframe 内页面仍按手机视口处理（innerWidth约322px），不能可靠修复，已弃用。

**最终修复**：仅在手机宽度≤760px 时，`media-insights.js` 为抖音精选播放器添加 `mi-douyin-stage` / `mi-douyin-mobile` 类；`media-intel.css` 把 iframe 和播放器容器同时设为宽≤324px、高624px，居中，允许弹窗纵向滚动。其他视频服务仍用16:9。提供“重新加载播放器”按钮，播放失败不跳出原站。为 `china-perf.js`、`media-intel.css` 和 `media-insights.js` 更新版本参数，避免国内浏览器沿用旧缓存。测试页也适配同样的手机尺寸。

WebKit 在正式网站 `#media-trailer-dialog` 实测外框 **324×624px**、iframe **324×624px**，内层视频元素同样 **324×624px**，`readyState=4`、`error=0`。这是 Safari 同源 WebKit 引擎模拟测试，不等于所有用户真实 iOS 网络与 ChatGPT 内置浏览器都必然可播放；若仍出现黑屏需继续检查当地网络/上游限制。

验证日志：https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/41097619103

## 2026-10-30 实测结论与网站当前状态

**旧西瓜站内播放器不可用**：在用户的 GitHub Pages 域名中，用 Chromium 桌面与手机尺寸分别测试官方文档旧 iframe ID、以及通过 SandBase 找到的真实《赛博朋克：边缘行者》《侦探已经死了》西瓜 ID，iframe 自动跳转到 `m.ixigua.com/fullVideo/<id>` 并显示“内容可能已删除”；旧移动 embed 路径同样没有视频元素。旧 `get_iframe_info` 返回 HTML 而非 JSON。测试报告：[GitHub Actions 实际浏览器日志](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/41092228014)。这是上游平台和资源状态限制，不能靠调整本站 iframe 样式修复，也不可提取加密视频直链绕过限制。

**抖音精选官方 iframe 替代已成功**：西瓜网站桌面端与抖音/抖音精选融合，旧 ID 不可直接用在抖音 API。另从真实抖音精选网页取得匹配视频 ID，通过官方无需额外权限的 `GET https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video` 返回 `err_no=0`、合法 `iframe_code`。真实浏览器在用户 GitHub Pages 域名下验证两条《赛博朋克：边缘行者》相关视频：桌面和手机视口均能播放，`readyState=4`、`currentTime` 增长约 2.76 秒，`error=0`。测试报告：[官方 API](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/workflows/probe-xigua-douyin.yml) 和 [站内浏览器播放](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/workflows/probe-douyin-embed.yml)。

- 已新增 `data/media-douyin-verified.json` 的两条确实播放成功的**抖音精选**视频，并接入 `media-insights.js` 的统一 20 条站内视频画廊，作品映射 `tv:105248`。不把抖音视频冒充西瓜。
- **已暂停 SandBase 西瓜视频 50 次/日自动搜索**（`XIGUA_AUTO_SEARCH_ENABLED=false`），保留额度配置和已匹配候选；先解决播放能力再恢复搜索以免浪费免费额度。旧西瓜视频 `videos` 仍为 0，不展示无法播放的假卡片。
- 现有 YouTube、B站、AcFun、Dailymotion、Niconico 来源均保留。验证页新增官方抖音精选与旧西瓜播放器对比，便于实际 iPhone Safari 中国大陆网络确认。
- 手机尺寸 Chromium 的播放测试不等于中国大陆 Safari 真机验证；站内首批两条已满足桌面+手机模拟浏览器实际播放推进条件，但未证明旧西瓜视频恢复。



## 使用前提

- 此 SandBase 账户由用户确认**仅用于西瓜视频**，API Key 单独设置了**累计 $0.01 付费上限**，并有首次正式调用成功、用户核对未扣费的反馈。
- SandBase 合资格数据 API：**整个组织每天 UTC 最多 100 次免费调用**，包括这个账户下其他项目可能的 API 请求。超额会收费，免费额度不会自动在第 101 次中断。本项目因此额外限制 **UTC 每日最多 50 次**，留有 50 次余量。
- $0.01 是 **密钥累计付费上限**，不是每日付费上限；它仍允许极少量收费。用户不得把 $0.01 当成“0 费用保证”，也不得通过将它改为 unlimited 来保证免费搜索。
- Github Actions 不能从这把 key 的 Account Balance 端点读取组织余额（曾返回 403）。此安全机制主要依赖用户主动设置的密钥限额，GitHub 本地硬限制与每日调用预算；**不能自动核实 SandBase 的真实扣费情况**。

## 旧搜索配置（当前暂停，等待可播放来源）

- 工作流仍按每天 UTC **01:17、05:17、09:17、13:17、17:17** 检查，但 `XIGUA_AUTO_SEARCH_ENABLED=false`，**不发送 SandBase 收费端点请求**。将来重启时每批最多 10 次，总计最多 50 次/UTC 日。
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
