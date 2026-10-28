# 良友科技 · 五平台影视评分 API 实测与独立部署（2026-10-28）

本次独立部署：**https://liangyou-extra-ratings-lab.maddestalistar.workers.dev** 。未修改 `index.html`、`media-intel.js`、`media-intel.css`，没有把五家直接并入正式影视情报中心。

## 1. 已验证的真实评分路径

| 平台 | 示例 API | 首轮/复测结果 | 数据源性质 |
|---|---|---|---|
| Simkl | `/api/simkl/10280` | 7.9/10，7,468票；HTTP 200 | Simkl 官方评分 API，Client ID 存 Cloudflare Worker Secret |
| Kitsu | `/api/kitsu/anime/1` | Cowboy Bebop 82.28/100；HTTP 200 | Kitsu 动漫公开 JSON API；返回 `libraryUserCount` 而**不是评分人数** |
| B站番剧 | `/api/bilibili/season/26801` | 鬼灭之刃 9.7/10，409,192人评分；HTTP 200 | B站官方公开番剧 API；Cloudflare 回源返回 412，使用 GitHub Actions 验证快照备用 |
| MyDramaList | `/api/mydramalist/drama/58651-run-on` | Run On (2020) 8.1/10；HTTP 200 | 第三方教育用途开源 API，不是 MyDramaList 官方授权 API |
| Filmarks | `/api/filmarks/movie/14348` | 哈利·波特与魔法石 4.1/5；HTTP 200 | Filmarks 官网公开电影页 JSON-LD 评分，**非官方 API** |

其他验证：B站 `/api/bilibili/season/42290` 8.1 分、1381 人评分；Filmarks `/api/filmarks/movie/16650` 3.9/5；非法 Kitsu ID 404。缺失评分返回 null 或上游出错时 502，不造假。

## 2. 路径和 ID

- `GET /api/health` — Worker 服务状态，不代表上游数据实时有效。
- `GET /api/simkl/{simkl_id}` — Simkl ID，任意合理的数字 ID；使用 Worker Secret 而不暴露 Client ID。
- `GET /api/kitsu/anime/{kitsu_id}` — Kitsu 动漫 ID，/100，用户入库人数与评分人数不能混淆。
- `GET /api/bilibili/season/{season_id}` — B站季度 ID，评分 /10。目前对已缓存的 `26801`,`42290` 可在 Cloudflare 封禁直连时返回真实验证快照；其他 ID 若源站仍 412，将返回 502，不代表作品无评分。
- `GET /api/mydramalist/drama/{slug}` — MyDramaList 数字加英文 slug，例如 `58651-run-on`，评分 /10；复用教育用途第三方项目公开 API。
- `GET /api/filmarks/movie/{movie_id}` — Filmarks 影片 ID，评分 /5。目前 `14348`,`16650` 有两份验证快照；其他电影 ID 仅在 Cloudflare 直接读取官网 JSON-LD 成功时可用。

所有平台的 ID 相互独立，不能将 TMDB、IMDb、豆瓣 ID 当成 Simkl/Kitsu/B站/Filmarks ID。对外正式显示需要可信 ID 映射，严禁仅凭模糊片名拼接不同电影的评分。

## 3. B站和 Filmarks 定时备用快照

- [数据文件](../data/bilibili-filmarks-ratings.json)
- [采集代码](../scripts/update_bilibili_filmarks_ratings.py)
- [定时工作流](../.github/workflows/update-bilibili-filmarks-ratings.yml)：UTC 每 12 小时，独立更新，验证全部四个目标才覆盖以前数据；任何验证失败不会写出新的错误快照。
- Cloudflare Worker 仅接受近48小时的快照；更旧时返回 502，不会显示过期数据为当前分数。

## 4. 独立 Worker 部署

- [Worker 源码](../labs/extra-film-ratings-worker.mjs)
- [Cloudflare 部署工作流](../.github/workflows/deploy-extra-film-ratings.yml)
- [严格数据测试工作流](../.github/workflows/smoke-extra-film-ratings.yml)
- [五平台全部成功的严格验证](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40677962757)
- [首次直接来源探测](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40676890987)
- [Simkl GitHub Variables 补充验证](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40677018952)
- [Filmarks 官方页面公开评分结构验证](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40677791649)

## 5. 质量和合规约束

- Simkl 需遵守 API 使用限制及来源链接/署名要求，尤其是在与其他影视追踪类服务共同使用时。
- Kitsu 来源为 anime Kitsu (`kitsu.io`/`kitsu.app`)，不是影视制作生产管理领域的同名 Kitsu。
- B站公开接口不等于允许无限量转发；不要尝试绕过源站的 412 限制。已设置低频 GitHub Actions 后台快照。
- Filmarks 来源是其官方公开网页评分，不是经授权的正式 API，也不意味着获得公开再分发许可。
- MyDramaList 第三方服务标注 educational use only，不得把第三方示例服务当作企业级正式授权接口。
- 独立服务对正常结果缓存6小时，只对通过原始 ID、片名和分数范围验证的数据返回 200。
- 后续接入公开网站前还要确认各数据源使用条款、用户访问体验、来源署名、地区政策和高流量风险。

**此阶段只有独立评分 API 与示例快照，尚未整合进影视情报中心网页。**
