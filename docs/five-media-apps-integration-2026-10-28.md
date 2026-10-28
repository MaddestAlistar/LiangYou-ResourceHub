# 影视情报中心：Letterboxd、JustWatch、Sofa Time、Showly、MovieClaw 接入（2026-10-28）

## 这次已经接入主站的内容

本次修改了 `index.html`、`media-intel.js`，新增 `media-toolkit.js`、`media-toolkit.css`。影视情报中心单片详情里新增观影工具箱。

1. **JustWatch 观看渠道：真实功能。** 复用原有 TMDB API Key，通过独立 Cloudflare Worker 调用官方 `/movie/{id}/watch/providers`、`/tv/{id}/watch/providers`，支持 US、JP、KR、GB、HK、TW、SG、CA、AU、DE、FR、IN、CN 等国家地区切换。分为订阅、免费、含广告、租赁、购买。保留 JustWatch via TMDB 数据来源和地区提示，数据只说明平台是否收录，不是直接视频链接。浏览器请求失败时显示说明，不造假。
2. **Letterboxd：评分渠道复用 + 搜索 + 标准 CSV 导出。** 前端已有从 MDBList 取得的部分 Letterboxd /5 评分，新增按电影原名打开 Letterboxd 搜索；用户本地收藏可导出符合 Letterboxd 导入字段格式的 `tmdbID,imdbID,Title,Year` CSV。不是 Letterboxd 账号同步，也未调用其私有 API。
3. **Sofa Time / Showly：借鉴体验。** 新增无需登录的本机「想看、在看、已看」状态管理与 JSON 导出，保存在当前设备浏览器的 localStorage 中。此功能与 Sofa Time 或 Showly 账号没有连接，不能自动同步观看记录和追剧进度。Sofa Time（`sofatime.app`）与另一款自托管 Sofa（`sofa.watch`）并非同一应用。
4. **MovieClaw：自建媒体库可选接入资料。** 在工具箱放入官方教程和 GitHub 项目链接。MovieClaw 是需要 Docker/NAS 的媒体服务器，提供 Jellyfin 兼容 API、CLI 和 MCP。用户还未提供自己的部署实例与授权凭据，因此没有连接、登录或执行自动订阅/下载。官方新版许可证含非商业限制，不可擅自当作商业 SaaS 部署。

## 真正部署了什么

- Cloudflare Worker `https://liangyou-streaming-availability.maddestalistar.workers.dev/api/health`
- 示例电影：`https://liangyou-streaming-availability.maddestalistar.workers.dev/api/movie/550?region=US`
- 示例剧集：`https://liangyou-streaming-availability.maddestalistar.workers.dev/api/tv/1399?region=US`
- 示例电影日本区：`https://liangyou-streaming-availability.maddestalistar.workers.dev/api/movie/550?region=JP`
- Worker 源码：[`labs/streaming-availability-worker.mjs`](../labs/streaming-availability-worker.mjs)
- Cloudflare 部署 GitHub Actions：[`deploy-streaming-availability.yml`](../.github/workflows/deploy-streaming-availability.yml)
- 真实接口验证：[`smoke-streaming-availability.yml`](../.github/workflows/smoke-streaming-availability.yml)
- 前端界面：[`media-toolkit.js`](../media-toolkit.js) 和 [`media-toolkit.css`](../media-toolkit.css)

## 权限、安全与数据真实性

- TMDB API key 通过 Cloudflare Worker Secret 存储；浏览器不读取 GitHub Secrets，也不向用户显示密钥。
- Worker 验证 TMDB 电影/剧集 ID 与响应 ID、白名单地区、正规平台字段；正常缓存 6 小时；数据失效返回 HTTP 502。
- TMDB 数据源经 JustWatch 汇总，必须显示 JustWatch 来源标记。TMDB 和 JustWatch 不会返回每个具体平台的可直接播放链接。
- Letterboxd 是电影社区评分，你已有 MDBList 上游；不把其 CSV、查找入口误写成「Letterboxd 已授权 API」。
- 本地观影清单仅本机，不同步账号；无暗中远程保存用户观看偏好。导出功能只在本机触发文件下载。
- MovieClaw 的 `mclaw` CLI、MCP 均需用户私人实例、权限审批和 Token；任何删除、组织文件或下载操作都不在公共网站进行。

## 需要用户后续提供/申请的项目

| 能力 | 额外条件 |
|---|---|
| JustWatch 官网直连 Provider API、平台直达链接或流媒体热度榜 | JustWatch Content Partner 合作授权与 Token（本次 TMDB 适配器不需要） |
| Letterboxd 账号级评分/清单自动同步 | 官方私有 API 合作批准或用户自行导入/导出 |
| Sofa Time / Showly 个人历史同步 | 用户独立授权和相应应用支持的开放 API；本次不声称已支持 |
| MovieClaw 私人媒体服操作 | 用户自有 NAS / Docker 部署、实例 URL、最小权限 Token，以及许可证合规 |

## 来源

- JustWatch via TMDB 官方文档：https://developer.themoviedb.org/reference/tv-series-watch-providers
- Letterboxd 嵌入与 API：https://letterboxd.zendesk.com/hc/en-us/articles/17815623056911-Can-I-display-or-embed-Letterboxd-ratings-on-my-site-or-app
- Letterboxd CSV 导入字段：https://letterboxd.com/about/importing-data/
- Sofa Time：https://www.sofatime.app/terms.htm
- MovieClaw 文档：https://movieclaw.io/en/docs/overview
- MovieClaw GitHub：https://github.com/movieclaw/movieclaw
