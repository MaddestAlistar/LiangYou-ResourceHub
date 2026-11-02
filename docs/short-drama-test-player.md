# 短剧站内测试播放：独立服务接入与安全说明

页面入口：影视情报中心 → 短剧热播 → 每张卡片标签区右侧「测试」。弹窗不显示视频来源名称，支持选集、iPhone Safari 原生 HLS、非原生浏览器的 HLS.js 以及点击关闭停止播放。

## 已上线的独立 Cloudflare Worker

- 服务：`liangyou-short-drama-playback`
- 健康检查：`https://liangyou-short-drama-playback.maddestalistar.workers.dev/health`
- 作品解析：`GET https://liangyou-short-drama-playback.maddestalistar.workers.dev/api/resolve?workId=<DJHUB_ID>&title=<作品标题>`
- 代码：`labs/short-drama-playback-worker.mjs`
- 部署与冒烟：`.github/workflows/deploy-short-drama-playback.yml`
- 安全测试：`scripts/test_short_drama_playback_worker.mjs`
- 前端配置：`data/short-drama-playback-test.json`，`enabled=true`，指向上述独立 Worker。

部署时先跑测试，必须通过 Cloudflare 账号密钥、健康检查和跨域访问拒绝检查。仅公开 JSON **元数据**，绝不代理视频流或存放视频。入口已连接 Worker；未配置正式的已授权剧集时，作品弹窗会显示「播放服务已连接，但尚未配置可合法使用的视频地址」，这不代表已经可以播放正片。

## 如何配置你拥有播放授权的视频链接

需要合法可嵌入、可直接访问的 HTTPS MP4 或 M3U8，且分片服务器允许浏览器跨域请求。DJHUB Key 仅用于作品资料与评分，**不会自动获得视频播放权限**。

在 GitHub 仓库的 Settings → Secrets and variables → Actions → Repository secrets 新增 Secret：

`AUTHORIZED_DRAMA_STREAMS_JSON`

内容示例（示例域名不能直接播放，请用有授权的媒体域名和实际剧集地址）：

```json
{
  "schema": 1,
  "allowedMediaHosts": ["media.example.org"],
  "works": {
    "mc-demo123": {
      "title": "授权短剧演示",
      "episodes": [
        {"number": 1, "url": "https://media.example.org/episode-1.mp4"},
        {"number": 2, "url": "https://media.example.org/episode-2.m3u8"}
      ]
    }
  }
}
```

将 `mc-demo123` 改成网站 `data/media-short-dramas.json` 中对应作品的 `id`，并确保 `title` 与目录标题完全一致。配置好后在 GitHub Actions → **Deploy verified short drama metadata worker** → Run workflow 手动运行。该工作流会从 Repository Secret 读取 JSON，以 Cloudflare Worker Secret 方式部署，不会把 JSON 写到仓库或日志中。未添加该 Secret，工作流仍可部署，但不会假装存在可播放片源。

为了防止开放代理和泄露私有视频密钥：Worker 仅接受允许域名列表中的 HTTPS MP4/M3U8，不支持任意用户指定的上游地址、含鉴权令牌的 URL、私网主机、内容代理、签名接口；响应不提供任何播放来源品牌。Cloudflare Worker 只返回合法剧集的 direct URL，视频数据由浏览器直接连接已授权媒体 CDN，因此不占用 Worker 代理流量。

## 上传混淆代码的审查结论

上传的 `hongguo-native.obfuscated.js` 仅做了离线静态审查，未执行、未写入 GitHub、未部署。它是约 443KB 单行混淆 Worker，含移动端设备标识、应用请求包装、签名与加解密以及视频流转发代码。因请求目标被混淆、无法证明对第三方私有接口/正片有自动访问与分发授权，不能把「通过语法检查」等同安全且合法可上线。当前部署的是经过单元测试的全新小型 Worker，不含该代码。

需要进一步确认第三方接口授权和具体视频访问许可，才可能接入来源提供的片源；不建议为了播放而复制应用认证参数、逆向生成受限制签名或绕过播放控制。

## 排查

- 打开 `/health`：`ok=true` 和 `videoProxy=false` 表示服务在线；`configured=false` 说明尚无已授权剧集配置。
- 如 `configured=true` 但作品无剧集，核对 `workId`、标题精确匹配、HTTPS 域名及 JSON 集数结构。
- iOS Safari 通常原生支持 HLS；其他浏览器需要 HLS.js 和媒体 CDN 正确的 CORS。
- 任何权限问题只可通过授权的媒体服务解决，不要绕开 DRM、地域访问或鉴权保护。
