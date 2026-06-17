<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";

const TODO_MARKER = "[[desktop-note:todo]]";
const TODO_DEFAULT_BUCKET = "今日";
const TODO_BUCKETS = ["今日", "未来", "昨日"] as const;
const TODO_META_RE = /<!--dn-(bucket|created):([^>]+)-->/g;

type TileTodoItem = {
  done: boolean;
  text: string;
  bucket: string;
  createdAt: string;
};

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

const activeTodoBucket = ref(TODO_DEFAULT_BUCKET);

function newTileTodoItem(bucket = activeTodoBucket.value): TileTodoItem {
  return { done: false, text: "", bucket, createdAt: new Date().toISOString() };
}

function todoCreatedTime(item: TileTodoItem) {
  const time = Date.parse(item.createdAt);
  return Number.isNaN(time) ? Number(item.createdAt) || 0 : time;
}

const isTodo = computed(() => props.content.startsWith(TODO_MARKER));
const tileTodoItems = computed(() => {
  if (!isTodo.value) return [];
  const raw = props.content.slice(TODO_MARKER.length).replace(/^\r?\n/, "");
  const lines = raw.split(/\r?\n/);
  const items = lines.map<TileTodoItem>((line, index) => {
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
  });
  return items.length ? items : [newTileTodoItem(TODO_DEFAULT_BUCKET)];
});

const tileTodoBuckets = computed(() => {
  const customBuckets = tileTodoItems.value
    .map((item) => item.bucket || TODO_DEFAULT_BUCKET)
    .filter((bucket) => !TODO_BUCKETS.includes(bucket as (typeof TODO_BUCKETS)[number]));
  return [...TODO_BUCKETS, ...Array.from(new Set(customBuckets))];
});

const activeTileTodoItems = computed(() =>
  tileTodoItems.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (item.bucket || TODO_DEFAULT_BUCKET) === activeTodoBucket.value)
    .sort((left, right) => {
      if (left.item.done !== right.item.done) return left.item.done ? 1 : -1;
      if (left.item.done) return todoCreatedTime(left.item) - todoCreatedTime(right.item);
      return todoCreatedTime(right.item) - todoCreatedTime(left.item);
    }),
);

watch(tileTodoBuckets, (buckets) => {
  if (!buckets.includes(activeTodoBucket.value)) activeTodoBucket.value = TODO_DEFAULT_BUCKET;
});

function writeTileTodoItems(items: TileTodoItem[]) {
  emit(
    "updateContent",
    `${TODO_MARKER}\n${items
      .map((item) => {
        const bucket = item.bucket || TODO_DEFAULT_BUCKET;
        const bucketMeta = bucket === TODO_DEFAULT_BUCKET ? "" : ` <!--dn-bucket:${encodeURIComponent(bucket)}-->`;
        const createdMeta = ` <!--dn-created:${encodeURIComponent(item.createdAt || new Date().toISOString())}-->`;
        return `[${item.done ? "x" : " "}] ${item.text}${bucketMeta}${createdMeta}`;
      })
      .join("\n")}`,
  );
}

function updateTileTodoText(index: number, value: string) {
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], text: value };
  const bucket = items[index]?.bucket || activeTodoBucket.value;
  const hasEmptyItemInBucket = items.some(
    (item, itemIndex) => itemIndex !== index && (item.bucket || TODO_DEFAULT_BUCKET) === bucket && !item.text.trim(),
  );
  if (value.trim() && !hasEmptyItemInBucket) {
    items.push(newTileTodoItem(bucket));
  }
  writeTileTodoItems(items);
}

function toggleTileTodo(index: number) {
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], done: !items[index].done };
  writeTileTodoItems(items);
}

function addTileTodo(index = tileTodoItems.value.length - 1) {
  const items = [...tileTodoItems.value];
  items.splice(index + 1, 0, newTileTodoItem(activeTodoBucket.value));
  writeTileTodoItems(items);
}

function removeTileTodo(index: number) {
  const items = tileTodoItems.value.filter((_, itemIndex) => itemIndex !== index);
  writeTileTodoItems(items.length ? items : [newTileTodoItem(TODO_DEFAULT_BUCKET)]);
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

function addTileTodoBucket() {
  const name = window.prompt("新增分组", "");
  const bucket = name?.trim();
  if (!bucket) return;
  selectTileTodoBucket(bucket);
}

function selectTileTodoBucket(bucket: string) {
  activeTodoBucket.value = bucket;
  if (!props.editing || tileTodoItems.value.some((item) => (item.bucket || TODO_DEFAULT_BUCKET) === bucket)) return;
  const items = [...tileTodoItems.value, newTileTodoItem(bucket)];
  writeTileTodoItems(items);
  void nextTick(() => {
    document.querySelector<HTMLInputElement>(`[data-tile-todo-index="${items.length - 1}"]`)?.focus();
  });
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
        spellcheck="false"
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
      <div v-if="isTodo" class="tile-todo-shell">
        <aside class="tile-todo-buckets">
          <button
            v-for="bucket in tileTodoBuckets"
            :key="bucket"
            :class="[
              'tile-todo-bucket',
              activeTodoBucket === bucket ? 'active' : '',
              TODO_BUCKETS.includes(bucket as (typeof TODO_BUCKETS)[number]) ? 'default' : 'custom',
            ]"
            @click="selectTileTodoBucket(bucket)"
          >
            <span>{{ bucket }}</span>
          </button>
          <button v-if="editing" class="tile-todo-bucket-add" title="新增分组" @click="addTileTodoBucket">+</button>
        </aside>
        <div class="tile-todo-list">
          <div
            v-for="{ item, index } in activeTileTodoItems"
            :key="index"
            v-show="editing || item.text.trim()"
            :class="['tile-todo-row', item.done ? 'done' : '', editing ? 'editing' : 'readonly']"
          >
            <input type="checkbox" :checked="item.done" @change="toggleTileTodo(index)" />
            <input
              type="text"
              :data-tile-todo-index="index"
              :value="item.text"
              placeholder="Todo item"
              :readonly="!editing"
              spellcheck="false"
              @input="updateTileTodoText(index, ($event.target as HTMLInputElement).value)"
              @keydown="handleTileTodoKeydown($event, index)"
            />
            <button v-if="editing" title="Delete todo" @click.prevent="removeTileTodo(index)">x</button>
          </div>
        </div>
      </div>
      <textarea
        v-else-if="editing"
        class="tile-editor"
        :value="content"
        placeholder="Write something..."
        spellcheck="false"
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
