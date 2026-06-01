import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  chooseExternalTextFile,
  chooseMarkdownExport,
  chooseMarkdownImport,
  getErrorMessage,
} from "./api";
import { MarkdownPreview } from "./MarkdownPreview";
import { SettingsPanel } from "./SettingsPanel";
import { Tile } from "./Tile";
import type { AppConfig, ExternalFile, Note, NoteMetadata, ViewMode } from "./types";
import {
  applyTheme,
  countChars,
  filterNotes,
  formatShortDate,
  formatTime,
  groupNotes,
  insertMarkdown,
  metadataFromNote,
  normalizeViewMode,
  noteTitle,
  safeMarkdownFileName,
} from "./utils";

const toolbar = [
  ["bold", "B", "粗体"],
  ["italic", "I", "斜体"],
  ["heading", "H", "标题"],
  ["hr", "—", "分割线"],
  ["ul", "•", "无序列表"],
  ["ol", "1.", "有序列表"],
  ["code", "<>", "代码"],
  ["quote", "❝", "引用"],
  ["inlineMath", "Σ", "行内公式"],
  ["blockMath", "∫", "块级公式"],
] as const;

function currentSurface() {
  const params = new URLSearchParams(window.location.search);
  return {
    surface: params.get("surface") ?? "main",
    id: params.get("id") ?? "",
  };
}

export function App() {
  const { surface, id } = currentSurface();
  if (surface === "pad") return <NotePad />;
  if (surface === "tile") return <TileWindow noteId={id} />;
  return <MainWindow />;
}

function MainWindow() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [externalFiles, setExternalFiles] = useState<ExternalFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );
  const selectedExternal = useMemo(
    () => externalFiles.find((file) => file.id === selectedId) ?? null,
    [externalFiles, selectedId],
  );
  const filtered = useMemo(() => filterNotes(notes, query), [notes, query]);
  const grouped = useMemo(() => groupNotes(filtered, categories), [filtered, categories]);
  const isExternal = Boolean(selectedExternal);

  const refresh = useCallback(async () => {
    const [nextNotes, nextCategories] = await Promise.all([api.listNotes(), api.listCategories()]);
    setNotes(nextNotes);
    setCategories(nextCategories);
    return nextNotes;
  }, []);

  const loadNote = useCallback(async (noteId: string) => {
    const note = await api.getNote(noteId);
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setSaveState("saved");
    setError("");
  }, []);

  useEffect(() => {
    // Initial bootstrap loads config, note index, categories, and opens the latest note.
    void (async () => {
      try {
        const [loadedConfig, loadedNotes, loadedCategories] = await Promise.all([
          api.getConfig(),
          api.listNotes(),
          api.listCategories(),
        ]);
        setConfig(loadedConfig);
        applyTheme(loadedConfig.theme);
        setViewMode(normalizeViewMode(loadedConfig.defaultViewMode));
        setNotes(loadedNotes);
        setCategories(loadedCategories);
        setCollapsed(new Set(loadedCategories));
        if (loadedNotes[0]) await loadNote(loadedNotes[0].id);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    })();
    const unlisten = listen("notes-changed", () => void refresh());
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [loadNote, refresh]);

  useEffect(() => {
    if (!config) return;
    // Re-register shortcuts whenever the user changes either shortcut string in settings.
    void (async () => {
      try {
        await unregisterAll();
        const quick = normalizeShortcut(config.globalShortcut);
        const toggle = normalizeShortcut(config.toggleVisibilityShortcut);
        if (quick) await register(quick, () => void api.openNotepadWindow());
        if (toggle) await register(toggle, () => void api.toggleMainWindow());
      } catch (err) {
        setError(`快捷键注册失败：${getErrorMessage(err)}`);
      }
    })();
    return () => {
      void unregisterAll();
    };
  }, [config?.globalShortcut, config?.toggleVisibilityShortcut]);

  useEffect(() => {
    // Main-window autosave is intentionally debounced to avoid rewriting on every keystroke.
    if (!config?.noteAutoSave || saveState !== "dirty" || isExternal) return;
    const timer = window.setTimeout(() => void saveCurrent(), 800);
    return () => window.clearTimeout(timer);
  }, [content, title, config?.noteAutoSave, saveState, isExternal]);

  useEffect(() => {
    // External files use a separate autosave flag because edits write back to arbitrary paths.
    if (!config?.externalFileAutoSave || saveState !== "dirty" || !selectedExternal) return;
    const timer = window.setTimeout(() => void saveCurrent(), 800);
    return () => window.clearTimeout(timer);
  }, [content, title, config?.externalFileAutoSave, saveState, selectedExternal]);

  async function createBlank() {
    const note = await api.createNote({ title: "无标题笔记", content: "", category: activeCategory });
    setNotes((current) => [metadataFromNote(note), ...current]);
    await loadNote(note.id);
  }

  async function saveCurrent() {
    if (!selectedId) return;
    setSaveState("saving");
    try {
      // External documents are not imported unless the user chooses import; save back in place.
      if (selectedExternal) {
        await api.saveExternalFile(selectedExternal.filePath, content);
        setSaveState("saved");
        return;
      }
      const category = selectedNote?.category ?? activeCategory;
      const note = await api.updateNote(selectedId, { title, content, category });
      setNotes((current) =>
        [metadataFromNote(note), ...current.filter((item) => item.id !== note.id)].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      );
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(getErrorMessage(err));
    }
  }

  async function deleteCurrent() {
    if (!selectedId || selectedExternal) return;
    await api.deleteNote(selectedId);
    const next = await refresh();
    if (next[0]) await loadNote(next[0].id);
    else {
      setSelectedId(null);
      setTitle("");
      setContent("");
      setSaveState("idle");
    }
  }

  async function importMarkdown() {
    const path = await chooseMarkdownImport();
    if (!path) return;
    const note = await api.importMarkdown(path, activeCategory);
    await refresh();
    await loadNote(note.id);
  }

  async function exportMarkdown() {
    if (!selectedId || selectedExternal) return;
    const path = await chooseMarkdownExport(safeMarkdownFileName(title));
    if (path) await api.exportMarkdown(selectedId, path);
  }

  async function openExternal() {
    const path = await chooseExternalTextFile();
    if (!path) return;
    const fileName = path.split(/[\\/]/).pop() ?? path;
    const content = await api.readExternalFile(path);
    const external = { id: path, title: fileName.replace(/\.(md|txt)$/i, ""), filePath: path };
    setExternalFiles((current) =>
      current.some((item) => item.id === path) ? current : [...current, external],
    );
    setSelectedId(path);
    setTitle(external.title);
    setContent(content);
    setSaveState("saved");
  }

  async function saveSettings(next: AppConfig) {
    setConfig(next);
    applyTheme(next.theme);
    try {
      // The Tauri autostart plugin owns OS registration; config persistence records the UI state.
      if (next.autostart) await enableAutostart();
      else await disableAutostart();
    } catch (err) {
      setError(`开机自启设置失败：${getErrorMessage(err)}`);
    }
    const saved = await api.saveConfig(next);
    setConfig(saved);
  }

  function applyFormat(action: string) {
    const textarea = textRef.current;
    if (!textarea) return;
    // Markdown toolbar preserves selection so users can immediately overwrite placeholder text.
    const result = insertMarkdown(content, textarea.selectionStart, textarea.selectionEnd, action);
    setContent(result.value);
    setSaveState("dirty");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  }

  async function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    setCategories(await api.createCategory(value));
    setNewCategory("");
  }

  async function moveSelected(category: string) {
    if (!selectedId || selectedExternal) return;
    const note = await api.moveNoteCategory(selectedId, category);
    setActiveCategory(category);
    setNotes((current) => current.map((item) => (item.id === note.id ? metadataFromNote(note) : item)));
  }

  if (!config) return <div className="boot">正在启动花笺...</div>;

  return (
    <div className="app-shell">
      {config.backgroundImagePath && (
        <div
          className="background-layer"
          style={{
            backgroundImage: `url("${config.backgroundImagePath}")`,
            backgroundSize: config.backgroundFit === "repeat" ? "auto" : config.backgroundFit,
            backgroundRepeat: config.backgroundFit === "repeat" ? "repeat" : "no-repeat",
            backgroundPosition: `${config.backgroundPositionX}% ${config.backgroundPositionY}%`,
            filter: `blur(${config.backgroundBlur}px) scale(${config.backgroundScale})`,
          }}
        />
      )}
      <div className="background-dim" style={{ opacity: config.backgroundDim }} />
      <aside className="sidebar">
        <div className="window-bar" data-tauri-drag-region>
          <strong>花笺</strong>
          <div>
            <button onClick={() => void api.openNotepadWindow()} title="快捷便签">
              ＋
            </button>
            <button onClick={() => setSettingsOpen(true)} title="设置">
              ⚙
            </button>
          </div>
        </div>
        <div className="sidebar-actions">
          <button onClick={() => void createBlank()}>新建</button>
          <button onClick={() => void importMarkdown()}>导入</button>
          <button onClick={() => void openExternal()}>外部</button>
        </div>
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索笔记、内容或分类"
        />
        <div className="category-create">
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addCategory();
            }}
            placeholder="新增分类"
          />
          <button onClick={() => void addCategory()}>+</button>
        </div>
        <div className="note-list">
          {grouped.map(([category, items]) => (
            <section key={category || "none"} className="category-block">
              <button
                className="category-title"
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    next.has(category) ? next.delete(category) : next.add(category);
                    return next;
                  })
                }
              >
                <span>{category || "未分类"}</span>
                <b>{items.length}</b>
              </button>
              {!collapsed.has(category) &&
                items.map((note) => (
                  <button
                    key={note.id}
                    className={`note-item ${selectedId === note.id ? "selected" : ""}`}
                    onClick={() => void loadNote(note.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void moveSelected(category);
                    }}
                  >
                    <strong>{noteTitle(note)}</strong>
                    <span>{note.preview || "空白笔记"}</span>
                    <small>
                      {formatShortDate(note.updatedAt)} · {note.wordCount} 字
                    </small>
                  </button>
                ))}
            </section>
          ))}
          {externalFiles.map((file) => (
            <button
              key={file.id}
              className={`note-item external ${selectedId === file.id ? "selected" : ""}`}
              onClick={async () => {
                setSelectedId(file.id);
                setTitle(file.title);
                setContent(await api.readExternalFile(file.filePath));
                setSaveState("saved");
              }}
            >
              <strong>{file.title}</strong>
              <span>{file.filePath}</span>
              <small>外部文件</small>
            </button>
          ))}
        </div>
      </aside>
      <main className="editor-shell">
        <header className="titlebar" data-tauri-drag-region>
          <div className="titlebar-title">Windows 现代便签系统</div>
          <div className="titlebar-actions">
            <button onClick={() => void getCurrentWindow().minimize()}>−</button>
            <button onClick={() => void getCurrentWindow().toggleMaximize()}>□</button>
            <button
              onClick={() =>
                config.closeToTray ? void getCurrentWindow().hide() : void getCurrentWindow().close()
              }
            >
              ×
            </button>
          </div>
        </header>
        {error && <div className="error-banner">{error}</div>}
        <div className="editor-toolbar">
          <button onClick={() => void saveCurrent()} disabled={!selectedId}>
            保存
          </button>
          <button onClick={() => void exportMarkdown()} disabled={!selectedId || isExternal}>
            导出
          </button>
          <button onClick={() => void deleteCurrent()} disabled={!selectedId || isExternal}>
            删除
          </button>
          <button
            onClick={() => selectedId && void api.openTileWindow(selectedId)}
            disabled={!selectedId || isExternal}
          >
            钉到屏幕
          </button>
          <select value={activeCategory} onChange={(event) => void moveSelected(event.target.value)}>
            <option value="">未分类</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <div className="format-buttons">
            {toolbar.map(([action, label, tip]) => (
              <button key={action} title={tip} onClick={() => applyFormat(action)}>
                {label}
              </button>
            ))}
          </div>
          <div className="segmented mode-tabs">
            {(["edit", "split", "preview"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={viewMode === mode ? "active" : ""}
                onClick={() => setViewMode(mode)}
              >
                {mode === "edit" ? "编辑" : mode === "split" ? "分栏" : "预览"}
              </button>
            ))}
          </div>
        </div>
        <div className="editor-meta">
          <input
            value={title}
            disabled={!selectedId}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaveState("dirty");
            }}
            placeholder="无标题笔记"
          />
          <span>
            {selectedExternal
              ? `外部文件 · ${selectedExternal.filePath}`
              : selectedNote
                ? `${formatShortDate(selectedNote.updatedAt)} ${formatTime(selectedNote.updatedAt)}`
                : "选择或新建一篇笔记"}
          </span>
          <span>{countChars(content)} 字</span>
          <span className={`save-state ${saveState}`}>{saveState}</span>
        </div>
        <div className={`workspace ${viewMode}`}>
          {(viewMode === "edit" || viewMode === "split") && (
            <textarea
              ref={textRef}
              value={content}
              disabled={!selectedId}
              onChange={(event) => {
                setContent(event.target.value);
                setSaveState("dirty");
              }}
              style={{ fontSize: config.fontSize, tabSize: config.tabIndentSize }}
              placeholder="开始写作……"
            />
          )}
          {(viewMode === "preview" || viewMode === "split") && (
            <div className="preview-pane">
              <MarkdownPreview
                content={content}
                fontSize={config.fontSize}
                renderHtml={config.renderHtmlMarkdown}
              />
            </div>
          )}
        </div>
        <footer className="statusbar">
          <span>Ln {content.split("\n").length}</span>
          <span>Markdown + LaTeX</span>
          <span>UTF-8</span>
          <span>{(new TextEncoder().encode(content).length / 1024).toFixed(1)} KB</span>
        </footer>
      </main>
      {settingsOpen && (
        <SettingsPanel config={config} onChange={(next) => void saveSettings(next)} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function normalizeShortcut(value: string): string {
  // Settings use friendly labels; the plugin expects CommandOrControl for cross-platform Ctrl/Cmd.
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/^Ctrl\+/i, "CommandOrControl+")
    .replace(/\+Ctrl\+/i, "+CommandOrControl+")
    .replace(/Alt/i, "Alt")
    .replace(/Shift/i, "Shift");
}

function NotePad() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [openList, setOpenList] = useState(false);
  const [status, setStatus] = useState("空");

  useEffect(() => {
    // Shortcut pads load only the light data needed for quick open and note creation.
    void Promise.all([api.getConfig(), api.listNotes()]).then(([c, n]) => {
      setConfig(c);
      setNotes(n);
    });
  }, []);

  useEffect(() => {
    // Pad autosave mirrors the original app's "write and close quickly" workflow.
    if (!config?.noteSurfaceAutoSave || status !== "未保存") return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [content, title, config?.noteSurfaceAutoSave, status]);

  async function save() {
    const request = { title, content, category: "" };
    const note = editingId ? await api.updateNote(editingId, request) : await api.createNote(request);
    setEditingId(note.id);
    setNotes((current) => [metadataFromNote(note), ...current.filter((item) => item.id !== note.id)]);
    setStatus("已保存");
  }

  async function open(noteId: string) {
    const note = await api.getNote(noteId);
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setOpenList(false);
    setStatus("已打开");
  }

  if (!config) return <div className="boot">正在打开快捷便签...</div>;

  return (
    <div className="pad-shell">
      <header data-tauri-drag-region>
        <div>
          <button className={!openList ? "active" : ""} onClick={() => setOpenList(false)}>
            {editingId ? "编辑" : "新建"}
          </button>
          <button className={openList ? "active" : ""} onClick={() => setOpenList(true)}>
            打开
          </button>
        </div>
        <div>
          <button disabled={!editingId} onClick={() => editingId && void api.openTileWindow(editingId)}>
            📌
          </button>
          <button onClick={() => void getCurrentWindow().close()}>×</button>
        </div>
      </header>
      {openList ? (
        <div className="pad-list">
          {notes.map((note) => (
            <button key={note.id} onClick={() => void open(note.id)}>
              <strong>{noteTitle(note)}</strong>
              <span>{note.preview || "空白笔记"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pad-editor">
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setStatus("未保存");
            }}
            placeholder="标题（可选）"
            style={{ fontSize: config.surfaceFontSize }}
          />
          <textarea
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setStatus("未保存");
            }}
            placeholder="写点什么……"
            style={{ fontSize: config.surfaceFontSize, tabSize: config.tabIndentSize }}
          />
          <footer>
            <span>
              {countChars(content)} 字 · {status}
            </span>
            <button onClick={() => {
              setEditingId(null);
              setTitle("");
              setContent("");
              setStatus("空");
            }}>
              清空
            </button>
            <button onClick={() => void save()}>保存</button>
          </footer>
        </div>
      )}
    </div>
  );
}

function TileWindow({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    // Tile windows are read-focused; edits happen by reopening a pad or the main editor.
    void Promise.all([api.getConfig(), api.getNote(noteId)]).then(([c, n]) => {
      setConfig(c);
      setNote(n);
    });
  }, [noteId]);
  if (!note || !config) return <div className="boot">正在打开磁贴...</div>;
  return (
    <Tile
      title={note.title}
      content={note.content}
      color={config.tileColorMode === "custom" ? config.tileColor : "#f8f5ec"}
      fontSize={config.surfaceFontSize}
      renderMarkdown={config.tileRenderMarkdown}
      onCopy={() => void navigator.clipboard.writeText(note.content)}
      onEdit={() => void api.openNotepadWindow()}
      onClose={() => void getCurrentWindow().close()}
    />
  );
}
