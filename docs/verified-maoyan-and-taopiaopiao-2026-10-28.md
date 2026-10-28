# 猫眼 / 淘票票真实数据源部署核查（2026-10-28）

本次仅新增独立 Cloudflare Worker、验证脚本与 GitHub Actions 工作流。未修改影视情报中心页面。

## 1. 猫眼：已部署并通过严格的真实数值验证

Worker：https://liangyou-maoyan-verified.maddestalistar.workers.dev

| 接口 | 作用 | 验证结果 |
|---|---|---|
| /api/health | 服务状态，非上游存活证明 | HTTP 200 |
| /api/movie/1294273 | 原始猫眼影片页的片名、评分、评分人数、首周与累计票房 | HTTP 200，片名哪吒之魔童闹海，评分9.8，评分人数3391261，累计票房1544614万元 |
| /api/rankings/alltime | 猫眼专业版公开历史票房总榜 | HTTP 200，300条，第一条电影ID 1294273，累计票房1544614万元 |
| /api/movie/1292052 | 另一个猫眼电影ID，检验缺评分情况 | HTTP 200，影片为荒原女孩，评分和票房为 null |
| /api/movie/invalid | 无效电影ID | 404 |

- 数据只来自猫眼官方公开影片页 https://m.maoyan.com/asgard/movie/1294273 和公开年度/历史总票房页 https://piaofang.maoyan.com/rankings/year 。
- 评分、人数和票房均由真实请求验证，Worker 不填充假数值；未找到字段返回 null 或 502。
- 注意不同平台的电影ID不能混用，例如豆瓣ID 1292052 在猫眼可能指向完全不同的作品。
- 成功响应缓存2小时，fetchedAt 表示本次抓取时间，不代表官方数据最终更新时间。
- Worker 是非官方实验接口，仍需确认猫眼对自动化采集和公开再分发的条款；不承诺官方授权或长期稳定。

代码和记录：

- [源代码](../labs/verified-maoyan-worker.mjs)
- [部署工作流](../.github/workflows/deploy-verified-maoyan.yml)
- [严格验证工作流](../.github/workflows/smoke-verified-maoyan.yml)
- [首次成功部署](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40672578162)
- [最终数据验证通过](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40672852469)

## 2. 淘票票：已核查，当前无符合无 Key、正确评分、可直接部署三项条件的项目

- 官方移动页 https://m.taopiaopiao.com/ HTTP 200；简单公开 HTML 未找到可直接验证的单片真实评分。
- 旧 GitHub 项目 [improvejin/hyspider](https://github.com/improvejin/hyspider) 的淘票票爬虫依赖旧版 dianying.taobao.com 卡片结构；2026年未通过真实数据复测。
- [HowToSaveMyLife/tpp_crawler](https://github.com/HowToSaveMyLife/tpp_crawler) 使用 Selenium、Edge、手动页面操作，主要是影院信息，不是无需凭证的电影评分服务。
- [zhuangjinxin/taopiaopiao](https://github.com/zhuangjinxin/taopiaopiao) 是历史 MTOP 接口文档，没有经过验证的新版免费评分后端。
- 正式推荐申请 [淘宝开放平台](https://open.taobao.com/) AppKey/AppSecret，并确认电影 API 权限。
- [影片评分与想看人数](https://developer.alibaba.com/docs/api.htm?apiId=47077) 使用 taobao.film.alipay.showscorefavor。
- [单片详情](https://developer.alibaba.com/docs/api.htm?apiId=26266) 使用 taobao.film.show.detail.get。

以上官方文档虽然标明开放平台免费或无需用户授权，但仍要求应用 app_key、请求签名，权限可能单独受限。没有密钥就不能声称淘票票评分 API 已部署。

## 数据真实性标准

成功必须同时满足：官方原始页面或授权源可访问、电影 ID 对应影片名称匹配、评分与评分人数有效、单位明确、存在上游来源 URL、异常时不能展示伪造数值。业务成功不能以 HTTP 200 或 README 示例替代。
