# 红果短剧公开网页视频直连：真实播放验证

验证日期：2026-11-02

**结论：公开 MP4 可以直接在模拟正式 GitHub Pages 域名的页面播放，且不通过本网站的 Cloudflare Worker；但实际文件仅约 10 秒，是公开视频预览而非完整第一集。** 浏览器技术链路通过，不代表整集正片已经找到、存在第三方嵌入授权或已在 iPhone Safari 真机验证。

## 验证对象

- DJHUB 作品：`mc-f69f61885d5408860161`，标题：《重生！丑小鸭逆袭成了万人迷第二季》，平台：红果漫剧，250 集。
- 红果网页：https://hongguoduanju.com/player/7685676216996596761
- 网页公开的第一集 **10 秒预览**：https://hongguoduanju.com/video/public/7685677901034818622/360p.mp4
- 测试代码：`scripts/probe_hongguo_web_direct.mjs`
- 测试工作流：`.github/workflows/probe-hongguo-web-direct.yml`
- 最终通过的 Action：https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/41421787099

## 实测结果

| 检查项 | 实测 |
| --- | --- |
| 剧名与网页 | 网页 HTTP 200，HTML 内含准确剧名和第一集公开 MP4 地址 |
| 视频首部 | HTTP 206，`video/mp4`、`Accept-Ranges: bytes`，`ftyp` MP4 头，文件总长 678,763 字节 |
| 浏览器来源 | 在 Playwright 中拦截一张**空白测试页**，其 URL 设置为 `https://maddestalistar.github.io/LiangYou-ResourceHub/hongguo-direct-probe.html`，因此视频看到的是实际 GitHub Pages 站点来源，而非 localhost |
| Chromium | `playing`，640×360，播放进度超过 1 秒；**总时长 10.07 秒** |
| WebKit | `playing`，640×360，播放进度超过 1 秒；**总时长 10 秒** |
| 视频请求 | 浏览器跟踪显示只请求 `hongguoduanju.com`，无视频流量经过 `*.workers.dev` |
| 完整正片 | **未获得**。只有 10 秒公开视频预览，不能当作整集播放 |
| iPhone Safari 真机 | 尚未测试；WebKit 自动化不等于真机 |
| 站外嵌入授权 | 尚未核实；公开访问不等于允许长期第三方嵌入 |

### 完整视频地址的额外核验

- 官方红果网页 HTML 检查：`video_player_info`、`main_url`、`backup_url` 均未出现，未发现可直接使用的完整视频链接。
- 参考 `gybeyond1/hongguo-dl` 的 `novelquickapp.com/player/<series>/<episode>` 网页路径实测：请求 HTTP 200，但最终跳转到 `hongguoduanju.com`，响应中同样没有 `video_player_info/main_url`；因此该仓库提到的取流途径**对本次测试作品未能取得整集地址**。
- 这两种检查均未使用账号、App 私有签名、媒体解密，也不尝试绕过付费或 DRM。

测试是**只读验证**：没有修改站内播放器、没有安装第三方混淆插件、没有复制视频文件、没有部署反向代理。Playwright 在测试结束即关闭，不保存视频。

## 技术可行性与下一步

现有的 `media-shortdrama-player.js` 使用 HTML5 `video`，具备直连 HTTPS MP4 能力。要对接**完整正片**，首先必须获得并确认有权使用的完整视频来源；本次查到的 10 秒预览不能用于替代正片。之后不能把 DJHUB 的 `mc-...` ID 直接代替红果网页的数字 ID。需要在后端维护经核实的 **DJHUB 作品 ID ↔ 红果剧集 ID ↔ 实际分集 ID** 的映射，并验证每一集实际是否有无需认证、可用的公开 MP4。特别是网页仅显示试看片段或受限制的集数时，不得尝试绕过付费、鉴权或 DRM。

正式对接前仍需确认网页内容的第三方嵌入许可和链接长期可用性。无需替换现有 Worker 或让它传视频：在满足许可的情况下，后端仅返回受控作品/分集元数据，浏览器直接请求视频 URL。

**当前网站状态**：短剧「测试」按钮和安全元数据 Worker 保留；**没有**把本次实验性红果视频正式配置到所有卡片中。
