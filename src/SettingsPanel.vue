<script setup lang="ts">
import { chooseNotesDirectory } from "./api";
import type { AppConfig, ThemeOption, ViewMode } from "./types";

const props = defineProps<{
  config: AppConfig;
}>();

const emit = defineEmits<{
  change: [config: AppConfig];
  close: [];
}>();

function set<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
  emit("change", { ...props.config, [key]: value });
}

async function chooseDir() {
  const dir = await chooseNotesDirectory();
  if (dir) set("notesDir", dir);
}
</script>

<template>
  <aside class="settings-panel">
    <header>
      <h2>应用设置</h2>
      <button @click="$emit('close')">×</button>
    </header>
    <section>
      <label>主题</label>
      <div class="segmented">
        <button
          v-for="theme in (['light', 'dark', 'system'] as ThemeOption[])"
          :key="theme"
          :class="{ active: config.theme === theme }"
          @click="set('theme', theme)"
        >
          {{ theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统" }}
        </button>
      </div>
    </section>
    <section>
      <label>笔记目录</label>
      <div class="path-row">
        <input :value="config.notesDir" readonly />
        <button @click="chooseDir">选择</button>
      </div>
    </section>
    <section class="settings-grid">
      <label class="toggle-row"><span>关闭到托盘</span><input type="checkbox" :checked="config.closeToTray" @change="set('closeToTray', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>开机自启</span><input type="checkbox" :checked="config.autostart" @change="set('autostart', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>自动保存笔记</span><input type="checkbox" :checked="config.noteAutoSave" @change="set('noteAutoSave', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>磁贴自动保存</span><input type="checkbox" :checked="config.noteSurfaceAutoSave" @change="set('noteSurfaceAutoSave', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>外部文件自动保存</span><input type="checkbox" :checked="config.externalFileAutoSave" @change="set('externalFileAutoSave', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>磁贴渲染 Markdown</span><input type="checkbox" :checked="config.tileRenderMarkdown" @change="set('tileRenderMarkdown', ($event.target as HTMLInputElement).checked)" /></label>
      <label class="toggle-row"><span>允许 HTML 标签渲染</span><input type="checkbox" :checked="config.renderHtmlMarkdown" @change="set('renderHtmlMarkdown', ($event.target as HTMLInputElement).checked)" /></label>
    </section>
    <section>
      <label>默认视图</label>
      <div class="segmented">
        <button
          v-for="mode in (['edit', 'split', 'preview'] as ViewMode[])"
          :key="mode"
          :class="{ active: config.defaultViewMode === mode }"
          @click="set('defaultViewMode', mode)"
        >
          {{ mode === "edit" ? "编辑" : mode === "split" ? "分栏" : "预览" }}
        </button>
      </div>
    </section>
    <section>
      <label>显示/隐藏快捷键</label>
      <input :value="config.toggleVisibilityShortcut" placeholder="Ctrl+Alt+N" @input="set('toggleVisibilityShortcut', ($event.target as HTMLInputElement).value)" />
    </section>
    <section>
      <label class="range-row"><span>编辑器字号</span><input type="range" min="8" max="30" :value="config.fontSize" @input="set('fontSize', Number(($event.target as HTMLInputElement).value))" /><b>{{ config.fontSize }}px</b></label>
      <label class="range-row"><span>磁贴字号</span><input type="range" min="8" max="30" :value="config.surfaceFontSize" @input="set('surfaceFontSize', Number(($event.target as HTMLInputElement).value))" /><b>{{ config.surfaceFontSize }}px</b></label>
      <label class="range-row"><span>Tab 缩进</span><input type="range" min="1" max="8" :value="config.tabIndentSize" @input="set('tabIndentSize', Number(($event.target as HTMLInputElement).value))" /><b>{{ config.tabIndentSize }}</b></label>
    </section>
    <section>
      <label>磁贴颜色</label>
      <div class="color-row">
        <select :value="config.tileColorMode" @change="set('tileColorMode', ($event.target as HTMLSelectElement).value as 'system' | 'custom')">
          <option value="system">跟随主题</option>
          <option value="custom">自定义</option>
        </select>
        <input type="color" :value="config.tileColor" @input="set('tileColor', ($event.target as HTMLInputElement).value)" />
        <input :value="config.tileColor" @input="set('tileColor', ($event.target as HTMLInputElement).value)" />
      </div>
    </section>
  </aside>
</template>
