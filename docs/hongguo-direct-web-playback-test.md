# 红果短剧公开网页视频直连：真实播放验证

验证日期：2026-11-02

**结论：确实可用的首集 MP4 在模拟 GitHub Pages 正式域名的跨站页面中，被 Chromium 和 WebKit 浏览器引擎解码播放；视频字节直接请求 `hongguoduanju.com`，没有通过本网站的 Cloudflare Worker。** 这证明基础技术可行，**不**证明所有剧集都有可用地址、允许第三方网页长期嵌入，或 iPhone Safari 真机兼容。

## 验证对象

- DJHUB 作品：`mc-f69f61885d5408860161`，标题：《重生！丑小鸭逆袭成了万人迷第二季》，平台：红果漫剧，250 集。
- 红果网页：https://hongguoduanju.com/player/7685676216996596761
- 网页公开的第一集视频：https://hongguoduanju.com/video/public/7685677901034818622/360p.mp4
- 测试代码：`scripts/probe_hongguo_web_direct.mjs`
- 测试工作流：`.github/workflows/probe-hongguo-web-direct.yml`
- 最终通过的 Action：https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/41421787099

## 实测结果

| 检查项 | 实测 |
| --- | --- |
| 剧名与网页 | 网页 HTTP 200，HTML 内含准确剧名和第一集公开 MP4 地址 |
| 视频首部 | HTTP 206，`video/mp4`、`Accept-Ranges: bytes`，`ftyp` MP4 头，文件总长 678,763 字节 |
| 浏览器来源 | 在 Playwright 中拦截一张**空白测试页**，其 URL 设置为 `https://maddestalistar.github.io/LiangYou-ResourceHub/hongguo-direct-probe.html`，因此视频看到的是实际 GitHub Pages 站点来源，而非 localhost |
| Chromium | `playing`，640×360，播放进度超过 1 秒 |
| WebKit | `playing`，640×360，播放进度超过 1 秒 |
| 视频请求 | 浏览器跟踪显示只请求 `hongguoduanju.com`，无视频流量经过 `*.workers.dev` |
| iPhone Safari 真机 | 尚未测试；WebKit 自动化不等于真机 |
| 站外嵌入授权 | 尚未核实；公开访问不等于允许长期第三方嵌入 |

测试是**只读验证**：没有修改站内播放器、没有安装第三方混淆插件、没有复制视频文件、没有部署反向代理。Playwright 在测试结束即关闭，不保存视频。

## 技术可行性与下一步

现有的 `media-shortdrama-player.js` 使用 HTML5 `video`，具备直连 HTTPS MP4 能力。要对接真实短剧，不能把 DJHUB 的 `mc-...` ID 直接代替红果网页的数字 ID。需要在后端维护经核实的 **DJHUB 作品 ID ↔ 红果剧集 ID ↔ 实际分集 ID** 的映射，并验证每一集实际是否有无需认证、可用的公开 MP4。特别是网页仅显示试看片段或受限制的集数时，不得尝试绕过付费、鉴权或 DRM。

正式对接前仍需确认网页内容的第三方嵌入许可和链接长期可用性。无需替换现有 Worker 或让它传视频：在满足许可的情况下，后端仅返回受控作品/分集元数据，浏览器直接请求视频 URL。

**当前网站状态**：短剧「测试」按钮和安全元数据 Worker 保留；**没有**把本次实验性红果视频正式配置到所有卡片中。
