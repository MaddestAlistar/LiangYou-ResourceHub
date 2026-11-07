# 良友科技 · 在线系统实验室

网站：`/LiangYou-ResourceHub/system-lab/`

这是无需运行服务器的浏览器内操作系统实验室，使用 [v86](https://github.com/copy/v86)（WebAssembly）在访客本机执行。

## 当前仅保留两个系统

- **FreeDOS**：使用 `freedos722.img` 软盘镜像。可以浏览文件、输入 DOS 命令，也有 5 款可执行小游戏。
- **KolibriOS**：使用 `kolibri.img`，在浏览器中提供轻量图形桌面；移动端有单击、双击和右键等虚拟鼠标按钮。

## FreeDOS 游戏文件核实

实际检查 `copy/images/freedos722.img` 的 FAT12 文件目录及 `AUTOEXEC.BAT`，确认 `A:\\GAMES` 已加入 PATH，游戏文件包括：

| 页面名称 | 对应镜像文件 | DOS 命令 |
| --- | --- | --- |
| 太空侵略者 | `GAMES/INVADERS.COM` | `invaders` |
| 俄罗斯方块 | `GAMES/TETRIS.COM` | `tetris` |
| 扫雷 | `GAMES/MINESW~1.COM` | `minesw~1` |
| Jumper | `GAMES/JUMPER.COM` | `jumper` |
| Rogue | `GAMES/ROGUE.EXE` | `rogue` |

已根据需求**移除贪吃蛇的网页入口**。注意：此处复用原始上游镜像，`SNAKE.EXE` 仍存在于镜像内部，且开机自带的文本可能提到它；本次不重新发布或篡改上游磁盘镜像。

文件存在与命令可识别不等于每款游戏都在所有 iPhone 上流畅可玩，游戏的按键要求不同。游戏方向按键提供手指按住和松开交互。

## 其他说明

已移除 Buildroot Linux、ReactOS、Android-x86、Windows 95/98 的本网站入口和加载代码，不再维护其大量镜像的下载、启动和检测流程。

模拟器使用固定版本的 v86 JS/WASM 核心与静态系统镜像；访客端按需下载，运算在浏览器本地完成。无需云服务器、Workers 或数据库。主下载地址失败时会切换备用地址，支持启动失败重试。

iPhone Safari 不支持普通网页元素真正全屏时，提供整页沉浸视口，保留游戏方向键；模拟鼠标点击与游戏控制是否生效仍会受设备和系统版本影响。
