const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

let mainWindow = null;
let tray = null;
const devUrl = process.env.VITE_DEV_SERVER_URL;
const TODO_MARKER = "[[desktop-note:todo]]";
const TODO_META_RE = /\s*<!--dn-(bucket|created):[^>]+-->/g;

function appDir() {
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultNotesDir() {
  const dir = path.join(appDir(), "notes");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configPath() {
  return path.join(appDir(), "config.json");
}

function categoriesPath() {
  return path.join(appDir(), "categories.json");
}

function metadataPath(notesDir, id) {
  return path.join(notesDir, `${id}.json`);
}

function markdownPath(notesDir, id) {
  return path.join(notesDir, `${id}.md`);
}

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function stripMarkdown(content) {
  return content
    .replace(TODO_MARKER, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[ xX]\]\s?/, "").replace(TODO_META_RE, ""))
    .join(" ")
    .replace(/[#>*_`~[\]()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function countChars(content) {
  return Array.from(content).filter((char) => !/\s/.test(char)).length;
}

function preview(content) {
  return Array.from(stripMarkdown(content)).slice(0, 120).join("");
}

function safeFileStem(value) {
  let stem = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return Array.from(stem).slice(0, 80).join("");
}

function normalizeTitle(title, content) {
  const explicit = title.trim();
  if (explicit) return Array.from(explicit).slice(0, 80).join("");
  const line = content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  return Array.from((line || "无标题笔记").replace(/^#+/, "").trim()).slice(0, 80).join("");
}

function defaultConfig() {
  return {
    locale: "zh-CN",
    notesDir: defaultNotesDir(),
    globalShortcut: "Ctrl+Space",
    toggleVisibilityShortcut: "Ctrl+Alt+N",
    closeToTray: true,
    autostart: false,
    defaultViewMode: "split",
    noteAutoSave: true,
    noteSurfaceAutoSave: true,
    tileColor: "#f7f3e8",
    tileColorMode: "system",
    theme: "light",
    fontSize: 15,
    surfaceFontSize: 14,
    tabIndentSize: 2,
    externalFileAutoSave: false,
    rememberSurfaceSize: true,
    tileCtrlClose: true,
    tileRenderMarkdown: true,
    renderHtmlMarkdown: false,
    openAtCursor: true,
    pinnedTileIds: [],
    surfaceWidth: 440,
    surfaceHeight: 360,
  };
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readConfig() {
  const file = configPath();
  if (fs.existsSync(file)) return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
  const config = defaultConfig();
  writeConfig(config);
  return config;
}

function writeConfig(config) {
  fs.mkdirSync(config.notesDir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("config-changed", config));
  return config;
}

function notesDir() {
  const dir = readConfig().notesDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readNoteMetadata(dir, id) {
  return JSON.parse(fs.readFileSync(metadataPath(dir, id), "utf8"));
}

function writeNote(dir, note) {
  fs.writeFileSync(markdownPath(dir, note.id), note.content);
  const metadata = {
    id: note.id,
    title: note.title,
    fileName: note.fileName,
    category: note.category,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    wordCount: note.wordCount,
    preview: preview(note.content),
  };
  fs.writeFileSync(metadataPath(dir, note.id), JSON.stringify(metadata, null, 2));
}

function loadNote(dir, id) {
  const metadata = readNoteMetadata(dir, id);
  const contentPath = markdownPath(dir, id);
  const content = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, "utf8") : "";
  return {
    ...metadata,
    wordCount: countChars(content),
    content,
  };
}

function emitNotesChanged() {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("notes-changed"));
}

function updatePinnedTileIds(updater) {
  const config = readConfig();
  const pinnedTileIds = updater(Array.isArray(config.pinnedTileIds) ? config.pinnedTileIds : []);
  return writeConfig({ ...config, pinnedTileIds: [...new Set(pinnedTileIds)] });
}

function pinTile(id) {
  if (!id) return;
  updatePinnedTileIds((ids) => [...ids, id]);
}

function unpinTile(id) {
  if (!id) return;
  updatePinnedTileIds((ids) => ids.filter((item) => item !== id));
}

function prunePinnedTiles() {
  const config = readConfig();
  const pinnedTileIds = (Array.isArray(config.pinnedTileIds) ? config.pinnedTileIds : []).filter((id) =>
    fs.existsSync(metadataPath(config.notesDir, id)),
  );
  if (pinnedTileIds.length !== (config.pinnedTileIds || []).length) writeConfig({ ...config, pinnedTileIds });
  return pinnedTileIds;
}

function listNotes() {
  const dir = notesDir();
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function createNote(request) {
  const dir = notesDir();
  const id = crypto.randomUUID();
  const timestamp = now();
  const title = normalizeTitle(request.title, request.content);
  const note = {
    id,
    title,
    fileName: `${safeFileStem(title)}.md`,
    category: request.category.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    wordCount: countChars(request.content),
    content: request.content,
  };
  writeNote(dir, note);
  emitNotesChanged();
  return note;
}

function updateNote(id, request) {
  const dir = notesDir();
  const existing = loadNote(dir, id);
  const title = normalizeTitle(request.title, request.content);
  const note = {
    id,
    title,
    fileName: `${safeFileStem(title)}.md`,
    category: request.category.trim(),
    createdAt: existing.createdAt,
    updatedAt: now(),
    wordCount: countChars(request.content),
    content: request.content,
  };
  writeNote(dir, note);
  emitNotesChanged();
  return note;
}

function listCategories() {
  return readJson(categoriesPath(), []);
}

function writeCategories(categories) {
  const unique = [...new Set(categories.map((item) => item.trim()).filter(Boolean))].sort();
  fs.writeFileSync(categoriesPath(), JSON.stringify(unique, null, 2));
  return unique;
}

function createWindow(surface = "main", id = "") {
  const isMain = surface === "main";
  const isPad = surface === "pad";
  const isTile = surface === "tile";
  const browserWindow = new BrowserWindow({
    width: isMain ? 1120 : isPad ? 440 : 360,
    height: isMain ? 720 : isPad ? 360 : 260,
    minWidth: isMain ? 880 : isPad ? 320 : 220,
    minHeight: isMain ? 560 : isPad ? 260 : 160,
    frame: false,
    transparent: true,
    resizable: true,
    show: true,
    alwaysOnTop: isPad,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const query = surface === "main" ? "" : `?surface=${surface}${id ? `&id=${encodeURIComponent(id)}` : ""}`;
  if (devUrl) {
    browserWindow.loadURL(`${devUrl}${query}`);
  } else {
    browserWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      search: query.replace(/^\?/, ""),
    });
  }

  if (isMain) {
    mainWindow = browserWindow;
    browserWindow.on("close", (event) => {
      if (readConfig().closeToTray && !app.isQuitting) {
        event.preventDefault();
        browserWindow.hide();
      }
    });
  }

  browserWindow.on("session-end", () => {
    app.isQuitting = true;
  });

  return browserWindow;
}

function openNotepadWindow() {
  return createWindow("pad");
}

function openTileWindow(id, shouldPin = true) {
  const existing = BrowserWindow.getAllWindows().find((window) => window.__tileId === id);
  if (existing) {
    if (shouldPin) pinTile(id);
    existing.focus();
    return;
  }
  if (shouldPin) pinTile(id);
  const window = createWindow("tile", id);
  window.__tileId = id;
  window.on("close", () => {
    if (!app.isQuitting) unpinTile(id);
  });
}

function nativeWindowHandle(window) {
  const handle = window.getNativeWindowHandle();
  return handle.readBigUInt64LE ? handle.readBigUInt64LE(0).toString() : handle.readUInt32LE(0).toString();
}

function moveWindowToBottom(window) {
  if (process.platform !== "win32") return;
  const hwnd = nativeWindowHandle(window);
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32WindowOrder {
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
[Win32WindowOrder]::SetWindowPos([IntPtr]${hwnd}, [IntPtr]1, 0, 0, 0, 0, 0x0013) | Out-Null
`;
  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], () => {});
}

function setDesktopFixed(id, value) {
  const window = BrowserWindow.fromId(id);
  if (!window) return;
  const fixed = Boolean(value);
  window.setAlwaysOnTop(false);
  window.setFocusable(!fixed);
  if (fixed) {
    window.blur();
    moveWindowToBottom(window);
  } else {
    window.setFocusable(true);
    window.focus();
  }
}

function restorePinnedTiles() {
  for (const id of prunePinnedTiles()) openTileWindow(id, false);
}

function toggleMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function shortcut(value) {
  return value.trim().replace(/\s+/g, "").replace(/^Ctrl\+/i, "CommandOrControl+");
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const config = readConfig();
  if (config.globalShortcut) globalShortcut.register(shortcut(config.globalShortcut), openNotepadWindow);
  if (config.toggleVisibilityShortcut) globalShortcut.register(shortcut(config.toggleVisibilityShortcut), toggleMainWindow);
}

function setupTray() {
  tray = new Tray(path.join(__dirname, "icons", "icon.png"));
  tray.setToolTip("云笺阁");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示/隐藏", click: toggleMainWindow },
      { label: "快捷便签", click: openNotepadWindow },
      {
        label: "退出",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", toggleMainWindow);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, payload = {}) => fn(payload));
}

function setupIpc() {
  ipcMain.on("window_id", (event) => {
    event.returnValue = BrowserWindow.fromWebContents(event.sender)?.id;
  });
  handle("get_config", () => readConfig());
  handle("save_config", ({ config }) => {
    const saved = writeConfig(config);
    app.setLoginItemSettings({ openAtLogin: Boolean(config.autostart) });
    registerShortcuts();
    return saved;
  });
  handle("list_notes", () => listNotes());
  handle("get_note", ({ id }) => loadNote(notesDir(), id));
  handle("create_note", ({ request }) => createNote(request));
  handle("update_note", ({ id, request }) => updateNote(id, request));
  handle("delete_note", ({ id }) => {
    const dir = notesDir();
    fs.rmSync(markdownPath(dir, id), { force: true });
    fs.rmSync(metadataPath(dir, id), { force: true });
    unpinTile(id);
    BrowserWindow.getAllWindows()
      .filter((window) => window.__tileId === id)
      .forEach((window) => window.close());
    emitNotesChanged();
  });
  handle("list_categories", () => listCategories());
  handle("create_category", ({ category }) => writeCategories([...listCategories(), category]));
  handle("rename_category", ({ oldName, newName }) => {
    const dir = notesDir();
    for (const metadata of listNotes()) {
      if (metadata.category === oldName) writeNote(dir, { ...loadNote(dir, metadata.id), category: newName });
    }
    emitNotesChanged();
    return writeCategories(listCategories().map((item) => (item === oldName ? newName : item)));
  });
  handle("delete_category", ({ category }) => {
    const dir = notesDir();
    for (const metadata of listNotes()) {
      if (metadata.category === category) writeNote(dir, { ...loadNote(dir, metadata.id), category: "" });
    }
    emitNotesChanged();
    return writeCategories(listCategories().filter((item) => item !== category));
  });
  handle("move_note_category", ({ id, category }) => {
    const dir = notesDir();
    const note = { ...loadNote(dir, id), category, updatedAt: now() };
    writeNote(dir, note);
    emitNotesChanged();
    return note;
  });
  handle("notes_import_markdown", ({ path: filePath, category }) => {
    const content = fs.readFileSync(filePath, "utf8");
    return createNote({ title: path.basename(filePath, path.extname(filePath)), content, category });
  });
  handle("notes_export_markdown", ({ id, path: filePath }) => {
    fs.writeFileSync(filePath, loadNote(notesDir(), id).content);
  });
  handle("read_external_file", ({ path: filePath }) => fs.readFileSync(filePath, "utf8"));
  handle("save_external_file", ({ path: filePath, content }) => fs.writeFileSync(filePath, content));
  handle("open_notepad_window", () => openNotepadWindow());
  handle("open_tile_window", ({ id }) => openTileWindow(id));
  handle("toggle_main_window", () => toggleMainWindow());
  handle("window_minimize", ({ id }) => BrowserWindow.fromId(id)?.minimize());
  handle("window_toggle_maximize", ({ id }) => {
    const window = BrowserWindow.fromId(id);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  handle("window_set_always_on_top", ({ id, value }) => {
    const window = BrowserWindow.fromId(id);
    if (window) window.setAlwaysOnTop(Boolean(value));
  });
  handle("window_set_desktop_fixed", ({ id, value }) => setDesktopFixed(id, value));
  handle("window_close", ({ id }) => BrowserWindow.fromId(id)?.close());
  handle("window_hide", ({ id }) => BrowserWindow.fromId(id)?.hide());
  handle("dialog_open", async ({ options }) => {
    const result = await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    return options?.properties?.includes("multiSelections") ? result.filePaths : result.filePaths[0] ?? null;
  });
  handle("dialog_save", async ({ options }) => {
    const result = await dialog.showSaveDialog(options);
    return result.canceled ? null : result.filePath ?? null;
  });
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();
  restorePinnedTiles();
  setupTray();
  registerShortcuts();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
