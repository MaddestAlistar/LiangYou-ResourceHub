# NShort JS 源插件 → 良友短剧热播站内播放：可行性核查

核查日期：2026-11-02

来源：
- https://github.com/karlbilet/nshort-plugins （已检查公开仓库和具体 JS/README）
- https://t.me/c/2455926776/561500 （私有 Telegram 群消息，当前未能读取内容，不能据此断定播放细节）

## 核实到的事实（来自仓库，而非实际片源播放测试）

NShort 插件是给 NShortApp / N果的「JS 源插件」机制使用，**并非可以直接在 GitHub Pages 执行的浏览器播放器**。主 README 说明新加入的多个源需要 N果宿主提供域名、请求头、权限映射，原仓库同步并不保证真实上游搜索和播放通过。

| 来源 | 源码能力 | 网站适配结论 |
| --- | --- | --- |
| `hongguo/hongguo-1080.js` | `globalThis.nshort.search/detail/play`，返回 URL/备选画质和可能存在的 `cencKey` | 使用官方模型和签名。加密视频依赖 App 原生 CENC 解密，不可直接送给 HTML video；不能绕过付费、DRM 和平台授权。 |
| `haokan/haokan.js` | 从既有 `loadResource` 提取 HTTPS URL，`play()` 返回 `{url,variants}` | 适合作为**非加密、授权、允许嵌入** MP4/HLS 的接口形状参考；没有实际验证跨域、源站许可、播放成功。 |
| `hema/hema.js` | 搜索、详情、选集，原有源接口要求自定义请求格式、加密交换 | 需要专门服务端适配和授权，不是可直接插入页面的 MP4 地址。 |
| `qimao/qimao.js` | 目录、签名参数、详情、选集和 URL | 同上，不能仅导入脚本实现播放。 |
| `xifan/xifan.js` | 搜索、详情、选集；可能标记锁定/付费节目 | 仅可使用明确可免费嵌入的剧集，不尝试绕过锁定和付费。 |
| `huangguo/huangguo-video.js`, `huangguo/huangguo-ai.js` | 返回 `{builtin:{action,...}}` 而不是直接视频 URL | 必须由支持 `builtinSource` 的 N果 App 配合，无法独立部署到网页。 |
| `shadiao/shadiao.js` | 使用第三方已部署服务，代码中包含服务访问口令 | 不能把共享口令搬到公开站点或利用它替代许可。 |

该仓库未发现项目层面的 LICENSE 文件（公开可见≠可重新部署/分发）。本次只做阅读与架构核查，未复制第三方插件或固定口令到良友仓库，未运行私有上游请求，也未验证任何真实正片播放。

## 网站的现有可用结构

- 卡片：`media-shortdrama.js` 中每张短剧的「测试」按钮。
- 站内播放器：`media-shortdrama-player.js`，HTML video + iOS 原生 HLS / HLS.js 以及选集。
- 受保护的元数据 Worker：`labs/short-drama-playback-worker.mjs`。
- 服务地址：`https://liangyou-short-drama-playback.maddestalistar.workers.dev/api/resolve`。
- 当前输入：DJHUB 作品 `workId` / `title`；Worker 需要经过许可的作品/视频源映射，返回 `{episodes:[{number,url,mime}]}`。
- 当前没有经过验证的 NShort 视频源，不能声称测试按钮已播放正片。

## 真正接入的最小路径

1. **获得合法可嵌入的播放来源**：来源需明确允许第三方站内播放，给出 SDK、官方网页嵌入机制，或有授权的 HTTPS MP4/HLS 视频链接。独立测试一部免费作品及一集。
2. **严格匹配作品**：以 DJHUB 标题、别名、年份、集数辅助检索候选，确认标题与剧集一致；存储 DJHUB ID ↔ 来源作品 ID 的明确映射，避免同名误播。
3. **标准化结果**：对于允许直接嵌入、无需额外鉴权或 DRM 的 `nshort.play()` 类型输出，提取 URL 与备选清晰度。绝不将 `cencKey`、App 私有签名、共享口令或受限视频密钥发送浏览器。
4. **连通校验**：检查 HTTPS、URL 主机、是否免费/允许嵌入、Content-Type、CORS、是否过期，iPhone Safari 原生 HLS 和桌面 HLS.js 分别实测播放、快进、切集与关闭。
5. **仅元数据**：Worker 只返回允许直连的短时可用 URL，不代理视频字节；被锁定/DRM/无许可/无法跨域时明确显示不可用。
6. **独立灰度**：仅在测试按钮启用一部已获授权的作品，真实播放成功后再增加其他作品，不自动扫全站播放接口。

## 为什么现在还不能保证「直接播放」

- NShort 的 `nshort` 和 `Widget.http` 是应用宿主契约，在 GitHub Pages 没有对应环境。
- 红果 1080p 的 `cencKey` 方案依赖原生 CENC 媒体栈；不等于 Safari/HTML video 可直接解密播放。
- 普通视频 URL 也未必开放跨站播放，可能要求域名授权、Referer、Cookie、签名、DRM 或地域限制。
- MDJ Hub 只用于已接入的短剧元数据；与 NShort 的作品 ID 不是同一套。
- Telegram 的 `t.me/c/` 私有消息不能凭链接读取，需消息拥有访问权限的用户提供文本或截图才能进一步核查。

**当前决策**：保留测试入口及现有已验证的独立 Worker，不上传 NShort 代码，不自动启用未核实来源；下一步以拥有嵌入许可的单集视频实际验证为前提。
