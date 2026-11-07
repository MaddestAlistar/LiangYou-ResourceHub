# 良友科技 · 在线系统实验室

独立页面入口：`/LiangYou-ResourceHub/system-lab/`。不会更改现有 `#lab` JSON 资源实验室。

## 原理
- 使用 [copy/v86](https://github.com/copy/v86) 的浏览器 WebAssembly x86 模拟器。
- 系统磁盘使用 [copy/images](https://github.com/copy/images) 的小体积示例镜像：FreeDOS、KolibriOS、Buildroot Linux。
- 运行时动态下载 `https://cdn.jsdelivr.net/npm/v86@0.5.473/build/libv86.js` 和同版本 `build/v86.wasm`，BIOS/镜像从 GitHub raw 加载，不经过良友自己的后端服务。
- 首次加载需联网；第三方网络、跨域限制或 Safari WebAssembly 限制可能导致无法启动。网站只提供实验入口，不保证所有设备可用。

## 使用
打开独立页面、选择系统、等待载入。可暂停、继续、重启和退出，提供手机文本输入辅助。无云端虚拟机，也不收集系统输入。没有保存虚拟磁盘修改的功能。

## 新手引导与虚拟输入

选择系统后，运行窗口自动切换对应操作提示，不必记住每个系统的进入方法：

- **FreeDOS**：等待 `A:\\>` 提示符，再使用 `dir`、`help`、`cls` 或 `snake` 快捷命令。提示“Boot failed: CDROM”后仍可能成功从软盘进入系统。
- **KolibriOS**：等初始化文本结束并进入图形界面；主要用鼠标和下方方向键、Tab、Esc、Enter 操作。图形模式不保证已完全进入桌面。
- **Buildroot Linux**：等待出现 `/root%` 等 Shell 提示符，再一键执行 `ls`、`pwd`、`uname -a`、`echo hello`。

虚拟按键通过 v86 的 Set 1 扫描码接口发送，包括方向键、Enter、Esc、Tab、退格及终端 Ctrl+C；快捷命令会先发送英文文本、再自动回车。手动输入框的「仅发送文字」不会自动回车，需另外点击「Enter ↵ 执行」。开机尚未就绪时快捷命令不可用，避免在开机日志中误输入。所有指令在访客浏览器本地执行，不上传到网站。

## 开发约束
- 镜像和模拟器开源许可相互独立；未收录 Windows 或其他专有 OS 镜像。
- 如果需完全自托管，应将官方版本匹配的 JS/WASM、BIOS 和经授权镜像存入静态存储，然后修改 `lab.js` 中的资源 URL。避免构建时追踪未经验证的第三方最新版。
- 不能把“已添加网页入口”直接视为所有移动端已经通过真实启动测试。
- 桌面和手机至少检查启动、画面、输入、暂停、重启、网络加载失败时的提示。

## 致谢
[v86 — BSD-2-Clause](https://github.com/copy/v86)，镜像来源及说明见 [copy/images](https://github.com/copy/images)。
