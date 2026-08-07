<script setup lang="ts">
/**
 * Keep this card, or copy a link to it.
 *
 * Its own component because the same two buttons stand under the card in its popup and on
 * the screen a visitor lands on after writing a wish, where there is no popup at all — and
 * the part worth having in exactly one place is {@link savesToPhotos}, which decides where
 * a saved picture actually ends up.
 *
 * The card itself is the parent's: this only needs to be able to reach its `<svg>`.
 */
import { computed, ref } from 'vue';
import { cardFileName, svgToPng } from './wishCard';
import { inkColor, isLightColor, lighten, outlineColor } from './balloon';

const props = withDefaults(
  defineProps<{
    /** Reached through a getter, because the card usually mounts after this does. */
    svg: () => SVGSVGElement | null;
    /** Whose wish it is; the file is named after them. */
    name: string;
    /** Absolute link that reopens this card. Empty hides the copy button. */
    link?: string;
    /** The event's colour, so the buttons belong to the party rather than to the browser. */
    themeColor?: string | null;
    /** Centred under a card that is itself centred; left-aligned in the popup. */
    center?: boolean;
  }>(),
  { link: '', themeColor: null, center: false },
);

const saving = ref(false);
const note = ref<string | null>(null);

async function renderPng(): Promise<File | null> {
  const svg = props.svg();
  if (!svg) return null;
  const blob = await svgToPng(svg);
  return new File([blob], cardFileName(props.name), { type: 'image/png' });
}

/**
 * Whether "save" should go through the share sheet rather than download the file.
 *
 * On a phone a blob download is not a saved photo: iOS files it away in Files and Android
 * drops it in Downloads, and either way it is not in the camera roll the visitor went
 * looking for. The share sheet is the only route to Photos, and "Save Image" is the first
 * thing on it. A desktop share sheet has no such entry, so there a download is still right.
 */
const savesToPhotos = computed(
  () =>
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)')?.matches === true,
);

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick so Safari has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  note.value = null;
  try {
    const file = await renderPng();
    if (!file) return;

    if (savesToPhotos.value && navigator.canShare?.({ files: [file] })) {
      try {
        // The picture alone, with no accompanying text: this is the save button, and a
        // sheet given something to say tends to offer to say it somewhere.
        await navigator.share({ files: [file], title: `คำอวยพรจาก ${props.name}` });
        return;
      } catch (err: any) {
        // Dismissing the sheet is a decision, not a failure — nothing more to do.
        if (err?.name === 'AbortError') return;
        // Anything else (a browser that offers the sheet and then refuses it) falls
        // through to the download, which at least puts the file somewhere.
      }
    }

    download(file);
  } catch {
    note.value = 'บันทึกรูปไม่สำเร็จ ลองกดค้างที่การ์ดเพื่อบันทึกแทนได้';
  } finally {
    saving.value = false;
  }
}

async function copyLink(): Promise<void> {
  if (!props.link) return;
  try {
    await navigator.clipboard.writeText(props.link);
    note.value = 'คัดลอกลิงก์แล้ว';
  } catch {
    note.value = 'คัดลอกไม่สำเร็จ กรุณาคัดลอกจากแถบที่อยู่';
  }
}

/**
 * The buttons, dressed in the event's colour.
 *
 * Handed to the CSS as custom properties rather than inline styles on each button, so the
 * hover and disabled states stay in the stylesheet with the rest of the states.
 *
 * Only the filled button gets the colour itself. Everything drawn *on* white — the outline
 * button's text, and the tints its border and hover are mixed from — comes from
 * {@link inkColor} instead, because a theme is free to be yellow, or white, and the raw
 * shade of either is not something a label can be read in.
 */
const theme = computed(() => props.themeColor || '#111827');
const buttonTheme = computed(() => {
  const ink = inkColor(theme.value);
  return {
    '--act-fill': theme.value,
    '--act-fill-ink': isLightColor(theme.value) ? '#1f2937' : '#ffffff',
    '--act-fill-edge': outlineColor(theme.value),
    '--act-ink': ink,
    '--act-line': lighten(ink, 0.62),
    '--act-wash': lighten(ink, 0.92),
  };
});

defineExpose({ saving });
</script>

<template>
  <div :style="buttonTheme">
    <div class="flex flex-wrap gap-2" :class="center ? 'justify-center' : ''">
      <button type="button" class="act act-primary" :disabled="saving" @click="save">
        {{ saving ? 'กำลังบันทึก…' : savesToPhotos ? '💾 บันทึกลงคลังรูป' : '💾 บันทึกรูป' }}
      </button>
      <button v-if="link" type="button" class="act" @click="copyLink">🔗 คัดลอกลิงก์</button>
    </div>

    <!-- The sheet is the phone's, so the wording that follows is the phone's too. -->
    <p v-if="savesToPhotos" class="mt-2 text-xs text-gray-500" :class="center ? 'text-center' : ''">
      เลือก “บันทึกรูปภาพ” ในเมนูที่ขึ้นมา เพื่อเก็บการ์ดไว้ในคลังรูปของเครื่อง
    </p>

    <p
      v-if="note"
      class="mt-3 text-sm text-gray-600"
      :class="center ? 'text-center' : ''"
      role="status"
      aria-live="polite"
    >
      {{ note }}
    </p>
  </div>
</template>

<style scoped>
/* The `--act-*` properties are the event's colour, set on the wrapper by the script. */
.act {
  @apply inline-block rounded-lg border px-4 py-2.5 text-center text-sm font-semibold
         transition disabled:cursor-not-allowed disabled:opacity-50;
  border-color: var(--act-line);
  color: var(--act-ink);
}
.act:hover:not(:disabled) {
  background: var(--act-wash);
}
.act-primary {
  background: var(--act-fill);
  border-color: var(--act-fill-edge);
  color: var(--act-fill-ink);
}
.act-primary:hover:not(:disabled) {
  background: var(--act-fill);
  opacity: 0.9;
}
</style>
