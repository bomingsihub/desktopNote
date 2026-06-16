export type ViewMode = "edit" | "split" | "preview";
export type ThemeOption = "light" | "dark" | "system";

export interface NoteMetadata {
  id: string;
  title: string;
  fileName: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  preview: string;
}

export interface Note extends Omit<NoteMetadata, "preview"> {
  content: string;
}

export interface SaveNoteRequest {
  title: string;
  content: string;
  category: string;
}

export interface ExternalFile {
  id: string;
  title: string;
  filePath: string;
}

export interface AppConfig {
  locale: string;
  notesDir: string;
  toggleVisibilityShortcut: string;
  closeToTray: boolean;
  autostart: boolean;
  defaultViewMode: ViewMode | string;
  noteAutoSave: boolean;
  noteSurfaceAutoSave: boolean;
  tileColor: string;
  tileColorMode: "system" | "custom";
  theme: ThemeOption;
  fontSize: number;
  surfaceFontSize: number;
  tabIndentSize: number;
  externalFileAutoSave: boolean;
  rememberSurfaceSize: boolean;
  tileCtrlClose: boolean;
  tileRenderMarkdown: boolean;
  renderHtmlMarkdown: boolean;
  pinnedTileIds?: string[];
  tileStates?: Record<string, TileState>;
}

export interface TileState {
  fixed: boolean;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}
