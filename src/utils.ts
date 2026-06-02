import type { Note, NoteMetadata, ViewMode } from "./types";

const TODO_MARKER = "[[desktop-note:todo]]";

function stripTodoSyntax(content: string): string {
  return content
    .replace(TODO_MARKER, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[ xX]\]\s?/, ""))
    .join(" ");
}

export function normalizeViewMode(mode: string): ViewMode {
  return mode === "edit" || mode === "preview" || mode === "split" ? mode : "split";
}

export function countChars(content: string): number {
  return Array.from(content).filter((char) => !/\s/.test(char)).length;
}

export function noteTitle(note: Pick<NoteMetadata, "title"> | null): string {
  return note?.title?.trim() || "无标题笔记";
}

export function metadataFromNote(note: Note): NoteMetadata {
  return {
    id: note.id,
    title: note.title,
    fileName: note.fileName,
    category: note.category,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    wordCount: note.wordCount,
    preview: stripTodoSyntax(note.content).replace(/[#>*_`~\[\]()]|!\[[^\]]*\]\([^)]*\)/g, "").slice(0, 120),
  };
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function safeMarkdownFileName(title: string): string {
  const safe =
    title
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "无标题笔记";
  return `${safe}.md`;
}

export function filterNotes(notes: NoteMetadata[], query: string): NoteMetadata[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(q) ||
      note.preview.toLowerCase().includes(q) ||
      note.category.toLowerCase().includes(q),
  );
}

export function groupNotes(notes: NoteMetadata[], categories: string[]) {
  const groups = new Map<string, NoteMetadata[]>();
  for (const category of categories) groups.set(category, []);
  groups.set("", []);
  for (const note of notes) {
    const key = note.category || "";
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  return Array.from(groups.entries()).filter(([, items]) => items.length > 0 || groups.size === 1);
}

export function applyTheme(theme: string) {
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
}

export function insertMarkdown(
  text: string,
  start: number,
  end: number,
  action: string,
): { value: string; start: number; end: number } {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const fallback: Record<string, string> = {
    bold: "粗体文本",
    italic: "斜体文本",
    heading: "标题",
    ul: "列表项",
    ol: "列表项",
    todo: "待办事项",
    code: "代码",
    quote: "引用文本",
    inlineMath: "E=mc^2",
    blockMath: "x^2 + y^2 = r^2",
  };
  const s = selected || fallback[action] || "";
  const wrap = (prefix: string, suffix = prefix) => ({
    value: before + prefix + s + suffix + after,
    start: start + prefix.length,
    end: start + prefix.length + s.length,
  });
  switch (action) {
    case "bold":
      return wrap("**");
    case "italic":
      return wrap("*");
    case "heading":
      return { value: `${before}## ${s}${after}`, start: start + 3, end: start + 3 + s.length };
    case "hr":
      return { value: `${before}\n---\n${after}`, start: start + 5, end: start + 5 };
    case "ul":
      return { value: `${before}- ${s}${after}`, start: start + 2, end: start + 2 + s.length };
    case "ol":
      return { value: `${before}1. ${s}${after}`, start: start + 3, end: start + 3 + s.length };
    case "todo": {
      const items = s
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*]\s+(?:\[[ xX]\]\s*)?/, "").trim())
        .filter(Boolean);
      const todoText = (items.length ? items : [fallback.todo]).map((line) => `- [ ] ${line}`).join("\n");
      return { value: before + todoText + after, start: start + 6, end: start + todoText.length };
    }
    case "code":
      return selected.includes("\n") ? wrap("```\n", "\n```") : wrap("`");
    case "quote":
      return { value: `${before}> ${s}${after}`, start: start + 2, end: start + 2 + s.length };
    case "inlineMath":
      return wrap("$");
    case "blockMath":
      return wrap("\n$$\n", "\n$$\n");
    default:
      return { value: text, start, end };
  }
}
