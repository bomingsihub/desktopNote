<script setup lang="ts">
import MarkdownIt from "markdown-it";
import markdownItKatex from "@iktakahiro/markdown-it-katex";

const props = defineProps<{
  content: string;
  fontSize: number;
  renderHtml: boolean;
}>();

const emit = defineEmits<{
  toggleTask: [index: number];
}>();

function enableTaskLists(md: MarkdownIt) {
  md.core.ruler.after("inline", "task_lists", (state) => {
    let taskIndex = 0;
    for (let i = 2; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type !== "inline" || !token.children?.length) continue;
      const firstChild = token.children[0];
      const match = /^\[([ xX])\]\s+/.exec(firstChild.content);
      if (!match || state.tokens[i - 1]?.type !== "paragraph_open" || state.tokens[i - 2]?.type !== "list_item_open") {
        continue;
      }
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input class="task-list-item-checkbox" type="checkbox" data-task-index="${taskIndex}"${match[1].toLowerCase() === "x" ? " checked" : ""}> `;
      firstChild.content = firstChild.content.slice(match[0].length);
      token.children.unshift(checkbox);
      state.tokens[i - 2].attrJoin("class", "task-list-item");
      if (match[1].toLowerCase() === "x") state.tokens[i - 2].attrJoin("class", "done");
      taskIndex += 1;
    }
  });
}

function renderMarkdown() {
  const md = new MarkdownIt({
    html: props.renderHtml,
    linkify: true,
    typographer: false,
  }).use(markdownItKatex);
  enableTaskLists(md);
  return md.render(props.content || " ");
}

function onPreviewChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  if (!target?.classList.contains("task-list-item-checkbox")) return;
  const index = Number(target.dataset.taskIndex);
  if (Number.isNaN(index)) return;
  emit("toggleTask", index);
}
</script>

<template>
  <div class="markdown-preview" :style="{ fontSize: `${fontSize}px` }" @change="onPreviewChange" v-html="renderMarkdown()" />
</template>
