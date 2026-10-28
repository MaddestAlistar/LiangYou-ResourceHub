# 中国影视 API 资源审计（2026-10-28）

本报告来自 GitHub Actions 的 32 项只读匿名 GET 测试。结果仅代表当时出口，HTTP 200 不代表可用业务数据。

复测入口：[测试脚本](../scripts/probe_china_media_sources.py) · [GitHub Actions 工作流](../.github/workflows/audit-china-media-apis.yml) · [本次运行](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40667674609)。

## 32 项结果

| 来源 | HTTP | 结果 | 条目 | 地址 |
|---|---:|---|---:|---|
| 60s: 豆瓣电影周榜 | 200 | 有效数据 | 10 | https://60s.viki.moe/v2/douban/weekly/movie |
| 60s: 豆瓣华语剧集 | 200 | 有效数据 | 10 | https://60s.viki.moe/v2/douban/weekly/tv_chinese |
| 60s: 豆瓣全球剧集 | 200 | 有效数据 | 10 | https://60s.viki.moe/v2/douban/weekly/tv_global |
| 60s: 豆瓣华语综艺 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/douban/weekly/show_chinese |
| 60s: 豆瓣全球综艺 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/douban/weekly/show_global |
| 60s: 猫眼实时票房 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/maoyan/realtime/movie |
| 60s: 猫眼全球票房 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/maoyan/all/movie |
| 60s: 猫眼网剧热度 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/maoyan/realtime/web |
| 60s: 猫眼电视收视 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/maoyan/realtime/tv |
| 60s: 百度电视剧榜 | 429 | 429 或异常 | 0 | https://60s.viki.moe/v2/baidu/teleplay |
| 自建豆瓣新片榜 | 200 | 有效数据 | 10 | https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/chart |
| 自建豆瓣 Top250 | 200 | 有效数据 | 25 | https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/top250?page=1 |
| 自建豆瓣正在热映 | 200 | 有效数据 | 71 | https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/nowplaying |
| every.film: 公开媒体详情 | 400 | 接口无数据 | 0 | https://every.film/api/v1/media/70523/detail |
| every.film: API schema | 404 | 未通过 | 0 | https://every.film/openapi.json |
| bookyo: douban-imdb 服务 | 无响应 | 未通过 | 0 | https://movie.querydata.org/api?id=1292052 |
| MoviePilot: 公开 API 详情 | 404 | 未通过 | 0 | https://api.movie-pilot.org/api/v1/douban/1292052 |
| ApiZero: 实时电影票房 | 200 | 有效数据 | 10 | https://v1.apizero.cn/api/movie-box |
| 自建豆瓣周榜 | 200 | 有效数据 | 10 | https://liangyou-douban-movie-api.maddestalistar.workers.dev/api/weekly |
| MoviePilot: 公开 Top250 | 404 | 未通过 | 0 | https://api.movie-pilot.org/api/v1/recommend/douban_movie_top250 |
| MoviePilot: 开放文档 | 200 | 网页可访问 | 1 | https://api.movie-pilot.org/ |
| ApiZero: 豆瓣电影详情 | 200 | 有效数据 | 1 | https://v1.apizero.cn/api/douban-movie?id=1292052 |
| every.film: 文档 | 200 | 网页可访问 | 1 | https://every.film/zh-CN |
| 悦享数据: 豆瓣榜单 | 无响应 | 未通过 | 0 | https://v.apiopt.com/api/v1/live/douban/movie/rank |
| 起零数据: 猫眼票房 | 400 | 未通过 | 0 | https://api.istero.com/resource/v1/maoyan/movie/top |
| WMDB: OpenAPI | 404 | 未通过 | 0 | https://wmdb.tv/openapi.json |
| WMDB: 站点 | 200 | 网页可访问 | 1 | https://wmdb.tv/zh |
| Wikidata: 实体关联 JSON | 200 | 有效数据 | 1 | https://www.wikidata.org/wiki/Special:EntityData/Q172241.json |
| Wikidata: Action API | 200 | 有效数据 | 1 | https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q172241&props=claims&format=json |
| 聚合数据: 中国票房 | 200 | 仅有 JSON，未验证数据 | 1 | https://apis.juhe.cn/fapig/boxoffice/query |
| 豆瓣旧版官方 API | 403 | 403/鉴权 | 0 | https://api.douban.com/v2/movie/subject/1292052 |
| 猫眼第三方 nxvav | 404 | 未通过 | 0 | https://api.nxvav.cn/api/maoyan/movie/ |

## 已部署服务

- 豆瓣榜单 Cloudflare Worker：https://liangyou-douban-movie-api.maddestalistar.workers.dev — Top250、新片、周榜、热映四项有数据。
- 60s 影视专用独立 Worker：https://liangyou-film-60s.maddestalistar.workers.dev — 仅公开影视相关路径，部署成功；路由数据需查看 [烟测](../.github/workflows/smoke-film-60s.yml)。

## 确需账号或凭证的选项

| 服务 | 申请要求 | 官方入口 |
|---|---|---|
| ApiZero | 匿名 5 次/日可测试；长期/高频需注册 Key | https://apizero.cn/aidocs/douban-movie |
| 悦享数据 | 开发者账号、实名认证和 api_key | https://www.yxsdk.net/server/details/144.html |
| 起零数据 | 开发者账号和 Token | https://api.istero.com/service/doc/maoyan-box-office |
| 聚合数据 | 申请电影票房 API Key | https://www.juhe.cn/docs/api/id/44 |
| 阿里影业灯塔 | 开发者注册并获具体接口权限 | https://developer.alibaba.com/docs/api.htm?apiId=51843 |
| every.film | 只读无需 Key；写入或 TMDB 兼容面需经审批 | https://every.film/api-terms-of-use |
| MoviePilot | 需自行部署并配置自身服务的身份验证，不是通用公共 Key | https://github.com/jxxghp/MoviePilot |

## 开源 GitHub 项目可部署性

- [yufeng-liang/douban-movie-api](https://github.com/yufeng-liang/douban-movie-api)：已独立部署验证，四种排行榜；HTML 解析方案需容错。
- [vikiboss/60s](https://github.com/vikiboss/60s)：支持 Workers / Docker，MIT 协议；公开实例限流，已另建影视专用 Worker。
- [kfstorm/douban-idatabase](https://github.com/kfstorm/douban-idatabase)：FastAPI + 数据库 + 可选 Redis，偏向独立服务器，不适合 GitHub Pages。
- [jxxghp/MoviePilot](https://github.com/jxxghp/MoviePilot)：完整 NAS 媒体库管理服务，无法把 Swagger 文档当无需认证 API。
- [bookyo/douban-imdb-api](https://github.com/bookyo/douban-imdb-api)：仅 README，无可部署源码；示例服务未连通。

## 注意

- 60s 在首次三项成功后出现连续 429，应按限流处理，不能直接判定七个源 API 自身故障。
- WMDB 主页可达但未发现公开 OpenAPI；every.film 本轮示例详情 400；悦享榜单域名连通失败。
- 第三方返回豆瓣/猫眼数据，不代表拥有公开展示、再分发、商业授权。正式接入前确认条款。
- 本轮只建立测试与部署，不更改影视情报中心前端。


## 自建 60s 影视专用 Worker 二次验证

通过 [GitHub Actions smoke test](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40668118357) 在 2026-10-28 UTC 检测：

| 路由 | HTTP | 数据量 | 结果 |
|---|---:|---:|---|
| /v2/douban/weekly/movie | 200 | 10 | 可用 |
| /v2/douban/weekly/tv_chinese | 200 | 10 | 可用 |
| /v2/douban/weekly/tv_global | 200 | 10 | 可用 |
| /v2/douban/weekly/show_chinese | 200 | 8 | 可用 |
| /v2/douban/weekly/show_global | 200 | 10 | 可用 |
| /v2/baidu/teleplay | 200 | 10 | 可用 |
| /v2/maoyan/realtime/movie | 超时 | 0 | 不可用 |
| /v2/maoyan/all/movie | 500 | 0 | 不可用 |
| /v2/maoyan/realtime/web | 超时 | 0 | 不可用 |
| /v2/maoyan/realtime/tv | 500 | 0 | 不可用 |
| /v2/60s (未开放) | 404 | 0 | 白名单正确阻断 |

**结论：** 自建 60s 解决了公共实例对于豆瓣周榜及百度剧集榜的限流；并没有解决四个猫眼数据源的故障。后续国内实时票房优先使用本轮匿名测试成功的 ApiZero 票房接口。
