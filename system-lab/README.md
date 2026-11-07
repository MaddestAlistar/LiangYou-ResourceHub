# 良友科技 · 在线系统实验室

公开页面：`/LiangYou-ResourceHub/system-lab/`。

## 当前系统
- **FreeDOS**：内置小型 DOS 启动软盘，命令行和经典小游戏。
- **KolibriOS**：极轻量图形桌面，触屏鼠标点击操作。
- **ReactOS**：开源 Windows 风格系统。通过 [v86](https://github.com/copy/v86) 的分块磁盘接口加载上游演示镜像（约 700 MiB 虚拟磁盘），内存要求高，iPhone 不保证可进入桌面。
- **Android-x86 1.6 / 4.4**：早期安卓实验系统，按需分块读取官方 v86 演示镜像（分别约 52 MiB / 236 MiB），不支持现代 Android 应用环境。
- **Windows 95 / Windows 98**：仅提供**访客本机合法持有**的已安装启动磁盘文件 `.img/.vhd/.bin` 选择器。浏览器端读取，不上传、不在站点存储或分发 Windows 镜像。单独附上上游 v86 的历史系统演示链接。

## 技术与限制
本项目仍使用 WebAssembly v86，宿主部署在静态 GitHub Pages，运行计算全部在访客浏览器完成。FreeDOS 和 KolibriOS 小镜像来自 [copy/images](https://github.com/copy/images)。ReactOS、Android 使用 `https://i.copy.sh/` 提供的**按需分块**的示例磁盘；仓库不存放大型镜像文件。

Windows 本地文件用 `File.arrayBuffer()` 装载，文件越大，访客手机内存占用越高。普通安装光盘 ISO 并不是已经安装好的 Windows 启动盘。不要上传不明来源文件或重要隐私资料。

浏览器模拟器并不等于真机。**虚拟 CPU 正在运行、进入图形模式，不等于桌面已经完全可用**。特别是 ReactOS 和 Android，iPhone Safari 可能因内存、CPU 限制或旧版驱动而无法启动。建议电脑优先尝试，并显示官方下载或演示备用入口。

## 手机新手操作
系统运行窗口保留放大、重启、退出、虚拟方向键和手机鼠标左键/双击/右键。iPhone Safari 不允许普通元素完整占据原生全屏时，使用固定视口沉浸模式。

## 版权与来源
- v86 见 [项目仓库](https://github.com/copy/v86)。
- ReactOS 项目及使用许可见 [ReactOS 官网](https://reactos.org/)。
- Android-x86 为早期演示，来源参考 v86 官方 profile。
- Windows 95/98 属于微软专有软件，本站不会提供微软系统磁盘或安装程序，要求访客自行拥有合法使用权。
