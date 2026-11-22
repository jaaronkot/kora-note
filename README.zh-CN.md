<p align="center">
<img alt="Kora Note" src="app/appearance/boot/boot-logo.png" width="128">
<br>
<em>从思考到洞见，与智能体同行</em>
<br><br>
<b>一个精简重塑过的思源笔记版本</b>
<br><br>
<a title="Releases" target="_blank" href="https://github.com/jaaronkot/kora-note/releases"><img src="https://img.shields.io/github/release/jaaronkot/kora-note.svg?style=flat-square&color=9CF"></a>
<a title="Downloads" target="_blank" href="https://github.com/jaaronkot/kora-note/releases"><img src="https://img.shields.io/github/downloads/jaaronkot/kora-note/total.svg?style=flat-square&color=blueviolet"></a>
<a title="AGPLv3" target="_blank" href="https://www.gnu.org/licenses/agpl-3.0.txt"><img src="https://img.shields.io/badge/license-AGPLv3-orange.svg?style=flat-square"></a>
</p>

<p align="center">
<b>简体中文</b> | <a href="README.md">English</a>
</p>

---

## 简介

Kora Note 是 [思源笔记](https://github.com/siyuan-note/siyuan) 的个人衍生版本，基于社区增强版的 v3.8.10。它保留了块级编辑器、本地优先的文件格式、加密笔记本，以及块引用、数据库视图和 AI 智能体等核心能力，同时切掉了在这里用不到的部分，并把界面重新整理成更克制、更适合日常使用的样子。

名字来自开屏页上的那只考拉：应用简称 **Kora**，产品全称 **Kora Note**。

原先指向上游项目的外链，现在全部指向本仓库，应用内的更新通道也是如此。

## 改动说明

### 移除

为缩小安装包体积、降低维护成本，移除了以下功能：

- 图片 OCR 文字识别，包括 AI 辅助识别，OCR 引擎（PaddleOCR、ONNXRuntime）不再随应用分发
- 基于 Pandoc 的导入导出，包括随包分发的 Pandoc 二进制与过滤器
- 官方云账号与订阅体系，以及配套的云端资产源和云服务接口
- 收件箱
- iOS 端的应用内购买
- 云对象存储的同步探测与校验
- 设置页中的「集市」与「闪卡」标签页
- 每日笔记及其斜杠命令

### 品牌

- 应用名为 **Kora Note**，macOS 应用菜单显示 **Kora**。开屏页、窗口图标、导出格式名（`Kora.sy.zip`、`HTML (Kora)`）、Linux 文件关联名与 Windows 商店清单均已同步
- 开屏页重做为静态考拉图标、细进度条与版本号，跟随系统深浅色外观，并在系统要求减少动效时关闭动画
- 关于面板只保留版本分组：当前版本、检查更新、更新日志与运行信息

### 界面与交互

- **顶栏精简**：顶栏只保留后退、前进与缩放。全局搜索与主菜单移入左侧停靠栏，命令面板按钮、外观模式切换按钮以及每日笔记、闪卡按钮已移除
- **面板布局**：关系图与反向链接面板移到左侧停靠栏，紧跟大纲之后，右侧停靠栏默认留空
- **面板编号**：停靠栏快捷键按图标显示顺序编号，即文件树、大纲、关系图、反向链接、收藏、标签
- **标题栏**：窗口标题只显示「文档名 - 产品名」，不再拼接工作空间名与版本号
- **同步按钮**：云同步从顶栏移到左侧停靠栏底端，紧贴设置齿轮上方
- **退出提示**：退出时改为角落浮层，不再遮挡界面。桌面端停靠在同步按钮上方，移动端停靠在底栏的更多按钮上方；同步超过 12 秒后才会出现「跳过同步」
- **面包屑图标**：面包屑首项改用文档图标，右侧的文档操作按钮改用滑块图标，两者不再容易混淆

### 快捷键

- 应用层快捷键遵循 macOS 系统约定与 VS Code，编辑器插入类快捷键遵循 Notion 风格；与 macOS 原生菜单角色冲突的按键已让位
- 停靠栏快捷键按上面的图标顺序编号
- 首次启动会自动迁移旧默认键位；用户自定义过的键位不会被覆盖，迁移过程可重复执行

### 分发

- 安装包命名为 `koranote-{version}-{os}-{arch}`
- 应用内更新通道、问题反馈、官方网站与源代码入口全部指向本仓库

## 下载

请前往 [Releases 页面](https://github.com/jaaronkot/kora-note/releases) 获取构建产物，macOS 版本已使用 Developer ID 证书签名。

## 从源码构建

内核是独立的 Go 程序，需要先构建到打包器约定的目录：

```bash
git clone https://github.com/jaaronkot/kora-note.git
cd kora-note/kernel
go build -tags "fts5 sqlcipher" -o ../app/kernel-darwin-arm64/SiYuan-Kernel -ldflags "-s -w" .
```

再构建前端与安装包：

```bash
cd ../app
pnpm install
pnpm run build               # 构建前端资源到 stage/
pnpm run dist-darwin-arm64   # 打包 macOS arm64 版本
```

其他平台对应使用 `dist-darwin`、`dist-linux` 或 `dist-arm64`。

## 致谢

Kora Note 建立在 [思源笔记](https://github.com/siyuan-note/siyuan) 及其社区增强版的基础之上。原项目的说明文档以 `README.upstream.md` 及各语言版本 `README.upstream.*.md` 的形式保留在本仓库中。

## 许可协议

Kora Note 沿用上游项目的许可协议，以 [GNU Affero General Public License v3.0 或更高版本](LICENSE) 发布。
