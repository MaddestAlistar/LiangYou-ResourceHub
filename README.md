# 良友资源中心 · LiangYou Resource Hub

由 **良哥看未来** 维护的 App 资源导航站。首页可互动体验 3D Logo，并集中查看媒体徽章、原创图标和汇流主播单。

**[打开网站](https://maddestalistar.github.io/LiangYou-ResourceHub/)** · **[良友科技学院 / Telegram](https://t.me/liangyouuniversity)** · **[小红书 / 良哥看未来](https://xhslink.cn/o/8SW6tCkrHad)**

## 已上线资源

| 资源 | 内容 | 原仓库 |
| --- | --- | --- |
| 媒体徽章库 | 简易版（原 EplayerX）、合成徽章版（原 OopsPlayer BF3）、复杂版 V12 | [liangyou-appletv-badges](https://github.com/MaddestAlistar/liangyou-appletv-badges) |
| 媒体图标库 | 影视与音乐服务图标；支持流云音乐换图标；7,388 枚图标，精选与专属版 113 枚 | [LiangYou-IconLibrary](https://github.com/MaddestAlistar/LiangYou-IconLibrary) |
| 频道库 | 3,480 个直播间、16 个平台、24 个内容分区；原 2,081 条头像库保留 | [LiangyouChannels](https://github.com/MaddestAlistar/LiangyouChannels) |

数量核对日期：**2026-10-23**。资源链接及数量依据原仓库 README 和正式 JSON 核对；后续实际数量以原仓库为准。导航站不搬迁资源，也不改变用户已经添加的订阅地址。

## 互动 3D Logo

首页顶部新增可交互的 3D Logo 展示，**网站自己托管** `interactive/logo/index.html`，不依赖 3D-Logo 项目的 Pages 是否开启。拖动旋转、点击发光、自动转动、手机触屏均保留；手机为避免内嵌画面截获页面滚动，需要先点「轻触开启 3D 交互」，操作后可以结束互动继续浏览。

- **[3D 全屏体验](https://maddestalistar.github.io/LiangYou-ResourceHub/interactive/logo/)**
- **[3D Logo 源仓库及 GLB 模型](https://github.com/MaddestAlistar/3D-Logo)**
- **[小红书主页](https://xhslink.cn/o/8SW6tCkrHad)** 与 **[TG 良友科技学院](https://t.me/liangyouuniversity)**

本网页为带厚度视觉的 CSS 3D 徽章，并非 `.spline` 原生工程。可在 3D-Logo 仓库下载 GLB 后导入 Spline 单独配置交互。

## 本次整理

- 将可交互 3D Logo 放到资源库前方，保留原首页快捷入口；跨端显示并避免小屏操作时卡住页面滚动。
- 重整字体、行距、导航、卡片与详情弹窗；窄屏使用单列内容，长链接可以完整换行显示。
- 搜索覆盖 App 名称、资源名称、版本和关键词；分类根据目录自动生成。
- 每种版本都有用途说明、完整链接和复制按钮；浏览器禁止复制时提供手动复制框。
- 依据原仓库 2026-10-22 图标版和 2026-10-11 主播单更新数量、类别、动态款说明与订阅用途，保留原有订阅链接。
- 继续保留资源更新速览、导入步骤、常见问题和「良友科技学院」TG 入口。
- 将未来方向分为「优先探索」和「后续研究」，补充资源格式、适用对象与下一步。
- 提供 PNG 分享封面、无 JavaScript 的仓库入口、加载失败提示及键盘焦点处理。

## 未来方向

优先探索：影视海报角标、IPTV 台标与 EPG、科技资讯订阅。

后续研究：Jellyfin 主题、影视质量优选规则、影音网络规则。

这些是探索方向，**尚未上线，不设发布日期**。目前没有对应的正式订阅链接。各方向在 `data/projects.json` 中记录其预期格式和准备工作。

## 日常维护

目录的统一入口是 **[data/projects.json](data/projects.json)**：

- `projects`：已上线资源，含原仓库、订阅地址、适用 App、预览、导入步骤与资源更新时间。
- `metrics`：核对过的图标、原创图标、频道等数量。`checkedAt` 是目录核对日期，不是所有项目的更新日期。
- `updates`：资源更新速览；`project` 必须指向真实的项目 ID。
- `future`：探索方向；`phase` 为 `priority` 或 `research`，不填写导入地址。
- `community` / `social`：Telegram 与小红书入口；调整地址时同步首页静态链接，运行校验。

新增资源时先确认正式导入地址和 App 支持的格式，再加入 `projects`。分类按钮、快捷入口和版本数量会自动生成。`images` 应使用真实预览，`updated` 使用实际资源更新时间，避免只改日期制造更新记录。

## 验证与发布

这是直接发布到 GitHub Pages 的静态站点，不需要构建依赖、服务器或数据库。

```sh
node --check app.js
node scripts/validate.mjs
```

保留 `.nojekyll`；GitHub Pages 使用 **Deploy from a branch → main → /(root)**。提交 `main` 后会自动发布。仓库现有校验工作流继续检查 JavaScript、目录数据、HTML 锚点与资源链接映射。

界面改动后建议检查 320 / 390 / 768 / 1440 像素宽度、放大文字、搜索无结果、长订阅链接、复制失败与弹窗关闭后的焦点返回。大部分预览图片从原仓库加载；用户提供的流云音乐联名图保存在 `assets/previews/`。不把全部图标或频道文件加载到导航首页。

## 文件结构

```text
index.html             首页、3D Logo 互动区、资源库、指南与社区入口
style.css              黑金界面和自适应布局
app.js                 搜索、筛选、版本详情和复制操作
data/projects.json     最新资源目录、统计、更新与探索方向
interactive/logo/index.html  自托管 3D Logo 互动页面（含内嵌图片）
scripts/validate.mjs   目录和网站结构检查
favicon.svg            网站图标
og-cover.svg           分享封面源文件
og-cover.png           社交分享封面
```

## 使用与署名

本站为独立资源导航，不代表第三方 App 官方。图标、商标及第三方素材归各自权利人所有；转载或复用请查看各资源仓库的授权及署名要求。本仓库没有授予第三方素材通用商用或再授权许可。

维护：**[小红书 · 良哥看未来](https://xhslink.cn/o/8SW6tCkrHad)** · [GitHub @MaddestAlistar](https://github.com/MaddestAlistar) · [Telegram 良友科技学院](https://t.me/liangyouuniversity)
