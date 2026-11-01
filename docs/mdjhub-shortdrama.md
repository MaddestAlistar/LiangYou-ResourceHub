# MDJ Hub 短剧热播接入

入口：影视情报中心 → 短剧热播。导航是四列两排；第二排最右侧为“敬请期待”扩展预留位。

## 安全配置

1. 仓库 Settings → Secrets and variables → Actions → Secrets 添加 `MDJHUB_API_KEY`。
2. 同页 Variables 添加 `MDJHUB_API_URL`，值必须是 MDJ Hub 开发者文档给出的**完整 HTTPS 短剧榜单 GET 接口**。不能使用 `/developer/apply` 申请页代替接口地址。
3. 默认以 `Authorization: Bearer <key>` 调用；如果官方文档要求 `X-API-Key`，再增加 Variable `MDJHUB_AUTH_MODE=x-api-key`。
4. 在 Actions → Refresh MDJ Hub short drama listings → Run workflow 手动执行一次验证。

**目前没有核实到 MDJ Hub 的真实榜单 API 路径和响应字段。** 仅配置 Key 无法猜测 API URL。拿到服务端示例请求后应核对请求方法、授权格式、字段，再进行端到端验证。不要把 Key 贴到 Issue、网页前端或公开代码里。

## 数据与更新

- `scripts/refresh_short_drama.py` 只在 GitHub Actions 中读取 Key，把验证后的公开元数据存入 `data/media-short-dramas.json`。不发布密钥、原始接口响应或包含敏感查询参数的地址。
- `.github/workflows/refresh-short-drama.yml` 每天北京时间约 01:23 和 13:23 尝试更新，可手动运行；调度实际时间可能延迟。
- 只有成功获得至少一条合法记录才覆盖快照；失败保留旧数据。
- 网站支持热播榜、最新上新、真人短剧、AI 短剧、漫剧、关键词筛选；在没有合法接口数据前只显示待同步状态，绝不伪造热度、排名或作品。
- 当前仅展示公开作品资料及来源链接，不实现短剧视频流中转和未授权播放。

验证：`python -m py_compile scripts/refresh_short_drama.py`，查看 Action 日志中 `SHORT_DRAMA_UPDATED` 和公开 JSON 的 `status: ok`。
