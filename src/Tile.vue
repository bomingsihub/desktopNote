<script setup lang="ts">
import MarkdownPreview from "./MarkdownPreview.vue";

defineProps<{
  title: string;
  content: string;
  color: string;
  fontSize: number;
  renderMarkdown: boolean;
}>();

defineEmits<{
  copy: [];
  edit: [];
  close: [];
}>();
</script>

<template>
  <div class="tile" :style="{ background: color }">
    <div class="tile-header" data-drag-region>
      <strong>{{ title || "无标题笔记" }}</strong>
      <div class="tile-actions">
        <button title="复制" @click="$emit('copy')">⧉</button>
        <button title="编辑" @click="$emit('edit')">✎</button>
        <button title="取消钉屏" @click="$emit('close')">×</button>
      </div>
    </div>
    <div class="tile-body" :style="{ fontSize: `${fontSize}px` }">
      <MarkdownPreview v-if="renderMarkdown" :content="content" :font-size="fontSize" :render-html="false" />
      <pre v-else>{{ content }}</pre>
    </div>
  </div>
</template>
