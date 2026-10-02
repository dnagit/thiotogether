<script setup lang="ts">
/**
 * A word-processor-style box for text the site shows as written: bold, size, colour,
 * alignment, lists and links, with a toolbar instead of hand-written HTML.
 *
 * The value is HTML. Enter starts a new line and an empty line stays empty — the site shows
 * paragraphs without gaps of their own, so what is typed here is what the page shows. Text
 * saved before this editor existed was plain, and is read in line by line (`plainTextToHtml`)
 * so that its line breaks survive the first edit.
 */
import { onBeforeUnmount, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { ElMessageBox } from 'element-plus';
import { plainTextToHtml } from '@cms/shared';

const props = withDefaults(defineProps<{ modelValue?: string | null; disabled?: boolean }>(), {
  modelValue: '',
  disabled: false,
});
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px'];

const ALIGNS = [
  { value: 'left', label: 'ชิดซ้าย', icon: '⇤' },
  { value: 'center', label: 'กึ่งกลาง', icon: '↔' },
  { value: 'right', label: 'ชิดขวา', icon: '⇥' },
  { value: 'justify', label: 'เต็มบรรทัด', icon: '☰' },
] as const;

const editor = useEditor({
  content: plainTextToHtml(props.modelValue),
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      link: { openOnClick: false },
    }),
    TextStyle,
    FontSize,
    Color,
    TextAlign.configure({ types: ['paragraph'] }),
  ],
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.isEmpty ? '' : e.getHTML()),
});

/** The page loads its data after the editor is up; take it in without echoing it back. */
watch(
  () => props.modelValue,
  (value) => {
    const e = editor.value;
    if (!e) return;
    const html = plainTextToHtml(value);
    const current = e.isEmpty ? '' : e.getHTML();
    if (html !== current) e.commands.setContent(html, { emitUpdate: false });
  },
);
watch(
  () => props.disabled,
  (disabled) => editor.value?.setEditable(!disabled),
);
onBeforeUnmount(() => editor.value?.destroy());

const fontSize = (): string => editor.value?.getAttributes('textStyle').fontSize ?? '';
const color = (): string => editor.value?.getAttributes('textStyle').color ?? '';

function setFontSize(size: string): void {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  (size ? chain.setFontSize(size) : chain.unsetFontSize()).run();
}

function setColor(value: string | null): void {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  (value ? chain.setColor(value) : chain.unsetColor()).run();
}

async function setLink(): Promise<void> {
  const e = editor.value;
  if (!e) return;
  const previous = e.getAttributes('link').href ?? '';
  let href: string;
  try {
    ({ value: href } = await ElMessageBox.prompt('ลิงก์ (ว่างไว้ = เอาลิงก์ออก)', 'ใส่ลิงก์', {
      inputValue: previous,
      inputPlaceholder: 'https://… หรือ /หน้าในเว็บ',
      confirmButtonText: 'ตกลง',
      cancelButtonText: 'ยกเลิก',
    }));
  } catch {
    return; // Cancelled.
  }
  const chain = e.chain().focus().extendMarkRange('link');
  (href.trim() ? chain.setLink({ href: href.trim() }) : chain.unsetLink()).run();
}
</script>

<template>
  <div class="rte" :class="{ 'is-disabled': disabled }">
    <div v-if="editor && !disabled" class="toolbar">
      <ElSelect
        :model-value="fontSize()"
        size="small"
        class="size"
        placeholder="ขนาดตัวอักษร"
        @update:model-value="setFontSize"
      >
        <ElOption label="ขนาดปกติ" value="" />
        <ElOption v-for="s in FONT_SIZES" :key="s" :label="s" :value="s" />
      </ElSelect>

      <span class="sep" />
      <button type="button" title="ตัวหนา" :class="{ on: editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
      <button type="button" title="ตัวเอียง" :class="{ on: editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
      <button type="button" title="ขีดเส้นใต้" :class="{ on: editor.isActive('underline') }" @click="editor.chain().focus().toggleUnderline().run()"><u>U</u></button>
      <ElColorPicker :model-value="color()" size="small" title="สีตัวอักษร" @update:model-value="setColor" />

      <span class="sep" />
      <button
        v-for="a in ALIGNS"
        :key="a.value"
        type="button"
        :title="a.label"
        :class="{ on: editor.isActive({ textAlign: a.value }) }"
        @click="editor.chain().focus().setTextAlign(a.value).run()"
      >{{ a.icon }}</button>

      <span class="sep" />
      <button type="button" title="รายการแบบจุด" :class="{ on: editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">•</button>
      <button type="button" title="รายการแบบตัวเลข" :class="{ on: editor.isActive('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()">1.</button>
      <button type="button" title="ลิงก์" :class="{ on: editor.isActive('link') }" @click="setLink">🔗</button>

      <span class="sep" />
      <button type="button" title="ย้อนกลับ" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">↶</button>
      <button type="button" title="ทำซ้ำ" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">↷</button>
    </div>
    <EditorContent :editor="editor" class="content" />
  </div>
</template>

<style scoped>
.rte {
  width: 100%;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: #fff;
}
.rte:focus-within {
  border-color: var(--el-color-primary);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}
.toolbar button {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.toolbar button:hover:not(:disabled) {
  background: var(--el-fill-color);
}
.toolbar button.on {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}
.size {
  width: 120px;
}
.sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--el-border-color);
}

/* Spacing matches the site: no gap between paragraphs, an empty one is a blank line. */
.content :deep(.tiptap) {
  min-height: 180px;
  padding: 10px 12px;
  outline: none;
  line-height: 1.85;
  font-size: 14px;
}
.content :deep(.tiptap p) {
  margin: 0;
}
.content :deep(.tiptap ul),
.content :deep(.tiptap ol) {
  margin: 0;
  padding-left: 1.5em;
}
.content :deep(.tiptap a) {
  color: var(--el-color-primary);
  text-decoration: underline;
}
.is-disabled .content :deep(.tiptap) {
  background: var(--el-disabled-bg-color);
  cursor: not-allowed;
}
</style>
