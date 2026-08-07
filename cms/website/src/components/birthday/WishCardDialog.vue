<script setup lang="ts">
/**
 * The card behind a balloon, and the one thing people want to do with it: keep it.
 *
 * Keeping it means a PNG, built from the rendered `<svg>` so nothing here has to know the
 * layout. Where that PNG goes depends on the device — see {@link savesToPhotos}, which is
 * the whole of the difference between a phone and a desktop here.
 *
 * The card stays addressable through `?wish=`, which is what the copy-link button hands
 * over and what reopens the card on whoever it is sent to.
 */
import { computed, ref } from 'vue';
import AppModal from '@/components/AppModal.vue';
import WishCard from './WishCard.vue';
import { cardFileName, svgToPng } from './wishCard';
import { inkColor, isLightColor, lighten, outlineColor } from './balloon';
import type { Wish } from '@/api/birthday';

const props = withDefaults(
  defineProps<{
    wish: Wish | null;
    eventTitle?: string | null;
    celebrantName?: string | null;
    /** Absolute link that reopens this exact card; empty hides the copy-link button. */
    shareUrl?: string;
    /** The event's colour, so the buttons belong to the party rather than to the browser. */
    themeColor?: string | null;
  }>(),
  { eventTitle: null, celebrantName: null, shareUrl: '', themeColor: null },
);

defineEmits<{ close: [] }>();

const card = ref<InstanceType<typeof WishCard> | null>(null);
const saving = ref(false);
const note = ref<string | null>(null);

/** The card's root `<svg>`, reached through the child's exposed ref. */
function svgElement(): SVGSVGElement | null {
  return card.value?.svg ?? null;
}

async function renderPng(): Promise<File | null> {
  const svg = svgElement();
  if (!svg || !props.wish) return null;
  const blob = await svgToPng(svg);
  return new File([blob], cardFileName(props.wish.name), { type: 'image/png' });
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
        await navigator.share({ files: [file], title: `คำอวยพรจาก ${props.wish?.name ?? ''}` });
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

/**
 * The buttons, dressed in the event's colour.
 *
 * Handed to the CSS as custom properties rather than inline styles on each button, so the
 * hover and disabled states stay in the stylesheet with the rest of the states.
 *
 * Only the filled button gets the colour itself. Everything drawn *on* white — the outline
 * buttons' text, and the tints their border and hover are mixed from — comes from
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

async function copyLink(): Promise<void> {
  if (!props.shareUrl) return;
  try {
    await navigator.clipboard.writeText(props.shareUrl);
    note.value = 'คัดลอกลิงก์แล้ว';
  } catch {
    note.value = 'คัดลอกไม่สำเร็จ กรุณาคัดลอกจากแถบที่อยู่';
  }
}
</script>

<template>
  <AppModal
    :open="!!wish"
    size="lg"
    :busy="saving"
    :title="wish ? `การ์ดอวยพรจาก ${wish.name}` : ''"
    @close="$emit('close')"
  >
    <template v-if="wish">
      <WishCard
        ref="card"
        :name="wish.name"
        :message="wish.message"
        :balloon-shape="wish.balloonShape"
        :balloon-color="wish.balloonColor"
        :photo-url="wish.photoUrl"
        :framing="wish.photoFraming"
        :gift-name="wish.gift?.name"
        :gift-image="wish.gift?.imageUrl"
        :event-title="eventTitle"
        :celebrant-name="celebrantName"
        :created-at="wish.createdAt"
      />

      <div :style="buttonTheme">
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" class="act act-primary" :disabled="saving" @click="save">
            {{ saving ? 'กำลังบันทึก…' : savesToPhotos ? '💾 บันทึกลงคลังรูป' : '💾 บันทึกรูป' }}
          </button>
          <button v-if="shareUrl" type="button" class="act" @click="copyLink">🔗 คัดลอกลิงก์</button>
        </div>

        <!-- The sheet is the phone's, so the wording that follows is the phone's too. -->
        <p v-if="savesToPhotos" class="mt-2 text-xs text-gray-500">
          เลือก “บันทึกรูปภาพ” ในเมนูที่ขึ้นมา เพื่อเก็บการ์ดไว้ในคลังรูปของเครื่อง
        </p>

        <p v-if="note" class="mt-3 text-sm text-gray-600" role="status" aria-live="polite">
          {{ note }}
        </p>

        <button type="button" class="act mt-3 w-full" @click="$emit('close')">ปิด</button>
      </div>
    </template>
  </AppModal>
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
