<script setup lang="ts">
/**
 * The card behind a balloon, with the two things people want to do with it: keep it and
 * pass it on.
 *
 * Sharing prefers the native share sheet with the PNG attached, because that is what puts
 * the card itself into LINE or Messenger rather than a link someone has to tap. Desktop
 * browsers have no such sheet, so there the same buttons fall back to per-network share
 * URLs carrying a link to this wish — which is why the card is addressable at all.
 *
 * Every export is built from the rendered `<svg>`, so nothing here has to know the layout.
 */
import { computed, ref } from 'vue';
import AppModal from '@/components/AppModal.vue';
import WishCard from './WishCard.vue';
import { cardFileName, svgToPng } from './wishCard';
import type { Wish } from '@/api/birthday';

const props = defineProps<{
  wish: Wish | null;
  eventTitle?: string | null;
  celebrantName?: string | null;
  /** Absolute link that reopens this exact card; empty disables the link-based buttons. */
  shareUrl?: string;
}>();

defineEmits<{ close: [] }>();

const card = ref<InstanceType<typeof WishCard> | null>(null);
const busy = ref<'save' | 'share' | null>(null);
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

async function save(): Promise<void> {
  if (busy.value) return;
  busy.value = 'save';
  note.value = null;
  try {
    const file = await renderPng();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on the next tick so Safari has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    note.value = 'บันทึกรูปไม่สำเร็จ ลองกดค้างที่การ์ดเพื่อบันทึกแทนได้';
  } finally {
    busy.value = null;
  }
}

const canShareFiles = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
);

async function share(): Promise<void> {
  if (busy.value || !props.wish) return;
  busy.value = 'share';
  note.value = null;
  try {
    const file = await renderPng();
    const text = `คำอวยพรจาก ${props.wish.name}`;
    // `canShare` is asked about this exact payload: a browser may have `share` but refuse
    // files, in which case sharing the link alone still works.
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: text, text });
    } else if (props.shareUrl) {
      await navigator.share({ title: text, text, url: props.shareUrl });
    }
  } catch (err: any) {
    // Dismissing the share sheet rejects with AbortError; that is not a failure.
    if (err?.name !== 'AbortError') note.value = 'แชร์ไม่สำเร็จ ลองบันทึกรูปแล้วแชร์เองได้';
  } finally {
    busy.value = null;
  }
}

const networks = computed(() => {
  const url = encodeURIComponent(props.shareUrl ?? '');
  if (!props.shareUrl) return [];
  return [
    { label: 'LINE', href: `https://social-plugins.line.me/lineit/share?url=${url}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${url}` },
  ];
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
    :busy="!!busy"
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

      <div class="mt-5 flex flex-wrap gap-2">
        <button type="button" class="act act-primary" :disabled="!!busy" @click="save">
          {{ busy === 'save' ? 'กำลังบันทึก…' : '💾 บันทึกรูป' }}
        </button>
        <button
          v-if="canShareFiles"
          type="button"
          class="act"
          :disabled="!!busy"
          @click="share"
        >
          {{ busy === 'share' ? 'กำลังเตรียม…' : '📤 แชร์การ์ด' }}
        </button>
        <button v-if="shareUrl" type="button" class="act" @click="copyLink">🔗 คัดลอกลิงก์</button>
      </div>

      <!-- Desktop has no share sheet, so the networks are offered directly. -->
      <div v-if="!canShareFiles && networks.length" class="mt-2 flex flex-wrap gap-2">
        <a
          v-for="net in networks"
          :key="net.label"
          class="act"
          :href="net.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          แชร์ไป {{ net.label }}
        </a>
      </div>

      <p v-if="note" class="mt-3 text-sm text-gray-600" role="status" aria-live="polite">{{ note }}</p>

      <button type="button" class="act mt-3 w-full" @click="$emit('close')">ปิด</button>
    </template>
  </AppModal>
</template>

<style scoped>
.act {
  @apply inline-block rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold
         transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50;
}
.act-primary {
  @apply border-gray-900 bg-gray-900 text-white hover:bg-gray-800;
}
</style>
