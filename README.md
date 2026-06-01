# Windows 花笺风格便签系统

这是一个 Windows 桌面便签应用，使用 Tauri 2 + React + Rust 构建。当前仓库保留了旧版 Python/Tkinter 原型文件，但主应用已经迁移到 Tauri 工程结构。

## 功能

- 主窗口无边框现代化界面，支持笔记列表、分类、搜索、新建、保存、删除。
- Markdown 编辑、分栏预览、纯预览三种视图。
- 支持 GFM、LaTeX 公式、可选 HTML 渲染。
- 编辑器工具栏可插入粗体、斜体、标题、列表、代码、引用、公式。
- 本地 Markdown 笔记存储，配置和分类保存在用户应用数据目录。
- 快捷便签小窗，支持快速新建、打开、自动保存和钉到桌面。
- 磁贴窗口置顶显示，可复制、关闭、渲染 Markdown。
- `.md` 导入导出，支持打开并保存外部 `.md/.txt` 文件。
- 设置面板支持主题、笔记目录、自动保存、快捷键文本、字号、Tab 缩进、磁贴颜色、背景图参数。
- 系统托盘菜单支持显示/隐藏、打开快捷便签、退出。

## 开发运行

需要安装：

- Node.js 18+
- Rust 工具链，包括 `cargo`

安装依赖：

```powershell
npm install
```

前端构建：

```powershell
npm run build
```

Tauri 开发模式：

```powershell
npm run tauri -- dev
```

Windows 打包：

```powershell
npm run tauri -- build
```

如果提示 `cargo` 或 `rustc` 不存在，请先安装 Rust 并重新打开终端。

## 数据说明

新版本不迁移旧版 `notes.db`。Tauri 版本首次启动会在用户应用数据目录创建：

- `config.json`
- `categories.json`
- `notes/*.md`
- `notes/*.json`

旧版 Python 文件 `app.py`、`run.bat` 和 `notes.db` 仅作为历史原型保留。
