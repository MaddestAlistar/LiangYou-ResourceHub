# 良友资源中心 · LiangYou Resource Hub

由 **良哥看未来** 维护的 App 开放资源导航站。目标是：**把可复用的 App 资源变成可预览、可搜索、可复制的订阅入口。**

> 本仓库是导航网站，不替换已有徽章、图标或频道项目。各 App 继续读取原仓库的订阅文件；已添加的用户地址不受影响。

## 网站地址

启用 GitHub Pages 后访问：

**https://maddestalistar.github.io/LiangYou-ResourceHub/**

网站为纯静态站点，不需要后端、数据库或额外服务器。支持桌面和移动端。

## 已上线项目

| 项目 | 原仓库 | 用途 |
| --- | --- | --- |
| 良友媒体徽章库 | [liangyou-appletv-badges](https://github.com/MaddestAlistar/liangyou-appletv-badges) | 复杂徽章 / EplayerX / OopsPlayer 专版 |
| 良友媒体图标库 | [LiangYou-IconLibrary](https://github.com/MaddestAlistar/LiangYou-IconLibrary) | 完整图标订阅 / 良友原创图标 |
| 良友直播频道库 | [LiangyouChannels](https://github.com/MaddestAlistar/LiangyouChannels) | 汇流直播主播单 / 主播头像图标库 |

订阅链接、适配客户端、导入步骤统一配置在 **[data/projects.json](data/projects.json)**。当前数据来自上述项目的 README，具体兼容方式以原项目最新文档为准。

已规划但尚未上线：IPTV 台标与 EPG、Jellyfin 主题、影视海报角标、影视质量优选规则、影音网络规则和科技 RSS 订阅。规划卡片不会提供虚假的导入链接。

## 开启 GitHub Pages（只需首次设置）

1. 进入仓库 [Settings → Pages](https://github.com/MaddestAlistar/LiangYou-ResourceHub/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **Deploy from a branch**。
3. 选择分支 **main**、目录 **/(root)**，点击 **Save**。
4. 等待 GitHub 自动构建，再打开网站地址。后续更新 `main` 会按 GitHub Pages 的机制自动部署。

注意：这个仓库以 **分支直接发布静态 HTML**，不需要 Actions 构建工作流。仓库创建者需要首次在 Settings 中开启 Pages；仅上传 `index.html` 不等于站点已经公开发布。

## 项目结构

```text
LiangYou-ResourceHub/
├── index.html          # 网站首页、导航与资源详情弹窗容器
├── style.css           # 黑金风格 / 手机平板桌面自适应
├── app.js              # 搜索、筛选、资源详情、复制订阅链接
├── data/
│   └── projects.json   # 已上线项目与未来规划的唯一维护入口
├── favicon.svg         # 网站图标
├── og-cover.svg        # 分享时的品牌封面素材
├── robots.txt
├── sitemap.xml
└── .nojekyll
```

## 后续如何添加项目

**已经可以使用的资源**，新增到 `data/projects.json` 的 `projects` 数组，填写：

- `id`：英文唯一标识；`title` 和 `description`：项目中文名称与说明。
- `category`：`player`、`icon`、`live` 等分类（新增分类时同步前端筛选按钮）。
- `stage: "live"`：已上线；`repo`：**真实** GitHub 原仓库地址。
- `apps`：已确认兼容的 App；`imports`：已验证的正式导入 URL 和用途描述。
- `images`：可公开访问的 HTTPS 预览图片；`steps`：按 App 实际入口填写导入步骤。
- `updated`：本次核对的日期。更新内容时不要仅修改日期而不核验链接。

**还在计划中的项目**，只加入 `future` 数组，不提供“复制订阅”入口。正式发布前再迁移到 `projects`。

修改 JSON 并提交即可更新首页，**原项目仓库不需要搬迁**。建议每次更新检查 JSON 语法、原仓库链接、订阅文件内容与目标 App 的导入格式。

## 使用与署名

本站旨在方便使用真实的公开资源，**不代表任何第三方 App 官方**；具体数据、外部头像、图标和商标归各自权利人所有。请尊重各项目许可及素材授权，转载或二次使用时保留相应署名。

维护：**小红书 · 良哥看未来** · GitHub [@MaddestAlistar](https://github.com/MaddestAlistar)

没有添加通用开源许可证；请不要推定所有内容或第三方素材可任意商用、改名或再授权。
