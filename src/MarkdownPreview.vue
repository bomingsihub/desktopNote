<script setup lang="ts">
import MarkdownIt from "markdown-it";
import markdownItKatex from "@iktakahiro/markdown-it-katex";

const props = defineProps<{
  content: string;
  fontSize: number;
  renderHtml: boolean;
}>();

function renderMarkdown() {
  const md = new MarkdownIt({
    html: props.renderHtml,
    linkify: true,
    typographer: false,
  }).use(markdownItKatex);
  return md.render(props.content || " ");
}
</script>

<template>
  <div class="markdown-preview" :style="{ fontSize: `${fontSize}px` }" v-html="renderMarkdown()" />
</template>
