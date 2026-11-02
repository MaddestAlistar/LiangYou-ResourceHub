# 短剧站内测试播放（隔离实验）

测试入口位于「影视情报中心 → 短剧热播」的每张卡片标签区右侧。点击「测试」打开站内弹窗，支持 `<video playsinline>`、关闭时停止播放、选集、Safari 原生 HLS 和其他可用浏览器的 HLS.js 降级播放。弹窗不显示视频提供方名称或跳转来源入口。

## 当前状态

用户提供的 `hongguo-native.obfuscated.js`（约 443 KB）经静态检查包含 `createHandler`、`fetch` 和 `/v1/episodes/:id/stream` 等服务端处理路径，输出为 Worker 的请求处理程序，不是视频文件或可放在 GitHub Pages 直接执行的浏览器播放器。它还含有混淆的网络与签名/解密逻辑，未经功能和安全审核不能直接放进公开网页，也不能据此推断具体剧集有播放权限。

当前只提交了安全的前端弹窗与播放适配层；**没有**上传、执行或发布这份混淆源文件，也没有伪造视频资源。没有经过验证的服务端可播放地址，播放器会明确提示未配置服务，而不会伪装播放成功。

## 适配协议（将来对接独立、经过审核的 Worker）

仓库公开文件 `data/short-drama-playback-test.json` 为：
```json
{"schema":1,"enabled":false,"resolveEndpoint":""}
```
只有后台服务真实上线、合法可用并经过测试时，将 `enabled` 设为 `true`，把 `resolveEndpoint` 填为独立服务的**完整 HTTPS 查询 URL**。**不要**把任何 API 密钥、签名或私密令牌写进这份公开 JSON。

用户点击后，浏览器以 GET 方式请求 `resolveEndpoint?workId=<DJHUB id>&title=<作品标题>`，接受以下响应：
```json
{
  "episodes": [
    {"number":1,"label":"第1集","url":"https://example.com/episode-1.mp4","mime":"video/mp4"},
    {"number":2,"label":"第2集","url":"https://example.com/episode-2.m3u8","mime":"application/vnd.apple.mpegurl"}
  ]
}
```
响应中只能包含可以直接访问的 HTTPS 电影/短剧资源地址，且必须具有对应播放授权。浏览器将从媒体源直接播放，GitHub Pages 不转发视频字节；跨域 HLS 分片必须有适当 CORS 配置。遇到无权限、无匹配或链接失效，保留明确失败反馈。

**重要**：DJHUB 的短剧资料 ID 并不保证等于外部播放来源的内部剧集 ID；需要由可信适配服务核对标题/作品身份与剧集索引，不能将资料 ID 直接当作内部视频 ID。

## 验证

- `node --check media-shortdrama.js && node --check media-shortdrama-player.js`
- `node --test scripts/test_short_drama_player.mjs`
- 检查 iPhone Safari 上入口不遮挡卡片标签、弹窗关闭会清空视频、HLS 仅在点击选集后加载。
