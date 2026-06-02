<script setup lang="ts">
import { computed, nextTick } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";

const TODO_MARKER = "[[desktop-note:todo]]";

const props = defineProps<{
  title: string;
  content: string;
  color: string;
  fontSize: number;
  renderMarkdown: boolean;
  editing: boolean;
  fixed: boolean;
}>();

const emit = defineEmits<{
  copy: [];
  save: [];
  toggleFixed: [];
  toggleEdit: [];
  updateTitle: [value: string];
  updateContent: [value: string];
}>();

const isTodo = computed(() => props.content.startsWith(TODO_MARKER));
const tileTodoItems = computed(() => {
  if (!isTodo.value) return [];
  const raw = props.content.slice(TODO_MARKER.length).replace(/^\r?\n/, "");
  const lines = raw.split(/\r?\n/);
  const items = lines.map((line) => {
    const match = /^\[([ xX])\]\s?(.*)$/.exec(line);
    return {
      done: match ? match[1].toLowerCase() === "x" : false,
      text: match ? match[2] : line,
    };
  });
  return items.length ? items : [{ done: false, text: "" }];
});

function writeTileTodoItems(items: Array<{ done: boolean; text: string }>) {
  emit("updateContent", `${TODO_MARKER}\n${items.map((item) => `[${item.done ? "x" : " "}] ${item.text}`).join("\n")}`);
}

function updateTileTodoText(index: number, value: string) {
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], text: value };
  if (index === items.length - 1 && value.trim()) items.push({ done: false, text: "" });
  writeTileTodoItems(items);
}

function toggleTileTodo(index: number) {
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], done: !items[index].done };
  writeTileTodoItems(items);
}

function addTileTodo(index = tileTodoItems.value.length - 1) {
  const items = [...tileTodoItems.value];
  items.splice(index + 1, 0, { done: false, text: "" });
  writeTileTodoItems(items);
}

function removeTileTodo(index: number) {
  const items = tileTodoItems.value.filter((_, itemIndex) => itemIndex !== index);
  writeTileTodoItems(items.length ? items : [{ done: false, text: "" }]);
}

function handleTileTodoKeydown(event: KeyboardEvent, index: number) {
  if (event.key === "Enter") {
    event.preventDefault();
    addTileTodo(index);
    void nextTick(() => {
      document.querySelector<HTMLInputElement>(`[data-tile-todo-index="${index + 1}"]`)?.focus();
    });
    return;
  }
  if (event.key === "Backspace" && !tileTodoItems.value[index]?.text && tileTodoItems.value.length > 1) {
    event.preventDefault();
    removeTileTodo(index);
    void nextTick(() => {
      document.querySelector<HTMLInputElement>(`[data-tile-todo-index="${Math.max(0, index - 1)}"]`)?.focus();
    });
  }
}
</script>

<template>
  <div :class="['tile', fixed ? 'fixed' : '']" :style="{ '--tile-tint': color }" @keydown.ctrl.s.prevent="$emit('save')">
    <div class="tile-header" data-drag-region>
      <input
        class="tile-title-input"
        :value="title"
        placeholder="Untitled note"
        :readonly="isTodo && !editing"
        :style="{ width: `${Math.max(4, Math.min(14, (title || 'Untitled note').length + 1))}em` }"
        @input="$emit('updateTitle', ($event.target as HTMLInputElement).value)"
      />
      <div class="tile-actions">
        <button title="Copy" aria-label="Copy" @click="$emit('copy')">C</button>
        <button :title="editing ? 'Preview' : 'Edit'" :aria-label="editing ? 'Preview' : 'Edit'" @click="$emit('toggleEdit')">
          {{ editing ? "V" : "E" }}
        </button>
        <button :title="fixed ? 'Unlock position' : 'Fix position'" :aria-label="fixed ? 'Unlock position' : 'Fix position'" @click="$emit('toggleFixed')">
          {{ fixed ? "U" : "F" }}
        </button>
      </div>
    </div>
    <div class="tile-body" :style="{ fontSize: `${fontSize}px` }">
      <div v-if="isTodo" class="tile-todo-list">
        <label
          v-for="(item, index) in tileTodoItems"
          :key="index"
          v-show="editing || item.text.trim()"
          :class="['tile-todo-row', item.done ? 'done' : '', editing ? 'editing' : 'readonly']"
        >
          <input type="checkbox" :checked="item.done" @change="toggleTileTodo(index)" />
          <input
            :data-tile-todo-index="index"
            :value="item.text"
            placeholder="Todo item"
            :readonly="!editing"
            @input="updateTileTodoText(index, ($event.target as HTMLInputElement).value)"
            @keydown="handleTileTodoKeydown($event, index)"
          />
          <button v-if="editing" title="Delete todo" @click.prevent="removeTileTodo(index)">x</button>
        </label>
      </div>
      <textarea
        v-else-if="editing"
        class="tile-editor"
        :value="content"
        placeholder="Write something..."
        :style="{ fontSize: `${fontSize}px` }"
        @input="$emit('updateContent', ($event.target as HTMLTextAreaElement).value)"
      />
      <template v-else>
        <MarkdownPreview v-if="renderMarkdown" :content="content" :font-size="fontSize" :render-html="false" />
        <pre v-else>{{ content }}</pre>
      </template>
    </div>
  </div>
</template>
