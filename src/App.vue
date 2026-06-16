<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import logoUrl from "./assets/logo.png";
import {
  appWindow,
  api,
  chooseExternalTextFile,
  chooseMarkdownExport,
  chooseMarkdownImport,
  getErrorMessage,
  listen,
} from "./api";
import MarkdownPreview from "./MarkdownPreview.vue";
import SettingsPanel from "./SettingsPanel.vue";
import Tile from "./Tile.vue";
import type { AppConfig, ExternalFile, Note, NoteMetadata, ViewMode } from "./types";
import {
  applyTheme,
  countChars,
  filterNotes,
  formatShortDate,
  formatTime,
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
  ["hr", "-", "分割线"],
  ["ul", "•", "无序列表"],
  ["ol", "1.", "有序列表"],
  ["code", "<>", "代码"],
  ["quote", "❝", "引用"],
  ["inlineMath", "Σ", "行内公式"],
  ["blockMath", "∫", "块级公式"],
] as const;

const TODO_MARKER = "[[desktop-note:todo]]";
const TODO_DEFAULT_BUCKET = "今日";
const TODO_BUCKETS = ["今日", "未来", "昨日"] as const;
const TODO_META_RE = /<!--dn-(bucket|created):([^>]+)-->/g;

type TodoItem = {
  done: boolean;
  text: string;
  bucket: string;
  createdAt: string;
};

function newTodoItem(bucket = TODO_DEFAULT_BUCKET): TodoItem {
  return { done: false, text: "", bucket, createdAt: new Date().toISOString() };
}

function readTodoLine(line: string, index: number): TodoItem {
  const match = /^\[([ xX])\]\s?(.*)$/.exec(line);
  const body = match ? match[2] : line;
  const meta = Object.fromEntries(
    Array.from(body.matchAll(TODO_META_RE), ([, key, value]) => [key, decodeURIComponent(value)]),
  );
  const text = body.replace(TODO_META_RE, "").trimEnd();
  return {
    done: match ? match[1].toLowerCase() === "x" : false,
    text,
    bucket: meta.bucket || TODO_DEFAULT_BUCKET,
    createdAt: meta.created || `${index}`,
  };
}

function writeTodoLine(item: TodoItem) {
  const bucket = item.bucket || TODO_DEFAULT_BUCKET;
  const bucketMeta = bucket === TODO_DEFAULT_BUCKET ? "" : ` <!--dn-bucket:${encodeURIComponent(bucket)}-->`;
  const createdMeta = ` <!--dn-created:${encodeURIComponent(item.createdAt || new Date().toISOString())}-->`;
  return `[${item.done ? "x" : " "}] ${item.text}${bucketMeta}${createdMeta}`;
}

function currentSurface() {
  const params = new URLSearchParams(window.location.search);
  return {
    surface: params.get("surface") ?? "main",
    id: params.get("id") ?? "",
  };
}

function closeCreateMenu() {
  createMenuOpen.value = false;
}

const { surface, id } = currentSurface();

const config = ref<AppConfig | null>(null);
const notes = ref<NoteMetadata[]>([]);
const externalFiles = ref<ExternalFile[]>([]);
const selectedId = ref<string | null>(null);
const title = ref("");
const content = ref("");
const query = ref("");
const viewMode = ref<ViewMode>("split");
const saveState = ref<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
const settingsOpen = ref(false);
const createMenuOpen = ref(false);
const todoBucketMenuOpen = ref(false);
const error = ref("");
const textRef = ref<HTMLTextAreaElement | null>(null);
const swipedItem = ref("");
const swipeStart = ref<{ key: string; x: number; y: number } | null>(null);
const suppressSwipeClickUntil = ref(0);
const tileNote = ref<Note | null>(null);
const tileEditing = ref(false);
const tileFixed = ref(false);
const tileStatus = ref<"saved" | "dirty" | "saving" | "error">("saved");

const isMain = computed(() => surface === "main");
const isTile = computed(() => surface === "tile");
const selectedNote = computed(() => notes.value.find((note) => note.id === selectedId.value) ?? null);
const selectedExternal = computed(
  () => externalFiles.value.find((file) => file.id === selectedId.value) ?? null,
);
const filtered = computed(() => filterNotes(notes.value, query.value));
const isExternal = computed(() => Boolean(selectedExternal.value));
const isTodoNote = computed(() => content.value.startsWith(TODO_MARKER));
const todoItems = computed(() => {
  if (!isTodoNote.value) return [];
  const raw = content.value.slice(TODO_MARKER.length).replace(/^\r?\n/, "");
  const lines = raw.split(/\r?\n/);
  const items = lines.map(readTodoLine);
  return items.length ? items : [newTodoItem()];
});
const todoBuckets = computed(() => {
  const customBuckets = todoItems.value
    .map((item) => item.bucket || TODO_DEFAULT_BUCKET)
    .filter((bucket) => !TODO_BUCKETS.includes(bucket as (typeof TODO_BUCKETS)[number]));
  return [...TODO_BUCKETS, ...Array.from(new Set(customBuckets))];
});

async function refresh() {
  const nextNotes = await api.listNotes();
  notes.value = nextNotes;
  return nextNotes;
}

async function loadNote(noteId: string) {
  const note = await api.getNote(noteId);
  selectedId.value = note.id;
  title.value = note.title;
  content.value = note.content;
  saveState.value = "saved";
  todoBucketMenuOpen.value = false;
  error.value = "";
}

async function bootstrapMain() {
  try {
    const [loadedConfig, loadedNotes] = await Promise.all([
      api.getConfig(),
      api.listNotes(),
    ]);
    config.value = loadedConfig;
    applyTheme(loadedConfig.theme);
    viewMode.value = normalizeViewMode(loadedConfig.defaultViewMode);
    notes.value = loadedNotes;
    if (loadedNotes[0]) {
      await loadNote(loadedNotes[0].id);
    } else {
      await createBlank();
    }
  } catch (err) {
    error.value = getErrorMessage(err);
  }
}

async function bootstrapTile() {
  const [loadedConfig, note, tileState] = await Promise.all([api.getConfig(), api.getNote(id), api.getTileState(id)]);
  config.value = loadedConfig;
  tileNote.value = note;
  tileFixed.value = tileState.fixed;
  tileStatus.value = "saved";
}

onMounted(() => {
  if (isMain.value) void bootstrapMain();
  if (isTile.value) void bootstrapTile();
});

if (isMain.value) {
  const stop = ref<(() => void) | null>(null);
  const closeCreateMenuOnOutsideClick = (event: PointerEvent) => {
    if (!createMenuOpen.value) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".note-create-menu, .note-create-trigger")) return;
    closeCreateMenu();
  };
  onMounted(async () => {
    stop.value = await listen("notes-changed", () => void refresh());
    document.addEventListener("pointerdown", closeCreateMenuOnOutsideClick);
  });
  onUnmounted(() => {
    stop.value?.();
    document.removeEventListener("pointerdown", closeCreateMenuOnOutsideClick);
  });
}

if (isTile.value) {
  const stop = ref<(() => void) | null>(null);
  onMounted(async () => {
    stop.value = await listen("notes-changed", async () => {
      if (!id || tileStatus.value !== "saved") return;
      try {
        tileNote.value = await api.getNote(id);
      } catch (err) {
        tileStatus.value = "error";
      }
    });
  });
  onUnmounted(() => {
    stop.value?.();
  });
}

watch([content, title, saveState], () => {
  if (!config.value?.noteAutoSave || saveState.value !== "dirty" || isExternal.value || !isMain.value) return;
  window.setTimeout(() => void saveCurrent(), 800);
});

watch([content, title, saveState, selectedExternal], () => {
  if (!config.value?.externalFileAutoSave || saveState.value !== "dirty" || !selectedExternal.value) return;
  window.setTimeout(() => void saveCurrent(), 800);
});

watch([() => tileNote.value?.title, () => tileNote.value?.content, tileStatus], () => {
  if (!config.value?.noteSurfaceAutoSave || tileStatus.value !== "dirty" || !isTile.value) return;
  window.setTimeout(() => void saveTileNote(), 900);
});

async function createBlank() {
  const note = await api.createNote({ title: "无标题笔记", content: "", category: "" });
  notes.value = [metadataFromNote(note), ...notes.value];
  createMenuOpen.value = false;
  await loadNote(note.id);
  void nextTick(() => {
    textRef.value?.focus();
  });
}

async function createTodoNote() {
  const note = await api.createNote({
    title: "待办事项",
    content: `${TODO_MARKER}\n${writeTodoLine(newTodoItem())}`,
    category: "",
  });
  notes.value = [metadataFromNote(note), ...notes.value];
  createMenuOpen.value = false;
  await loadNote(note.id);
}

function writeTodoItems(items: TodoItem[]) {
  content.value = `${TODO_MARKER}\n${items.map(writeTodoLine).join("\n")}`;
  saveState.value = "dirty";
}

function updateTodoText(index: number, value: string) {
  const items = [...todoItems.value];
  items[index] = { ...items[index], text: value };
  writeTodoItems(items);
}

function toggleTodoItem(index: number) {
  const items = [...todoItems.value];
  items[index] = { ...items[index], done: !items[index].done };
  writeTodoItems(items);
}

function addTodoItem(index = todoItems.value.length - 1, bucket = todoItems.value[index]?.bucket || TODO_DEFAULT_BUCKET) {
  const items = [...todoItems.value];
  items.splice(index + 1, 0, newTodoItem(bucket));
  writeTodoItems(items);
  const nextIndex = index + 1;
  void nextTick(() => {
    document.querySelector<HTMLInputElement>(`[data-todo-index="${nextIndex}"]`)?.focus();
  });
}

function addTodoItemForBucket(bucket: string) {
  const lastIndex = todoItems.value.reduce(
    (foundIndex, item, index) => ((item.bucket || TODO_DEFAULT_BUCKET) === bucket ? index : foundIndex),
    -1,
  );
  addTodoItem(lastIndex >= 0 ? lastIndex : todoItems.value.length - 1, bucket);
  todoBucketMenuOpen.value = false;
}

function removeTodoItem(index: number) {
  const items = todoItems.value.filter((_, itemIndex) => itemIndex !== index);
  writeTodoItems(items.length ? items : [newTodoItem()]);
}

function handleTodoKeydown(event: KeyboardEvent, index: number) {
  if (event.key === "Enter") {
    event.preventDefault();
    addTodoItem(index);
    void nextTick(() => {
      const nextInput = document.querySelector<HTMLInputElement>(`[data-todo-index="${index + 1}"]`);
      nextInput?.focus();
    });
    return;
  }
  if (event.key === "Backspace" && !todoItems.value[index]?.text && todoItems.value.length > 1) {
    event.preventDefault();
    removeTodoItem(index);
    void nextTick(() => {
      const previousInput = document.querySelector<HTMLInputElement>(
        `[data-todo-index="${Math.max(0, index - 1)}"]`,
      );
      previousInput?.focus();
    });
  }
}

async function saveCurrent() {
  if (!selectedId.value) return;
  saveState.value = "saving";
  try {
    if (selectedExternal.value) {
      await api.saveExternalFile(selectedExternal.value.filePath, content.value);
      saveState.value = "saved";
      return;
    }
    const category = selectedNote.value?.category ?? "";
    const note = await api.updateNote(selectedId.value, { title: title.value, content: content.value, category });
    notes.value = [metadataFromNote(note), ...notes.value.filter((item) => item.id !== note.id)].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    saveState.value = "saved";
  } catch (err) {
    saveState.value = "error";
    error.value = getErrorMessage(err);
  }
}

async function deleteCurrent() {
  if (!selectedId.value || selectedExternal.value) return;
  await deleteNoteById(selectedId.value);
}

async function deleteNoteById(noteId: string) {
  await api.deleteNote(noteId);
  swipedItem.value = "";
  const next = await refresh();
  if (selectedId.value === noteId && next[0]) await loadNote(next[0].id);
  else if (selectedId.value === noteId) {
    selectedId.value = null;
    title.value = "";
    content.value = "";
    saveState.value = "idle";
  }
}

function swipeKey(type: "note", id: string) {
  return `${type}:${id || "none"}`;
}

function startSwipe(event: PointerEvent, key: string) {
  swipeStart.value = { key, x: event.clientX, y: event.clientY };
}

function moveSwipe(event: PointerEvent) {
  if (!swipeStart.value) return;
  const deltaX = event.clientX - swipeStart.value.x;
  const deltaY = Math.abs(event.clientY - swipeStart.value.y);
  if (deltaX > 34 && deltaY < 26) {
    swipedItem.value = swipeStart.value.key;
    suppressSwipeClickUntil.value = Date.now() + 350;
  }
}

function endSwipe() {
  swipeStart.value = null;
}

function shouldSuppressSwipeClick() {
  return Date.now() < suppressSwipeClickUntil.value;
}

async function openSwipedNote(noteId: string) {
  if (shouldSuppressSwipeClick()) return;
  const key = swipeKey("note", noteId);
  if (swipedItem.value === key) {
    swipedItem.value = "";
    return;
  }
  swipedItem.value = "";
  await loadNote(noteId);
}

async function importMarkdown() {
  const path = await chooseMarkdownImport();
  if (!path) return;
  const note = await api.importMarkdown(path);
  await refresh();
  await loadNote(note.id);
}

async function exportMarkdown() {
  if (!selectedId.value || selectedExternal.value) return;
  const path = await chooseMarkdownExport(safeMarkdownFileName(title.value));
  if (path) await api.exportMarkdown(selectedId.value, path);
}

async function openExternal() {
  const path = await chooseExternalTextFile();
  if (!path) return;
  const fileName = path.split(/[\\/]/).pop() ?? path;
  const externalContent = await api.readExternalFile(path);
  const external = { id: path, title: fileName.replace(/\.(md|txt)$/i, ""), filePath: path };
  if (!externalFiles.value.some((item) => item.id === path)) externalFiles.value = [...externalFiles.value, external];
  selectedId.value = path;
  title.value = external.title;
  content.value = externalContent;
  saveState.value = "saved";
}

async function saveSettings(next: AppConfig) {
  config.value = next;
  applyTheme(next.theme);
  config.value = await api.saveConfig(next);
}

function applyFormat(action: string) {
  const textarea = textRef.value;
  if (!textarea) return;
  const result = insertMarkdown(content.value, textarea.selectionStart, textarea.selectionEnd, action);
  content.value = result.value;
  saveState.value = "dirty";
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(result.start, result.end);
  });
}

function toggleTask(index: number) {
  let current = -1;
  const lines = content.value.split("\n");
  const next = lines.map((line) => {
    const match = /^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/.exec(line);
    if (!match) return line;
    current += 1;
    if (current !== index) return line;
    return `${match[1]}${match[2].toLowerCase() === "x" ? " " : "x"}${match[3]}`;
  });
  content.value = next.join("\n");
  saveState.value = "dirty";
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  const textarea = textRef.value;
  if (!textarea) return;
  const lineStart = content.value.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
  const line = content.value.slice(lineStart, textarea.selectionStart);
  if (!/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) return;
  event.preventDefault();
  const insert = "\n- [ ] ";
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  content.value = content.value.slice(0, start) + insert + content.value.slice(end);
  saveState.value = "dirty";
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(start + insert.length, start + insert.length);
  });
}

function contentKb(value: string) {
  return (new TextEncoder().encode(value).length / 1024).toFixed(1);
}

async function copyTileContent() {
  if (tileNote.value) await navigator.clipboard.writeText(tileNote.value.content);
}

function updateTileTitle(value: string) {
  if (!tileNote.value) return;
  tileNote.value = { ...tileNote.value, title: value };
  tileStatus.value = "dirty";
}

function updateTileContent(value: string) {
  if (!tileNote.value) return;
  tileNote.value = { ...tileNote.value, content: value };
  tileStatus.value = "dirty";
}

async function saveTileNote() {
  if (!tileNote.value || tileStatus.value === "saving") return;
  tileStatus.value = "saving";
  try {
    tileNote.value = await api.updateNote(tileNote.value.id, {
      title: tileNote.value.title,
      content: tileNote.value.content,
      category: tileNote.value.category,
    });
    tileStatus.value = "saved";
  } catch (err) {
    tileStatus.value = "error";
    error.value = getErrorMessage(err);
  }
}

async function toggleTileFixed() {
  const nextFixed = !tileFixed.value;
  tileFixed.value = nextFixed;
  await appWindow.setDesktopFixed(nextFixed);
}
</script>

<template>
  <div v-if="isMain && !config" class="boot">正在启动云笺阁...</div>
  <div v-else-if="isTile && (!tileNote || !config)" class="boot">正在打开磁贴...</div>

  <div v-else-if="isMain && config" class="app-shell">
    <aside class="sidebar">
      <div class="window-bar" data-drag-region>
        <img class="app-brand-logo" :src="logoUrl" alt="云笺阁" />
        <div>
          <button title="设置" @click="settingsOpen = true">⚙</button>
        </div>
      </div>
      <div class="sidebar-actions">
        <div class="note-create-wrap">
          <button
            class="note-create-trigger"
            @click="createMenuOpen = !createMenuOpen"
          >
            新建
          </button>
          <div v-if="createMenuOpen" class="note-create-menu">
            <button @click="createBlank">Markdown便签</button>
            <button @click="createTodoNote">待办便签</button>
          </div>
        </div>
        <button @click="importMarkdown">导入</button>
        <button @click="openExternal">外部</button>
      </div>
      <input v-model="query" class="search" placeholder="搜索笔记或内容" />
      <div class="note-list">
        <div
          v-for="note in filtered"
          :key="note.id"
          :class="['swipe-row', 'note-swipe-row', swipedItem === swipeKey('note', note.id) ? 'revealed' : '']"
        >
          <button class="swipe-delete" @click="deleteNoteById(note.id)">删除</button>
          <button
            :class="['note-item', 'swipe-content', selectedId === note.id ? 'selected' : '']"
            @pointerdown="startSwipe($event, swipeKey('note', note.id))"
            @pointermove="moveSwipe"
            @pointerup="endSwipe"
            @pointercancel="endSwipe"
            @click="openSwipedNote(note.id)"
          >
            <strong>{{ noteTitle(note) }}</strong>
            <small>{{ formatShortDate(note.updatedAt) }} · {{ note.wordCount }} 字</small>
          </button>
        </div>
        <button
          v-for="file in externalFiles"
          :key="file.id"
          :class="['note-item', 'external', selectedId === file.id ? 'selected' : '']"
          @click="
            async () => {
              selectedId = file.id;
              title = file.title;
              content = await api.readExternalFile(file.filePath);
              saveState = 'saved';
            }
          "
        >
          <strong>{{ file.title }}</strong>
          <span>{{ file.filePath }}</span>
          <small>外部文件</small>
        </button>
      </div>
    </aside>

    <main class="editor-shell">
      <header class="titlebar" data-drag-region>
        <div class="titlebar-title" aria-hidden="true"></div>
        <div class="titlebar-actions">
          <button @click="appWindow.minimize()">−</button>
          <button @click="appWindow.toggleMaximize()">□</button>
          <button @click="config.closeToTray ? appWindow.hide() : appWindow.close()">×</button>
        </div>
      </header>
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div class="editor-toolbar">
        <div v-if="isTodoNote" class="todo-add-wrap">
          <button class="todo-toolbar-add" @click="todoBucketMenuOpen = !todoBucketMenuOpen">新增待办</button>
          <div v-if="todoBucketMenuOpen" class="todo-bucket-menu">
            <button v-for="bucket in todoBuckets" :key="bucket" @click="addTodoItemForBucket(bucket)">
              {{ bucket }}
            </button>
          </div>
        </div>
        <button v-if="!isTodoNote" :disabled="!selectedId" @click="saveCurrent">保存</button>
        <button v-if="!isTodoNote" :disabled="!selectedId || isExternal" @click="exportMarkdown">导出</button>
        <button v-if="!isTodoNote" :disabled="!selectedId || isExternal" @click="deleteCurrent">删除</button>
        <button :disabled="!selectedId || isExternal" @click="selectedId && api.openTileWindow(selectedId)">
          钉到屏幕
        </button>
        <div v-if="!isTodoNote" class="format-buttons">
          <button v-for="[action, label, tip] in toolbar" :key="action" :title="tip" @click="applyFormat(action)">
            {{ label }}
          </button>
        </div>
        <div v-if="!isTodoNote" class="segmented mode-tabs">
          <button
            v-for="mode in (['edit', 'split', 'preview'] as ViewMode[])"
            :key="mode"
            :class="{ active: viewMode === mode }"
            @click="viewMode = mode"
          >
            {{ mode === "edit" ? "编辑" : mode === "split" ? "分栏" : "预览" }}
          </button>
        </div>
      </div>
      <div class="editor-meta">
        <input
          v-model="title"
          :disabled="!selectedId"
          placeholder="无标题笔记"
          @input="saveState = 'dirty'"
        />
        <span>
          {{
            selectedExternal
              ? `外部文件 · ${selectedExternal.filePath}`
              : selectedNote
                ? `${formatShortDate(selectedNote.updatedAt)} ${formatTime(selectedNote.updatedAt)}`
                : "选择或新建一篇笔记"
          }}
        </span>
        <span>{{ countChars(content) }} 字</span>
        <span :class="['save-state', saveState]">{{ saveState }}</span>
      </div>
      <div v-if="isTodoNote" class="todo-workspace">
        <div class="todo-list-editor">
          <label
            v-for="(item, index) in todoItems"
            :key="index"
            :class="['todo-row', item.done ? 'done' : '']"
          >
            <input type="checkbox" :checked="item.done" @change="toggleTodoItem(index)" />
            <span class="todo-bucket-label">{{ item.bucket }}</span>
            <input
              :data-todo-index="index"
              :value="item.text"
              placeholder="输入待办事项"
              @input="updateTodoText(index, ($event.target as HTMLInputElement).value)"
              @keydown="handleTodoKeydown($event, index)"
            />
            <button title="删除待办" @click.prevent="removeTodoItem(index)">×</button>
          </label>
        </div>
      </div>
      <div v-else :class="['workspace', viewMode]">
        <textarea
          v-if="viewMode === 'edit' || viewMode === 'split'"
          ref="textRef"
          v-model="content"
          :disabled="!selectedId"
          :style="{ fontSize: `${config.fontSize}px`, tabSize: config.tabIndentSize }"
          placeholder="开始写作……"
          @input="saveState = 'dirty'"
          @keydown="handleEditorKeydown"
        />
        <div v-if="viewMode === 'preview' || viewMode === 'split'" class="preview-pane">
          <MarkdownPreview
            :content="content"
            :font-size="config.fontSize"
            :render-html="config.renderHtmlMarkdown"
            @toggle-task="toggleTask"
          />
        </div>
      </div>
      <footer class="statusbar">
        <span>{{ isTodoNote ? `${todoItems.length} 项待办` : `Ln ${content.split("\n").length}` }}</span>
        <span>{{ isTodoNote ? "Todo" : "Markdown + LaTeX" }}</span>
        <span>UTF-8</span>
        <span>{{ contentKb(content) }} KB</span>
      </footer>
    </main>
    <div v-if="settingsOpen" class="settings-overlay" @click="settingsOpen = false">
      <SettingsPanel :config="config" @change="saveSettings" @close="settingsOpen = false" @click.stop />
    </div>
  </div>

  <Tile
    v-else-if="isTile && tileNote && config"
    :title="tileNote.title"
    :content="tileNote.content"
    :color="config.tileColorMode === 'custom' ? config.tileColor : '#f8f5ec'"
    :font-size="config.surfaceFontSize"
    :render-markdown="config.tileRenderMarkdown"
    :editing="tileEditing"
    :fixed="tileFixed"
    @copy="copyTileContent"
    @save="saveTileNote"
    @toggle-fixed="toggleTileFixed"
    @toggle-edit="tileEditing = !tileEditing"
    @update-title="updateTileTitle"
    @update-content="updateTileContent"
  />
</template>
