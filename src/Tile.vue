<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import { formatTodoBucketDate, formatTodoDateInput, normalizeTodoBucket } from "./utils";

const TODO_MARKER = "[[desktop-note:todo]]";
const TODO_BUCKET_MARKER = "[[desktop-note:todo-buckets]]";
const TODO_BUCKETS_RE = /\s*<!--dn-buckets:([^>]+)-->/;
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

const activeTodoBucket = ref(formatTodoBucketDate());
const tileDateInputRef = ref<HTMLInputElement | null>(null);

function newTileTodoItem(bucket = activeTodoBucket.value): TileTodoItem {
  return { done: false, text: "", bucket: normalizeTodoBucket(bucket), createdAt: new Date().toISOString() };
}

function todoCreatedTime(item: TileTodoItem) {
  const time = Date.parse(item.createdAt);
  return Number.isNaN(time) ? Number(item.createdAt) || 0 : time;
}

const isTodo = computed(() => props.content.startsWith(TODO_MARKER));
const tileTodoItems = computed(() => {
  if (!isTodo.value) return [];
  const raw = props.content
    .slice(TODO_MARKER.length)
    .replace(TODO_BUCKET_MARKER, "")
    .replace(TODO_BUCKETS_RE, "")
    .replace(/^\r?\n/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
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
      bucket: normalizeTodoBucket(meta.bucket || formatTodoBucketDate()),
      createdAt: meta.created || `${index}`,
    };
  });
  return items;
});

const tileTodoBuckets = computed(() => {
  const bucketMatch = props.content.match(TODO_BUCKETS_RE);
  const savedBuckets = bucketMatch?.[1]
    .split(",")
    .map((bucket) => normalizeTodoBucket(decodeURIComponent(bucket)))
    .filter(Boolean) ?? [];
  const itemBuckets = tileTodoItems.value.map((item) => normalizeTodoBucket(item.bucket));
  return Array.from(new Set([...savedBuckets, ...itemBuckets])).sort((a, b) => b.localeCompare(a));
});

const activeTileTodoItems = computed(() =>
  (tileTodoItems.value.some((item) => normalizeTodoBucket(item.bucket) === activeTodoBucket.value)
    ? tileTodoItems.value.map((item, index) => ({ item, index }))
    : [...tileTodoItems.value.map((item, index) => ({ item, index })), { item: newTileTodoItem(activeTodoBucket.value), index: -1 }])
    .filter(({ item }) => normalizeTodoBucket(item.bucket) === activeTodoBucket.value)
    .sort((left, right) => {
      if (left.item.done !== right.item.done) return left.item.done ? 1 : -1;
      if (left.item.done) return todoCreatedTime(left.item) - todoCreatedTime(right.item);
      return todoCreatedTime(right.item) - todoCreatedTime(left.item);
    }),
);

watch(tileTodoBuckets, (buckets) => {
  if (!buckets.includes(activeTodoBucket.value)) activeTodoBucket.value = buckets[0] || formatTodoBucketDate();
});

function writeTileTodoItems(items: TileTodoItem[], extraBuckets: string[] = [], removeBuckets: string[] = []) {
  const removed = new Set(removeBuckets.map(normalizeTodoBucket));
  const buckets = Array.from(
    new Set([
      ...tileTodoBuckets.value,
      ...extraBuckets.map(normalizeTodoBucket),
      ...items.map((item) => normalizeTodoBucket(item.bucket || formatTodoBucketDate())),
    ]),
  )
    .filter((bucket) => !removed.has(bucket))
    .sort((a, b) => b.localeCompare(a));
  const bucketMeta = `${TODO_BUCKET_MARKER} <!--dn-buckets:${buckets.map((bucket) => encodeURIComponent(bucket)).join(",")}-->`;
  emit(
    "updateContent",
    `${TODO_MARKER}\n${bucketMeta}\n${items
      .map((item) => {
        const bucket = normalizeTodoBucket(item.bucket || formatTodoBucketDate());
        const bucketMeta = ` <!--dn-bucket:${encodeURIComponent(bucket)}-->`;
        const createdMeta = ` <!--dn-created:${encodeURIComponent(item.createdAt || new Date().toISOString())}-->`;
        return `[${item.done ? "x" : " "}] ${item.text}${bucketMeta}${createdMeta}`;
      })
      .join("\n")}`,
  );
}

function updateTileTodoText(index: number, value: string) {
  if (index < 0) {
    writeTileTodoItems([...tileTodoItems.value, { ...newTileTodoItem(activeTodoBucket.value), text: value }]);
    return;
  }
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], text: value };
  writeTileTodoItems(items);
}

function toggleTileTodo(index: number) {
  if (index < 0) return;
  const items = [...tileTodoItems.value];
  items[index] = { ...items[index], done: !items[index].done };
  writeTileTodoItems(items);
}

function addTileTodo(index = tileTodoItems.value.length - 1) {
  const items = [...tileTodoItems.value];
  const insertIndex = index < 0 ? items.length : index + 1;
  items.splice(insertIndex, 0, newTileTodoItem(activeTodoBucket.value));
  writeTileTodoItems(items);
  return insertIndex;
}

function removeTileTodo(index: number) {
  if (index < 0) return;
  const removedBucket = normalizeTodoBucket(tileTodoItems.value[index]?.bucket || activeTodoBucket.value);
  const items = tileTodoItems.value.filter((_, itemIndex) => itemIndex !== index);
  const hasBucketItem = items.some((item) => normalizeTodoBucket(item.bucket) === removedBucket);
  const nextActiveBucket = hasBucketItem
    ? removedBucket
    : tileTodoBuckets.value.find((bucket) => bucket !== removedBucket) || formatTodoBucketDate();
  activeTodoBucket.value = nextActiveBucket;
  writeTileTodoItems(items, [], hasBucketItem ? [] : [removedBucket]);
}

function handleTileTodoKeydown(event: KeyboardEvent, index: number) {
  if (event.key === "Enter") {
    event.preventDefault();
    const nextIndex = addTileTodo(index);
    void nextTick(() => {
      document.querySelector<HTMLInputElement>(`[data-tile-todo-index="${nextIndex}"]`)?.focus();
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

function addTileTodoBucket(bucketValue: string) {
  const bucket = normalizeTodoBucket(bucketValue);
  if (!bucket) return;
  activeTodoBucket.value = bucket;
  const hasBucketItem = tileTodoItems.value.some((item) => normalizeTodoBucket(item.bucket) === bucket);
  const items = hasBucketItem ? tileTodoItems.value : [...tileTodoItems.value, newTileTodoItem(bucket)];
  writeTileTodoItems(items, [bucket]);
}

function openTileDatePicker() {
  const input = tileDateInputRef.value;
  if (!input) return;
  input.value = formatTodoDateInput();
  input.showPicker?.();
  input.focus();
}

function selectTileTodoBucket(bucket: string) {
  bucket = normalizeTodoBucket(bucket);
  activeTodoBucket.value = bucket;
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
        <button title="Copy" aria-label="Copy" @pointerdown.prevent="$emit('copy')" @click="$emit('copy')">C</button>
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
            ]"
            @click="selectTileTodoBucket(bucket)"
          >
            <span>{{ bucket }}</span>
          </button>
          <button v-if="editing" class="tile-todo-bucket-add" title="新增日期" @click="openTileDatePicker">+</button>
          <input
            v-if="editing"
            ref="tileDateInputRef"
            class="tile-todo-date-input"
            type="date"
            :value="formatTodoDateInput()"
            @change="addTileTodoBucket(($event.target as HTMLInputElement).value)"
          />
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
