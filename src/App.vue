<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
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
  ["hr", "-", "分割线"],
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

const { surface, id } = currentSurface();

const config = ref<AppConfig | null>(null);
const notes = ref<NoteMetadata[]>([]);
const categories = ref<string[]>([]);
const externalFiles = ref<ExternalFile[]>([]);
const selectedId = ref<string | null>(null);
const title = ref("");
const content = ref("");
const query = ref("");
const viewMode = ref<ViewMode>("split");
const saveState = ref<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
const settingsOpen = ref(false);
const collapsed = ref<Set<string>>(new Set());
const activeCategory = ref("");
const newCategory = ref("");
const error = ref("");
const textRef = ref<HTMLTextAreaElement | null>(null);
const openList = ref(false);
const status = ref("空");
const editingId = ref<string | null>(null);
const tileNote = ref<Note | null>(null);

const isMain = computed(() => surface === "main");
const isPad = computed(() => surface === "pad");
const isTile = computed(() => surface === "tile");
const selectedNote = computed(() => notes.value.find((note) => note.id === selectedId.value) ?? null);
const selectedExternal = computed(
  () => externalFiles.value.find((file) => file.id === selectedId.value) ?? null,
);
const filtered = computed(() => filterNotes(notes.value, query.value));
const grouped = computed(() => groupNotes(filtered.value, categories.value));
const isExternal = computed(() => Boolean(selectedExternal.value));

async function refresh() {
  const [nextNotes, nextCategories] = await Promise.all([api.listNotes(), api.listCategories()]);
  notes.value = nextNotes;
  categories.value = nextCategories;
  return nextNotes;
}

async function loadNote(noteId: string) {
  const note = await api.getNote(noteId);
  selectedId.value = note.id;
  title.value = note.title;
  content.value = note.content;
  saveState.value = "saved";
  error.value = "";
}

async function bootstrapMain() {
  try {
    const [loadedConfig, loadedNotes, loadedCategories] = await Promise.all([
      api.getConfig(),
      api.listNotes(),
      api.listCategories(),
    ]);
    config.value = loadedConfig;
    applyTheme(loadedConfig.theme);
    viewMode.value = normalizeViewMode(loadedConfig.defaultViewMode);
    notes.value = loadedNotes;
    categories.value = loadedCategories;
    collapsed.value = new Set(loadedCategories);
    if (loadedNotes[0]) await loadNote(loadedNotes[0].id);
  } catch (err) {
    error.value = getErrorMessage(err);
  }
}

async function bootstrapPad() {
  const [loadedConfig, loadedNotes] = await Promise.all([api.getConfig(), api.listNotes()]);
  config.value = loadedConfig;
  notes.value = loadedNotes;
}

async function bootstrapTile() {
  const [loadedConfig, note] = await Promise.all([api.getConfig(), api.getNote(id)]);
  config.value = loadedConfig;
  tileNote.value = note;
}

onMounted(() => {
  if (isMain.value) void bootstrapMain();
  if (isPad.value) void bootstrapPad();
  if (isTile.value) void bootstrapTile();
});

if (isMain.value) {
  const stop = ref<(() => void) | null>(null);
  onMounted(async () => {
    stop.value = await listen("notes-changed", () => void refresh());
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

watch([content, title, status], () => {
  if (!config.value?.noteSurfaceAutoSave || status.value !== "未保存" || !isPad.value) return;
  window.setTimeout(() => void savePad(), 900);
});

async function createBlank() {
  const note = await api.createNote({ title: "无标题笔记", content: "", category: activeCategory.value });
  notes.value = [metadataFromNote(note), ...notes.value];
  await loadNote(note.id);
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
    const category = selectedNote.value?.category ?? activeCategory.value;
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
  await api.deleteNote(selectedId.value);
  const next = await refresh();
  if (next[0]) await loadNote(next[0].id);
  else {
    selectedId.value = null;
    title.value = "";
    content.value = "";
    saveState.value = "idle";
  }
}

async function importMarkdown() {
  const path = await chooseMarkdownImport();
  if (!path) return;
  const note = await api.importMarkdown(path, activeCategory.value);
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

async function addCategory() {
  const value = newCategory.value.trim();
  if (!value) return;
  categories.value = await api.createCategory(value);
  newCategory.value = "";
}

async function moveSelected(category: string) {
  if (!selectedId.value || selectedExternal.value) return;
  const note = await api.moveNoteCategory(selectedId.value, category);
  activeCategory.value = category;
  notes.value = notes.value.map((item) => (item.id === note.id ? metadataFromNote(note) : item));
}

async function savePad() {
  const request = { title: title.value, content: content.value, category: "" };
  const note = editingId.value ? await api.updateNote(editingId.value, request) : await api.createNote(request);
  editingId.value = note.id;
  notes.value = [metadataFromNote(note), ...notes.value.filter((item) => item.id !== note.id)];
  status.value = "已保存";
}

async function openPadNote(noteId: string) {
  const note = await api.getNote(noteId);
  editingId.value = note.id;
  title.value = note.title;
  content.value = note.content;
  openList.value = false;
  status.value = "已打开";
}

function clearPad() {
  editingId.value = null;
  title.value = "";
  content.value = "";
  status.value = "空";
}

function contentKb(value: string) {
  return (new TextEncoder().encode(value).length / 1024).toFixed(1);
}

async function copyTileContent() {
  if (tileNote.value) await navigator.clipboard.writeText(tileNote.value.content);
}
</script>

<template>
  <div v-if="isMain && !config" class="boot">正在启动云笺阁...</div>
  <div v-else-if="isPad && !config" class="boot">正在打开快捷便签...</div>
  <div v-else-if="isTile && (!tileNote || !config)" class="boot">正在打开磁贴...</div>

  <div v-else-if="isMain && config" class="app-shell">
    <div
      v-if="config.backgroundImagePath"
      class="background-layer"
      :style="{
        backgroundImage: `url('${config.backgroundImagePath}')`,
        backgroundSize: config.backgroundFit === 'repeat' ? 'auto' : config.backgroundFit,
        backgroundRepeat: config.backgroundFit === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: `${config.backgroundPositionX}% ${config.backgroundPositionY}%`,
        filter: `blur(${config.backgroundBlur}px) scale(${config.backgroundScale})`,
      }"
    />
    <div class="background-dim" :style="{ opacity: config.backgroundDim }" />
    <aside class="sidebar">
      <div class="window-bar" data-drag-region>
        <strong>云笺阁</strong>
        <div>
          <button title="快捷便签" @click="api.openNotepadWindow()">＋</button>
          <button title="设置" @click="settingsOpen = true">⚙</button>
        </div>
      </div>
      <div class="sidebar-actions">
        <button @click="createBlank">新建</button>
        <button @click="importMarkdown">导入</button>
        <button @click="openExternal">外部</button>
      </div>
      <input v-model="query" class="search" placeholder="搜索笔记、内容或分类" />
      <div class="category-create">
        <input v-model="newCategory" placeholder="新增分类" @keydown.enter="addCategory" />
        <button @click="addCategory">+</button>
      </div>
      <div class="note-list">
        <section v-for="[category, items] in grouped" :key="category || 'none'" class="category-block">
          <button
            class="category-title"
            @click="
              collapsed.has(category)
                ? collapsed = new Set([...collapsed].filter((item) => item !== category))
                : collapsed = new Set([...collapsed, category])
            "
          >
            <span>{{ category || "未分类" }}</span>
            <b>{{ items.length }}</b>
          </button>
          <template v-if="!collapsed.has(category)">
            <button
              v-for="note in items"
              :key="note.id"
              :class="['note-item', selectedId === note.id ? 'selected' : '']"
              @click="loadNote(note.id)"
              @contextmenu.prevent="moveSelected(category)"
            >
              <strong>{{ noteTitle(note) }}</strong>
              <span>{{ note.preview || "空白笔记" }}</span>
              <small>{{ formatShortDate(note.updatedAt) }} · {{ note.wordCount }} 字</small>
            </button>
          </template>
        </section>
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
        <div class="titlebar-title">Windows 现代便签系统</div>
        <div class="titlebar-actions">
          <button @click="appWindow.minimize()">−</button>
          <button @click="appWindow.toggleMaximize()">□</button>
          <button @click="config.closeToTray ? appWindow.hide() : appWindow.close()">×</button>
        </div>
      </header>
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div class="editor-toolbar">
        <button :disabled="!selectedId" @click="saveCurrent">保存</button>
        <button :disabled="!selectedId || isExternal" @click="exportMarkdown">导出</button>
        <button :disabled="!selectedId || isExternal" @click="deleteCurrent">删除</button>
        <button :disabled="!selectedId || isExternal" @click="selectedId && api.openTileWindow(selectedId)">
          钉到屏幕
        </button>
        <select v-model="activeCategory" @change="moveSelected(($event.target as HTMLSelectElement).value)">
          <option value="">未分类</option>
          <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
        </select>
        <div class="format-buttons">
          <button v-for="[action, label, tip] in toolbar" :key="action" :title="tip" @click="applyFormat(action)">
            {{ label }}
          </button>
        </div>
        <div class="segmented mode-tabs">
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
      <div :class="['workspace', viewMode]">
        <textarea
          v-if="viewMode === 'edit' || viewMode === 'split'"
          ref="textRef"
          v-model="content"
          :disabled="!selectedId"
          :style="{ fontSize: `${config.fontSize}px`, tabSize: config.tabIndentSize }"
          placeholder="开始写作……"
          @input="saveState = 'dirty'"
        />
        <div v-if="viewMode === 'preview' || viewMode === 'split'" class="preview-pane">
          <MarkdownPreview :content="content" :font-size="config.fontSize" :render-html="config.renderHtmlMarkdown" />
        </div>
      </div>
      <footer class="statusbar">
        <span>Ln {{ content.split("\n").length }}</span>
        <span>Markdown + LaTeX</span>
        <span>UTF-8</span>
        <span>{{ contentKb(content) }} KB</span>
      </footer>
    </main>
    <SettingsPanel v-if="settingsOpen" :config="config" @change="saveSettings" @close="settingsOpen = false" />
  </div>

  <div v-else-if="isPad && config" class="pad-shell">
    <header data-drag-region>
      <div>
        <button :class="{ active: !openList }" @click="openList = false">{{ editingId ? "编辑" : "新建" }}</button>
        <button :class="{ active: openList }" @click="openList = true">打开</button>
      </div>
      <div>
        <button :disabled="!editingId" @click="editingId && api.openTileWindow(editingId)">📌</button>
        <button @click="appWindow.close()">×</button>
      </div>
    </header>
    <div v-if="openList" class="pad-list">
      <button v-for="note in notes" :key="note.id" @click="openPadNote(note.id)">
        <strong>{{ noteTitle(note) }}</strong>
        <span>{{ note.preview || "空白笔记" }}</span>
      </button>
    </div>
    <div v-else class="pad-editor">
      <input
        v-model="title"
        placeholder="标题（可选）"
        :style="{ fontSize: `${config.surfaceFontSize}px` }"
        @input="status = '未保存'"
      />
      <textarea
        v-model="content"
        placeholder="写点什么……"
        :style="{ fontSize: `${config.surfaceFontSize}px`, tabSize: config.tabIndentSize }"
        @input="status = '未保存'"
      />
      <footer>
        <span>{{ countChars(content) }} 字 · {{ status }}</span>
        <button @click="clearPad">清空</button>
        <button @click="savePad">保存</button>
      </footer>
    </div>
  </div>

  <Tile
    v-else-if="isTile && tileNote && config"
    :title="tileNote.title"
    :content="tileNote.content"
    :color="config.tileColorMode === 'custom' ? config.tileColor : '#f8f5ec'"
    :font-size="config.surfaceFontSize"
    :render-markdown="config.tileRenderMarkdown"
    @copy="copyTileContent"
    @edit="api.openNotepadWindow()"
    @close="appWindow.close()"
  />
</template>
