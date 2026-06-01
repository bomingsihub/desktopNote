import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AppConfig, Note, NoteMetadata, SaveNoteRequest } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  toggleMainWindow: () => invoke<void>("toggle_main_window"),
};

export async function chooseMarkdownImport(): Promise<string | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  return typeof path === "string" ? path : null;
}

export async function chooseMarkdownExport(defaultPath: string): Promise<string | null> {
  const path = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  return typeof path === "string" ? path : null;
}

export async function chooseExternalTextFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Text", extensions: ["md", "txt"] }],
  });
  return typeof path === "string" ? path : null;
}

export async function chooseNotesDirectory(): Promise<string | null> {
  const path = await open({ multiple: false, directory: true });
  return typeof path === "string" ? path : null;
}
