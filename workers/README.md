# Icon Review Queue 接收服务

此目录提供待审核图标的接收端源码，不会写入正式图标库。

## 首次部署（必须由仓库所有者操作）

1. 在 Cloudflare Workers 创建 Worker，把 `icon-review-worker.js` 作为代码部署。
2. 设置环境变量 `REVIEW_REPO=MaddestAlistar/Icon-Review-Queue`（请核对实际仓库 URL/大小写/连字符）。
3. 设置环境变量 `ALLOWED_ORIGIN=https://maddestalistar.github.io`。
4. 在 GitHub 创建仅授权审核仓库的 fine-grained token，Contents: Read and write；把它作为 Worker 的加密 Secret `GITHUB_TOKEN`，绝对不要写入网页或提交到 GitHub。
5. 在网站端配置 Worker URL，启用真正的自动上传。上线前增加 Cloudflare Turnstile、频率限制与滥用防护。
6. 审核仓库的 `pending/` 目录保存图片及同名 JSON；审核后人工转入正式库。

注意：目前仅提交了 Worker 源码，尚未部署云端 Worker，也未取得任何令牌，因此不能宣称网站已经实现自动上传。当前网站的 GitHub Issue 投稿仍可作为备用流程。
