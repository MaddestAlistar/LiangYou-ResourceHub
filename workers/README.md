# 图标投稿、审核和发布

- `icon-submit.html` 提交到 `liangyou-icon-review.maddestalistar.workers.dev`。
- 投稿图片和元数据保存在 `MaddestAlistar/Icon-Review-Queue/pending/`。
- `icon-review-admin.html` 使用仅留在本次页面内存中的管理员密钥审核。
- 点击通过后，Worker 校验两份正式订阅，并在 `MaddestAlistar/LiangYou-IconLibrary` 的 **同一个 Git 提交**中写入图片、两份 JSON 和投稿发布凭据。
- 只有正式提交成功且两份订阅重新读取验证通过，才保存已通过状态。网络中断或审核元数据保存失败时，再次通过会读取同一投稿的发布凭据，核对已有图片和索引，不重复入库。
- 旧版已通过记录使用其 `publishedUrl` 核对正式图片和两份索引。没有足够发布证据的旧记录不会自动重复上传。
- 多人同时发布产生分支冲突时，重新读取最新索引并重试，禁止强制覆盖。
- 已发布图标使用独立「下架」按钮，确认后按正式图片 URL 精确移除两份订阅中的记录，同时写入下架凭据，最后保存已下架状态。原图片保留，便于追溯；同名但不同 URL 的图标不受影响，前五个置顶图标受保护。
- 下架失败可重试；正式库已经移除、审核状态尚未保存时，再点下架会核对已有结果。下架凭据会阻止旧页面误点通过而重新入库。「已下架」筛选和「核对下架」可复核结果。
- 下架仅影响订阅目录；客户端需刷新订阅，已下载或已应用的图标不会从用户设备上被远程删除。
- 置顶五个图标保留，其他名称按原规则排序，数字开头放末尾；动态名称包含“动态”和序号。文件名以投稿 ID 唯一标识。
- 后台分批读取审核队列，每批最多 30 条，避免单次请求读取大量记录触及 Worker 子请求限制。

## 部署与校验

Worker 的 `GITHUB_TOKEN` 仅授权审核仓库 Contents 读写；`PUBLISH_GITHUB_TOKEN` 仅授权正式图标库 Contents 读写。`ADMIN_KEY` 至少 24 字符。三者都只能作为 Cloudflare 加密 Secret，不能放入网页或仓库。

GitHub 的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 供部署工作流使用。`workers/**` 变动会先执行 `node --test scripts/test_icon*.mjs`，通过后部署，再检查 `/health` 版本和未认证 `/admin` 返回 401。

回归测试覆盖：真实换行/中文编码、JSON 损坏阻断、图片和双索引原子发布、失败不泄露半成品、并发编辑、重试不重复、旧记录核对、大型 JSON 的 Contents API 回退。

正式图标库另有 `Validate icon subscriptions` 工作流，每次更新及每天检查 JSON 格式、本地图片存在性、置顶一致性和精选库包含于完整库。网页目录统计按原有定时任务同步；客户端需刷新订阅，CDN 缓存可能短暂延迟。
