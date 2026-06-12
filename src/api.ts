import type { AppConfig, Note, NoteMetadata, SaveNoteRequest, TileState } from "./types";

declare global {
  interface Window {
    desktopNote: {
      invoke<T>(channel: string, payload?: unknown): Promise<T>;
      on(channel: string, listener: (payload: unknown) => void): () => void;
      windowId(): number;
    };
  }
}

export const isDesktop = "desktopNote" in window;

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return window.desktopNote.invoke<T>(channel, payload);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function listen(channel: string, listener: (payload: unknown) => void): () => void {
  return window.desktopNote.on(channel, listener);
}

function currentWindowId() {
  return window.desktopNote.windowId();
}

export const appWindow = {
  minimize: () => invoke<void>("window_minimize", { id: currentWindowId() }),
  toggleMaximize: () => invoke<void>("window_toggle_maximize", { id: currentWindowId() }),
  setAlwaysOnTop: (value: boolean) => invoke<void>("window_set_always_on_top", { id: currentWindowId(), value }),
  setDesktopFixed: (value: boolean) => invoke<void>("window_set_desktop_fixed", { id: currentWindowId(), value }),
  close: () => invoke<void>("window_close", { id: currentWindowId() }),
  hide: () => invoke<void>("window_hide", { id: currentWindowId() }),
};

export const api = {
  getConfig: () => invoke<AppConfig>("get_config"),
  saveConfig: (config: AppConfig) => invoke<AppConfig>("save_config", { config }),
  listNotes: () => invoke<NoteMetadata[]>("list_notes"),
  getNote: (id: string) => invoke<Note>("get_note", { id }),
  createNote: (request: SaveNoteRequest) => invoke<Note>("create_note", { request }),
  updateNote: (id: string, request: SaveNoteRequest) =>
    invoke<Note>("update_note", { id, request }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  listCategories: () => invoke<string[]>("list_categories"),
  createCategory: (category: string) => invoke<string[]>("create_category", { category }),
  renameCategory: (oldName: string, newName: string) =>
    invoke<string[]>("rename_category", { oldName, newName }),
  deleteCategory: (category: string) => invoke<string[]>("delete_category", { category }),
  moveNoteCategory: (id: string, category: string) =>
    invoke<Note>("move_note_category", { id, category }),
  importMarkdown: (path: string, category: string) =>
    invoke<Note>("notes_import_markdown", { path, category }),
  exportMarkdown: (id: string, path: string) =>
    invoke<void>("notes_export_markdown", { id, path }),
  readExternalFile: (path: string) => invoke<string>("read_external_file", { path }),
  saveExternalFile: (path: string, content: string) =>
    invoke<void>("save_external_file", { path, content }),
  openNotepadWindow: () => invoke<void>("open_notepad_window"),
  openTileWindow: (id: string) => invoke<void>("open_tile_window", { id }),
  getTileState: (id: string) => invoke<TileState>("tile_get_state", { id }),
  toggleMainWindow: () => invoke<void>("toggle_main_window"),
};

export async function chooseMarkdownImport(): Promise<string | null> {
  return invoke<string | null>("dialog_open", {
    options: {
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md"] }],
    },
  });
}

export async function chooseMarkdownExport(defaultPath: string): Promise<string | null> {
  return invoke<string | null>("dialog_save", {
    options: {
      defaultPath,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    },
  });
}

export async function chooseExternalTextFile(): Promise<string | null> {
  return invoke<string | null>("dialog_open", {
    options: {
      properties: ["openFile"],
      filters: [{ name: "Text", extensions: ["md", "txt"] }],
    },
  });
}

export async function chooseNotesDirectory(): Promise<string | null> {
  return invoke<string | null>("dialog_open", {
    options: {
      properties: ["openDirectory"],
    },
  });
}
