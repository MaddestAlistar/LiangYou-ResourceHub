# 影视情报中心 · API 利用情况与界面整合检查（2026-10-28）

本文件记录代码使用情况及已观察的 GitHub Actions 验收结果。代码接入成功与每部作品都有数据是两件事。密钥始终由 GitHub Actions 或 Cloudflare Worker 私密环境注入，不进入浏览器源代码。

## 六分类已使用的来源

| 类别 | 数据来源 | 处理方式 |
| --- | --- | --- |
| 评分 | TMDB、TVmaze、Trakt、Bangumi、AniList、OMDb、MDBList | 构建时采集；按可验证作品 ID 合并，保留各评分原尺度 |
| 评分补充 | Kitsu、Simkl、B站番剧、Filmarks、猫眼、MyDramaList、国内三平台汇总 | 独立原站 ID 查询，不自动拼接电影标题 |
| 动画评分与资料 | MyAnimeList v2 | 本轮新增 Worker /api/anime/mal/{malId}；只有准确 MAL ID 才显示排名、评分、工作室等 |
| 作品档案 | TMDB、TheTVDB、Fanart.tv、Wikidata | 精确 TMDB/TVDB/Wikidata 标识补充；TheTVDB score 不当作观众评分 |
| 人物关系 | TMDB Credits、Wikidata ID | 根据人物 ID 关联站内作品，避免同名人物串档 |
| 票房 | 猫眼、国内第三方汇总、OMDb、KOFIC | 币种、地区、统计日期不同，不能求和；KOFIC 使用核验过的每日快照优先 |
| 播放与字幕 | JustWatch via TMDB、Watchmode、OpenSubtitles、assrt.net | 国家/地区独立显示；字幕搜索仅是索引，不是播放链接 |
| 视频资讯 | TMDB Videos、YouTube Data API v3、The Guardian | 本轮升级为预告片卡片与新闻图文；新视频必须有准确 YouTube ID |
| 相似题材 | TMDB 推荐、TasteDive | TMDB 有 TMDB ID 可站内跳转；TasteDive 仅名称级实验，不当作精确匹配 |

## 这轮新增与改造

1. **iPhone 电影卡片**：强制统一海报比例、标题高度、按钮底边和评分内容容器。页面上实际分值数量可以不同，不需要填假数据。
2. **YouTube Data API v3**：先使用 TMDB 提供的真实 YouTube 视频 ID，再用 videos.list 验证视频公开状态、是否允许嵌入、频道、时长和播放量。无官方视频时，有限额度尝试搜索，所有候选必须标注“搜索候选，未核实官方”。点击视频卡片后才创建 iframe；阻止自动播放请求和首屏大规模嵌入。
3. **Guardian Open Platform**：保留片名匹配，加入栏目、日期、缩略图和简短摘要，不复制新闻全文。通过影片名称搜索的结果不保证是同一作品，需要保留来源提示。
4. **MAL v2**：根据 MAL 原站数字 ID 请求评分、参与评分人数、排名、人气排名、制作公司和集数；准确原站 ID 是硬性要求。
5. **韩国票房**：GitHub Actions 获取 KOFIC 官方最近日榜，保留验证时间；浏览器优先读取小型静态 JSON。Worker 回源受阻或过期时不造假。

## 已核实状态与暂不启用项

- 2026-10-28 的 GitHub Actions 示例（电影 TMDB 550、剧集 TMDB 1399）显示 YouTube enrichment 成功。Guardian 对电影样本有结果、剧集样本无匹配：**无匹配不等于 API 故障**。
- 两个样本的 TasteDive 结果均显示 unavailable：不能把它列为已稳定投入使用。保留短超时的实验适配，不在主界面预留空卡。
- Jikan v4、GDELT 因前期限流/不稳定不作为基础依赖；无准确映射时不自动跨站合并。
- Box Office History、TheIntroDB、Apple iTunes / Apple TV Feed、其他新部署实验接口：在未证明真实字段、合法使用范围、准确身份对应和连续可用前，暂不写入正式作品档案。
- 影视评分和好看程度不同于 TheTVDB 热度、MyAnimeList 人气序号、票房、观看渠道数量，以上指标均单独展示。

## 额度和质量

- **按需加载**：仅进入具体作品的资讯推荐时请求 YouTube/Guardian；Worker 对相同作品缓存，避免列表滚动就消耗视频和资讯配额。
- **YouTube**：搜索受独立日配额约束；优先调用 videos.list 取已有精确 ID 的元数据，降低搜索消耗。官方开发者文档：https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- **Guardian**：Developer 计划面向非商业使用；应核对站点的使用性质、许可与缓存/展示要求。官方文档：https://open-platform.theguardian.com/documentation/
- **内容安全**：仅显示经过白名单校验的 HTTPS 缩略图/链接，文本转义，视频 ID 严格校验，密钥不下发。
- **客户端**：在手机端采用两列预告片和单列新闻卡；不自动加载全部 iframe，保留外站打开入口。
- **失效回退**：任何可选接口失败，都不影响 TMDB 主档案和原有评分；没有分数就写暂无，不补零、不猜测。
