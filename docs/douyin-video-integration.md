# 良友科技影视中心 · 抖音精选自动发现与站内播放

## 已接入能力

- **完全不调用 SandBase 或西瓜视频**。视频元数据由 GitHub Actions 在后台刷新，访客仅加载本站静态 JSON 和抖音官方播放器。
- 影视中心电影、电视剧、动漫使用同一个经作品 ID、类型、年份、季数核验的匹配目录。
- **自动发现**：低频查询普通网页搜索引擎已公开索引的抖音精选视频页面（非抖音未授权搜索 API）。按动漫→电视剧→电影轮换，每轮一部作品、一个关键词；后续轮次轮换关键词，避免对搜索索引请求过多。
- **官方验证**：通过无需申请权限的抖音接口 `GET https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id=`，要求 `err_no=0`、`iframe_code` 包含相同 ID 的官方播放器地址；还需标题准确匹配作品，防止同名与跨季错配。
- **站内播放**：正式 iframe `https://open.douyin.com/player/video?vid=<ID>&autoplay=0`，使用你已在 iPhone 上成功验证的 iOS Safari 324×624 竖版适配；不跳原站。
- **保留原有视频源**：B站、YouTube、AcFun、Niconico、Dailymotion 与统一最多 20 条卡片展示规则不变。

## 自动更新计划

`.github/workflows/refresh-media-douyin-videos.yml` 每小时 UTC 的 17 分刷新，最多一天 24 次公开搜索查询，不需要付费 API Key。被搜索引擎限流时本次停止，不重试、不删除现有视频。每次公开索引命中最多向抖音免费 iframe 接口核验 8 个候选 ID，每作品最多保存 4 条已验证视频。

`scripts/refresh_media_douyin_videos.py` 负责目录轮换、公开索引查找、官方核验及元数据写入；`scripts/merge_media_douyin.py` 保留旧视频并防止 GitHub Actions 写入冲突。最终发布数据：`data/media-douyin-verified.json`。

## 重要限制

抖音开放平台的全站视频搜索能力属于**实验能力，当前没有向普通开发者全面开放**；不能把官方 iframe 免费与官方全站搜索免费混为一谈。本项目采用公开网页索引作免费发现，覆盖量会受到搜索引擎索引新鲜度、站点收录范围和频率限制，不保证所有影片都能找到视频。由于抖音官方 iframe 验证与中国大陆真实 iPhone 成功播放属于不同层次，也不保证每条视频永远可播放。

已知抖音官方验证/播放链条对两条《赛博朋克：边缘行者》相关视频成功，现有视频保留。后续自动发现到的新视频必须**同时满足作品准确匹配与官方嵌入权限**才能显示。

官方链接：
- [抖音全站视频搜索（实验能力）](https://partner.open-douyin.com/docs/resource/zh-CN/dop/ability/search-management/item-search)
- [官方免费 iframe 查询](https://partner.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/iframe-player/get-iframe-by-video)
- [GitHub 自动任务](https://github.com/MaddestAlistar/LiangYou-ResourceHub/actions/workflows/refresh-media-douyin-videos.yml)
- [抖音精选站内播放器测试](https://maddestalistar.github.io/LiangYou-ResourceHub/labs/douyin-embed-probe.html)

> 旧 GitHub Secret `SANDBASE_API_KEY` 不再被网站使用。如果以后也不使用该账户，可自行在 GitHub Settings → Secrets and variables → Actions 删除密钥，或在 SandBase 撤销。
