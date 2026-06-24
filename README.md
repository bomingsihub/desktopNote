# 云笺阁

Windows 桌面便签应用，基于 Electron、Vue 3、Vite 和 TypeScript 构建，支持 Markdown 写作、待办管理、桌面磁贴和本地文件存储。

## 新功能亮点

- 新增待办便签：可直接创建 Todo 笔记，支持勾选完成、回车新增、空项回删。
- 待办分组增强：按日期分组，磁贴和主编辑器都支持新增日期。
- 桌面磁贴升级：磁贴支持编辑/预览切换、Markdown 渲染、复制内容、固定到桌面底层。
- 磁贴状态记忆：已钉住的磁贴会在下次启动时恢复，并保留位置、大小和固定状态。
- 外部文件编辑：可打开 `.md/.txt` 文件，支持独立自动保存开关。
- 开机自启：设置面板可开启或关闭开机启动，启动时可隐藏到托盘。
- 编辑体验优化：有序列表自动续写、Tab 调整缩进、任务列表预览区可直接勾选。
- 链接安全打开：Markdown 预览中的链接通过系统浏览器打开，并限制为安全协议。

## 核心功能

- 无边框主窗口，支持笔记搜索、新建、保存、删除、导入和导出。
- Markdown 编辑、分栏预览、纯预览三种视图。
- 支持 GFM 风格任务列表、LaTeX 公式、可选 HTML 渲染。
- 编辑器工具栏支持粗体、斜体、标题、分割线、列表、代码、引用和公式。
- 本地 Markdown 存储，笔记元数据与配置保存在用户应用数据目录。
- 系统托盘、全局显示/隐藏快捷键、多窗口磁贴和窗口状态管理。
- 设置面板支持主题、笔记目录、默认视图、自动保存、字号、Tab 缩进和磁贴颜色。

## 技术栈

- Electron 33
- Vue 3
- Vite 7
- TypeScript
- markdown-it + KaTeX
- electron-builder

## 开发运行

需要 Node.js 18+。

安装依赖：

```powershell
npm install
```

前端构建：

```powershell
npm run build
```

Electron 开发模式：

```powershell
npm run dev:electron
```

仅运行桌面应用：

```powershell
npm start
```

Windows 打包：

```powershell
npm run build:electron
```

## 数据说明

应用首次启动会在用户应用数据目录创建配置和笔记文件：

- `config.json`
- `notes/*.md`
- `notes/*.json`

笔记目录可在设置中修改；外部文件模式不会导入到笔记库，而是直接读取和保存原文件。

## 打包产物

执行 `npm run build:electron` 后，Windows 安装包和解压目录会输出到 `release/`。
