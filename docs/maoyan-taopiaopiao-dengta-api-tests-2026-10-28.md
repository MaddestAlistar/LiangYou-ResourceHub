# 猫眼 / 淘票票 / 灯塔接口实验记录（2026-10-28）

> 此记录为实际测试，不是网页接入。此次仅新增 GitHub Actions 测试文件与独立 Cloudflare Worker，未改动影视情报中心的 JavaScript、CSS、HTML。

## 部署的独立猫眼 Worker

- 来源仓库：[Ahua9527/maoyan_movie_api_cf](https://github.com/Ahua9527/maoyan_movie_api_cf)，固定源码提交 `c91dfe2f5850c2b766d7701d66915586cd0d07c2`。
- 测试服务：`https://liangyou-maoyan-lab.maddestalistar.workers.dev`，独立 Worker，未使用作者的 KV 命名空间。只开放 `/api/status` 与数字形式 `/api/movie/<id>`，成功的电影数据在 Cloudflare 边缘缓存。
- [部署运行记录](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40669249638)：部署成功。
- [烟测记录](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40669341296)：状态 200，影片 `1294273` 200（《哪吒之魔童闹海》）；票房为“未找到票房数据”，猫眼/IMDb 评分为 null，**仅基础影片详情有效**。错误路径 `/api/movie/not-a-movie` 正确返回 404。

## 公共与第三方票房源

| 来源 | 状态 | 数据量 | 申请要求 | 示例 |
|---|---|---:|---|---|
| 清和 API 猫眼票房 | HTTP 200，JSON `movieList` 有效 | 80 | 匿名 | https://api.qhsou.com/api/maoyan.php |
| 清和 API 全球影史票房 | HTTP 200，JSON `movies` 有效 | 20 | 匿名 | https://api.qhsou.com/api/qqys.php |
| 清和 API 豆瓣 Top 250 | HTTP 200，数据有效 | 250 | 匿名 | https://api.qhsou.com/api/douban.php |
| ApiZero 票房 | HTTP 200，字段 `data` 返回有效数据 | 10 | 匿名试用，长期 Key | https://v1.apizero.cn/api/movie-box |
| 接口盒子猫眼综合票房 | HTTP 200，公共示例 ID/Key 返回业务代码 200 | 80 | 公共共享凭证有频次上限，正式申请自己的 | https://www.apihz.cn/article/5678e65ef1b2a11c03ad1347089c4168.html |
| 骁拓云猫眼实时票房 | 无 Key 请求返回 404 | 0 | 申请 API Key | https://api.xiaotuo.net/?id=149&mod=doc |
| Ahua 公共猫眼详情 | 返回真实影片基础资料 | 1 | 演示端无需 Key | https://maoyan.ahua.space/api/movie/1294273 |

ApiZero 实测响应中更新时间为北京时间 2026-10-28 16:37:12。清和 JSON 没有同等可核验的更新时间，不应直接宣称它是实时更新。数值真实性仍应与原始票房平台抽样核对。

## 淘票票 / 灯塔

- 淘宝开放 API 网关 `https://eco.taobao.com/router/rest` 可连接，但未提供 Key 时业务错误响应 `code=28` / `Missing app key`，故**未完成实际票房业务验证**。
- [今日票房排行榜 API](https://developer.alibaba.com/docs/api.htm?apiId=33069)
- [大盘票房 API](https://developer.alibaba.com/docs/api.htm?apiId=30258)
- [热映及即将上映 API](https://developer.alibaba.com/docs/api.htm?apiId=69080)
- [淘票票票房汇总 API](https://developer.alibaba.com/docs/api.htm?apiId=58116)
- [灯塔数据开放查询 API](https://developer.alibaba.com/docs/api.htm?apiId=70103)
- 上述文档在本轮 HTTP 200 可打开，但需要自己的阿里开发者 AppKey、AppSecret、签名，有些业务还可能要求权限申请；文档标“免费/不需要授权”不代表匿名可调用。

## 测试脚本与复测

- [无 Key 连通性测试脚本](../scripts/probe_cn_boxoffice_sources.py)
- [无 Key GitHub Actions](../.github/workflows/probe-cn-boxoffice-sources.yml)
- [影片 Worker 部署工作流](../.github/workflows/deploy-maoyan-lab.yml)
- [自建 Worker 烟测工作流](../.github/workflows/smoke-maoyan-lab.yml)

**上线建议**：先确认各数据源对公开再分发、缓存、商用的许可；正式使用时以业务数据有效和更新时间为准，不以 HTTP 200、服务状态页或 README 示例作为成功依据。
