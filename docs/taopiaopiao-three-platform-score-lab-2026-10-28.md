# 良友科技：淘票票第三方评分 / 中国电影票房 API 实验（2026-10-28）

**部署位置：** https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev

**性质：** 独立 Cloudflare Worker，只对外提供第三方汇总数据。没有修改 LiangYou-ResourceHub 的页面、路由、影视情报中心；没有申请、存储或使用淘票票官方 AppKey。

## 真实数据来源与限制

- 来源：`https://zgdypf.zgdypw.cn`，一个汇总国内电影票房和猫眼、豆瓣、淘票票评分的第三方网站。数据并非淘票票官方开放 API 或经其认证的直连数据。
- 它的影片详情 HTML 含 `window.__INITIAL_STATE__` JSON，其中 `movieInfoData.scores` 可出现 `猫眼购票评分`、`豆瓣评分`、`淘票票评分`；同页 `movieBoxSum` 可能给出累计、首日、首周票房。
- 测试 3 个电影页面：捕风追影（猫眼9.5/豆瓣8.2/淘票票9.7）、浪浪山小妖怪（9.5/8.5/9.5）、拼桌（8.0/6.2/淘票票无评分）。经 GitHub Actions 确认 HTTP 200、电影标题匹配，缺失的评分不是0而是 null。
- JSON 接口 `getYearData?year=2025` 返回300条；`getYearData?year=2026` 返回300条；`getDayData?date=2026-10-27&withSvcFee=true` 返回118条。HTTP和数据量均经过 GitHub Actions验证。
- 这些数据来自**第三方汇总展示**：我们验证了接口与源网页显示一致，没有逐条与淘票票、猫眼及豆瓣各自官方平台交叉验证，也未取得数据公开再分发授权。上线前应核实网站条款和源数据许可。

## 新部署的 API

| 请求路径 | 功能 | 示例 |
|---|---|---|
| `/api/health` | 服务说明（不是上游数据可用性证明） | https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/api/health |
| `/api/movie/{code}` | 单片三平台评分 + 累计/首日/首周票房 | https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/api/movie/00102032025 |
| `/api/year?year=2025` | 年度前300的电影名称、电影编码、票房 | https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/api/year?year=2025 |
| `/api/day?date=2026-10-27` | 指定日期的票房排行榜 | https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/api/day?date=2026-10-27 |
| `/api/search?year=2025&name=哪吒之魔童闹海` | 按影片名称精确匹配该年榜单，返回电影编码和详情查询路径 | https://liangyou-taopiaopiao-lab.maddestalistar.workers.dev/api/search?year=2025&name=%E5%93%AA%E5%90%92%E4%B9%8B%E9%AD%94%E7%AB%A5%E9%97%B9%E6%B5%B7 |

所有 API 只支持 GET，不会携带认证 Cookie，不设反爬绕过；合法年份为2017年至当年，日期须为合法日期，不允许未来日期。请求结果只有真实有效的业务数据才缓存，正常响应缓存2小时，上游失败直接返回502，永不制造评分或票房。

`/api/search` 只查询指定年度榜单前300名，因此未匹配不代表电影不存在。影片 code 是这个第三方站点的编码，不能当成猫眼、豆瓣或淘票票的电影 ID 使用。

## 代码和验收记录

- [原始 Worker 源码](../labs/taopiaopiao-aggregate-worker.mjs)
- [自动部署 Workflow](../.github/workflows/deploy-taopiaopiao-aggregate-lab.yml)
- [严格数据验收 Workflow](../.github/workflows/smoke-taopiaopiao-aggregate-lab.yml)
- [三个影片直接取源数据的初轮验证](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40673390066)
- [票房两个年度+一日接口验证](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40673561839)
- [第一版 Worker 成功部署](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40673914263)
- [第一版6项校验全部成功](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40673957532)

## 如需官方授权的替代方案

淘宝开放平台：https://open.taobao.com/

- 淘票票影片评分/想看接口：https://developer.alibaba.com/docs/api.htm?apiId=47077
- 淘票票影片详情接口：https://developer.alibaba.com/docs/api.htm?apiId=26266
- 这些接口需要自己的 AppKey、AppSecret 和符合开放平台权限条件的签名请求。**不要将密钥写入公开仓库。**
