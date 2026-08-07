<script setup lang="ts">
/**
 * Upload a photo and frame it inside the balloon.
 *
 * The editor *is* the balloon — dragging happens on the real artwork rather than on a
 * square that is cropped later, so a heart-shaped balloon shows straight away that the
 * corners of the picture will never appear. Three numbers come out of it (zoom and an
 * x/y offset), and the wall re-applies them to the original upload.
 *
 * Panning is clamped to the photo's own overflow, so a picture can be moved exactly as
 * far as it can go without exposing the shape behind it and no further. That bound needs
 * the natural size, which is why the picture is measured on load before dragging is allowed.
 *
 * Fully controlled: the parent owns the file *and* its object URL, since the same URL also
 * feeds the whole-wish preview and two components minting one apiece would leak.
 */
import { computed, ref, watch } from 'vue';
import { DEFAULT_FRAMING, FRAMING_LIMITS, maxPan, type PhotoFraming } from './balloon';
import { isImageFile, prepareImage } from '@/utils/image';
import WishBalloon from './WishBalloon.vue';

const props = defineProps<{
  photoUrl: string | null;
  framing: PhotoFraming;
  shape: string;
  color: string;
}>();

const emit = defineEmits<{
  /** A prepared file, ready to upload — already downscaled and converted from HEIC. */
  select: [File];
  clear: [];
  'update:framing': [PhotoFraming];
}>();

const MAX_BYTES = 10 * 1024 * 1024;

const stage = ref<HTMLElement | null>(null);
const replaceInput = ref<HTMLInputElement | null>(null);
const natural = ref<{ width: number; height: number } | null>(null);
const dragOver = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

/**
 * Measure the picture whenever it changes. It is probed through a detached `Image` because
 * the balloon draws it through an SVG `<image>`, which reports no intrinsic size — and the
 * pan limits are derived from exactly that.
 */
watch(
  () => props.photoUrl,
  (url) => {
    natural.value = null;
    if (!url) return;
    const probe = new Image();
    probe.onload = () => (natural.value = { width: probe.naturalWidth, height: probe.naturalHeight });
    probe.src = url;
  },
  { immediate: true },
);

const limits = computed(() =>
  natural.value ? maxPan(natural.value.width, natural.value.height, props.framing.zoom) : { x: 0, y: 0 },
);
const canPan = computed(() => limits.value.x > 0.5 || limits.value.y > 0.5);

function commit(next: Partial<PhotoFraming>): void {
  const zoom = Math.min(
    FRAMING_LIMITS.maxZoom,
    Math.max(FRAMING_LIMITS.minZoom, next.zoom ?? props.framing.zoom),
  );
  // Recomputed against the *new* zoom: zooming back out has to reel the photo in too, or
  // the offset it was left at would pull a bare edge into the shape.
  const bound = natural.value ? maxPan(natural.value.width, natural.value.height, zoom) : { x: 0, y: 0 };
  const clamp = (value: number, max: number): number => Math.min(max, Math.max(-max, value));

  emit('update:framing', {
    zoom,
    x: clamp(next.x ?? props.framing.x, bound.x),
    y: clamp(next.y ?? props.framing.y, bound.y),
  });
}

async function accept(picked: File | null | undefined): Promise<void> {
  if (!picked) return;
  if (!isImageFile(picked)) {
    error.value = 'กรุณาเลือกไฟล์รูปภาพ';
    return;
  }

  busy.value = true;
  error.value = null;
  try {
    const file = await prepareImage(picked);
    // Checked after conversion, since that is the size actually uploaded.
    if (file.size > MAX_BYTES) {
      error.value = 'ไฟล์ใหญ่เกิน 10 MB กรุณาเลือกรูปอื่น';
      return;
    }
    emit('select', file);
    // A fresh picture starts centred — carrying the last one's framing over would drop it
    // in at an offset the visitor never chose.
    emit('update:framing', { ...DEFAULT_FRAMING });
  } finally {
    busy.value = false;
  }
}

/** Clearing the input afterwards lets the same file be re-picked, which otherwise fires no change. */
function onPick(event: Event): void {
  const target = event.target as HTMLInputElement;
  void accept(target.files?.[0]).finally(() => (target.value = ''));
}

function onDrop(event: DragEvent): void {
  dragOver.value = false;
  void accept(event.dataTransfer?.files?.[0]);
}

function remove(): void {
  emit('clear');
  emit('update:framing', { ...DEFAULT_FRAMING });
}

// ── Dragging ────────────────────────────────────────────────
// Pointer events cover mouse, pen and touch in one path; capture keeps the gesture alive
// when a fast drag leaves the balloon, which is common on a small preview.

let origin: { pointerX: number; pointerY: number; x: number; y: number } | null = null;

function onPointerDown(event: PointerEvent): void {
  if (!props.photoUrl || !canPan.value) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  origin = { pointerX: event.clientX, pointerY: event.clientY, x: props.framing.x, y: props.framing.y };
}

function onPointerMove(event: PointerEvent): void {
  if (!origin || !stage.value) return;
  // Screen pixels → box units: the balloon's own box is 100 wide whatever it is rendered at,
  // so the photo keeps pace with the finger at every preview size.
  const perUnit = stage.value.clientWidth / 100;
  if (!perUnit) return;
  commit({
    x: origin.x + (event.clientX - origin.pointerX) / perUnit,
    y: origin.y + (event.clientY - origin.pointerY) / perUnit,
  });
}

function endDrag(): void {
  origin = null;
}

function nudge(dx: number, dy: number): void {
  commit({ x: props.framing.x + dx, y: props.framing.y + dy });
}

function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 8 : 2;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const move = moves[event.key];
  if (!move || !canPan.value) return;
  event.preventDefault();
  nudge(move[0], move[1]);
}

const zoomPercent = computed(() => Math.round(props.framing.zoom * 100));
</script>

<template>
  <div>
    <div class="mb-2 flex items-baseline justify-between gap-2">
      <span class="font-semibold text-gray-800">รูปบนลูกโป่ง</span>
      <span class="text-xs text-gray-500">ไม่ใส่ก็ได้</span>
    </div>

    <!-- Empty: drop zone -->
    <label
      v-if="!photoUrl"
      class="dropzone"
      :class="{ 'dropzone-over': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <input type="file" accept="image/*,.heic,.heif" class="sr-only" @change="onPick" />
      <span class="text-3xl" aria-hidden="true">🖼️</span>
      <span class="font-semibold">{{ busy ? 'กำลังเตรียมรูป…' : 'เลือกรูป หรือลากรูปมาวางที่นี่' }}</span>
      <span class="text-xs text-gray-500">JPG, PNG หรือ HEIC ขนาดไม่เกิน 10 MB</span>
    </label>

    <!-- Chosen: frame it on the balloon itself -->
    <div v-else class="framer">
      <div
        ref="stage"
        class="stage"
        :class="{ 'stage-pannable': canPan }"
        tabindex="0"
        role="group"
        aria-label="ปรับตำแหน่งรูปในลูกโป่ง ลากเพื่อเลื่อน หรือใช้ปุ่มลูกศร"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onKeydown"
      >
        <!-- Balloon only: the gift and tag belong to the whole-wish preview, not to framing. -->
        <WishBalloon
          :shape="shape"
          :color="color"
          :photo-url="photoUrl"
          :framing="framing"
          :show-gift="false"
        />
      </div>

      <div class="controls">
        <label class="block">
          <span class="text-sm font-medium text-gray-700">ย่อ / ขยาย · {{ zoomPercent }}%</span>
          <input
            type="range"
            class="w-full accent-gray-900"
            :min="FRAMING_LIMITS.minZoom"
            :max="FRAMING_LIMITS.maxZoom"
            step="0.05"
            :value="framing.zoom"
            @input="commit({ zoom: Number(($event.target as HTMLInputElement).value) })"
          />
        </label>

        <p class="text-xs text-gray-500">
          {{
            canPan
              ? 'ลากรูปในลูกโป่งเพื่อเลือกส่วนที่จะให้แสดง'
              : 'ขยายรูปก่อน จึงจะเลื่อนเลือกส่วนที่จะแสดงได้'
          }}
        </p>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="mini-btn" @click="commit({ ...DEFAULT_FRAMING })">
            รีเซ็ตตำแหน่ง
          </button>
          <button type="button" class="mini-btn" @click="replaceInput?.click()">เปลี่ยนรูป</button>
          <button type="button" class="mini-btn mini-btn-danger" @click="remove">ลบรูป</button>
          <input
            ref="replaceInput"
            type="file"
            accept="image/*,.heic,.heif"
            class="sr-only"
            @change="onPick"
          />
        </div>
      </div>
    </div>

    <p v-if="error" class="mt-2 text-sm text-red-600" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.75rem 1rem;
  border: 2px dashed #d1d5db;
  border-radius: 16px;
  background: #f9fafb;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.dropzone:hover,
.dropzone-over {
  border-color: #111827;
  background: #f3f4f6;
}
.dropzone:focus-within {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}

.framer {
  display: grid;
  gap: 1rem;
  align-items: center;
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
}
@media (max-width: 480px) {
  .framer {
    grid-template-columns: 1fr;
    justify-items: center;
  }
}

.stage {
  /* A length, not a percentage: the balloon derives its type size from this with `calc()`,
     and a percentage there would resolve against the font size instead of the width. */
  --balloon-w: min(180px, 58vw);
  width: var(--balloon-w);
  border-radius: 16px;
  /* `touch-action` is what stops a drag on the balloon from scrolling the page behind it —
     without it a touch pan is stolen by the browser before the first pointermove lands. */
  touch-action: none;
}
.stage:focus-visible {
  outline: 3px solid #1d4ed8;
  outline-offset: 4px;
}
.stage-pannable {
  cursor: grab;
}
.stage-pannable:active {
  cursor: grabbing;
}

.controls {
  display: grid;
  gap: 0.6rem;
  width: 100%;
}

.mini-btn {
  padding: 0.4rem 0.85rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  color: #374151;
  transition: background-color 0.15s ease;
}
.mini-btn:hover {
  background: #f3f4f6;
}
.mini-btn-danger {
  color: #b91c1c;
  border-color: #fecaca;
}

@media (prefers-reduced-motion: reduce) {
  .dropzone,
  .mini-btn {
    transition: none;
  }
}
</style>
