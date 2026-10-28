# 中国电影票房数据服务：部署和申请清单（2026-10-28）

本次只增加实验 Worker、工作流和文档；没有接入或修改影视情报中心页面。

## 已部署：liangyou-cn-cinema-lab

服务：https://liangyou-cn-cinema-lab.maddestalistar.workers.dev

| 接口 | 实测结果 |
|---|---|
| /api/health | 服务状态 HTTP 200 |
| /api/boxoffice | 国内票房榜 80 部，清和 API 主源 / ApiZero 备源 |
| /api/boxoffice?name=神探之痕迹 | 在当前榜单中精确匹配，实测 1 部 |
| /api/global-boxoffice | 全球票房榜 20 部 |
| /api/global-boxoffice?name=阿凡达 | 在全球榜单精确匹配，实测 1 部 |

接口匹配只是从当前/全球榜单寻找电影；不提供任意电影的完整历史票房。没有匹配不等于票房为零。

- [Worker 源码](../labs/cn-cinema-worker.mjs)
- [部署工作流](../.github/workflows/deploy-cn-cinema-lab.yml)
- [测试工作流](../.github/workflows/smoke-cn-cinema-lab.yml)
- [首次成功发布](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40671112280)
- [首次真实数据测试](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/runs/40671148948)

## 无法匿名直接提供的能力

- 任意猫眼电影 ID 的真实评分/评分人数：原 Ahua Worker 返回评分 null，本次不伪造评分。
- 任意老片完整历史累计票房/逐日票房：当前榜单不覆盖。
- 淘票票评分/想看和灯塔开放数据：阿里网关要求 AppKey、签名及可能的业务权限。

## 你需要自行申请的账号（按优先级）

| 申请对象 | 必要性 | 用途 |
|---|---|---|
| [淘票票/淘宝开放平台](https://open.taobao.com/) | 高 | 申请 AppKey、AppSecret 和电影 API 权限：影片评分/想看/详情/票房 |
| [Parse Maoyan](https://parse.bot/marketplace/56a80a57-56f6-4465-9029-877f8b42a0a9/m-maoyan-com-api) | 想要猫眼评分时考虑 | 账户及 credits；需取得授权后真实测试，尚未实测可用 |
| [接口盒子](https://www.apihz.cn/article/5678e65ef1b2a11c03ad1347089c4168.html) | 可选 | 自己的 ID/Key，避免公共测试凭证共享限额 |
| [ApiZero](https://apizero.cn/aidocs/movie-box) | 可选 | 匿名可试，长期调用建议独立 Key |
| [起零数据](https://api.istero.com/service/doc/maoyan-box-office) | 可选 | 多来源国内票房数据备份 |

阿里值得申请的接口：

- [影片评分与想看人数](https://developer.alibaba.com/docs/api.htm?apiId=47077)
- [影片详情](https://developer.alibaba.com/docs/api.htm?apiId=26266)
- [当日票房榜](https://developer.alibaba.com/docs/api.htm?apiId=33069)
- [灯塔开放数据](https://developer.alibaba.com/docs/api.htm?apiId=70103)

注意：阿里文档标识开放平台免费/不需要授权不等于无需 AppKey 和签名。所有密钥应放在 GitHub Secrets，不能写在公开网页里。

## 上线前建议

- 第三方公共接口返回票房不意味着拥有版权/再分发许可；公开商业展示前确认条款。
- Worker 仅缓存成功结果 30 分钟，不把暂缺的评分与票房归零。
- retrievedAt 表示响应获取时间，不代表上游数据更新时间。
