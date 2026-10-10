<script setup lang="ts">
/**
 * The trail as a poster to post: its name, then a card per restaurant — the restaurant's
 * picture, its name and note, and its dishes in a grid of pictures, each with an empty box to
 * tick — drawn in a <canvas> and saved as a PNG.
 *
 * The poster grows as tall as the trail needs. Past what a phone's canvas can hold it is drawn
 * smaller rather than cut off.
 *
 * Pictures come through the API (`/food-trails/assets/…`) rather than from their own URLs:
 * a canvas that has drawn a cross-origin picture without CORS headers refuses to be saved —
 * the DJ poster's panel says more.
 */
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { http } from '@/api/http';
import type { FoodTrailTree } from '@cms/shared';

const props = defineProps<{ trail: FoodTrailTree }>();

// ── Look, remembered in this browser ──
const STORE_KEY = 'food-trail-poster';
const look = reactive({
  background: '#fff4e8',
  accent: '#ea480c',
  columns: 3,
  checkboxes: true,
  footer: '#ThioTogether',
  ...JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'),
});
watch(look, (v) => localStorage.setItem(STORE_KEY, JSON.stringify(v)), { deep: true });

// ── Layout, in pixels of a 1080-wide poster ──
const W = 1080;
const PAD = 56;
const CARD_PAD = 32;
const GAP = 20;
const FONT = '"Mali", "Mitr", sans-serif';
const INK = '#2b2118';
const MUTED = '#7a6a5c';
/** Most a phone's canvas will hold: a side, and the whole area. */
const MAX_SIDE = 16000;
const MAX_AREA = 16_000_000;

/** Mali, the website's face, from Google Fonts — loaded once and awaited before any text. */
let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  if (!fontReady) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Mali:wght@400;600;700&display=swap';
    document.head.appendChild(link);
    fontReady = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    })
      .then(() =>
        Promise.all(
          ['400', '600', '700'].map((w) => document.fonts.load(`${w} 32px "Mali"`, 'ก Aa')),
        ),
      )
      .then(() => undefined)
      // Offline or blocked: draw in the fallback face rather than not at all.
      .catch(() => undefined);
  }
  return fontReady;
}

/** A picture through the API, as something a canvas may draw and still save; null if gone. */
const objectUrls: string[] = [];
async function loadImage(path: string): Promise<HTMLImageElement | null> {
  try {
    const { data } = await http.get<Blob>(path, { responseType: 'blob', params: { t: Date.now() } });
    const url = URL.createObjectURL(data);
    objectUrls.push(url);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}
onBeforeUnmount(() => objectUrls.forEach((u) => URL.revokeObjectURL(u)));

// ── Drawing helpers ──

/** Words to break between: Thai has no spaces, so the browser's word segmenter finds them. */
function pieces(text: string): string[] {
  const Seg = (Intl as any).Segmenter;
  if (Seg) return [...new Seg('th', { granularity: 'word' }).segment(text)].map((s: any) => s.segment);
  return [...text];
}

/** `text` broken into lines no wider than `max`, at most `limit` of them (the last cut with "…"). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, limit = Infinity): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const piece of pieces(para)) {
      const next = line + piece;
      if (line && ctx.measureText(next).width > max) {
        out.push(line.trimEnd());
        line = piece.trimStart();
      } else {
        line = next;
      }
      // A single piece wider than the line (a long URL): split it by character.
      while (ctx.measureText(line).width > max && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > max) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  if (out.length > limit) {
    const kept = out.slice(0, limit);
    let last = kept[limit - 1];
    while (last && ctx.measureText(last + '…').width > max) last = last.slice(0, -1);
    kept[limit - 1] = last + '…';
    return kept;
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** `img` filling the box, cropped to it, with rounded corners. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** A light wash of the accent, for empty picture spots. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── The poster ──

interface Pictures {
  places: Map<number, HTMLImageElement | null>;
  menus: Map<number, HTMLImageElement | null>;
}

/**
 * Lays the poster out top to bottom, drawing as it goes when `draw` is set; returns the
 * height it took. Run once to measure, once more to draw at that height.
 */
function paint(ctx: CanvasRenderingContext2D, pics: Pictures, draw: boolean): number {
  const t = props.trail;
  let y = PAD;
  const inner = W - PAD * 2;
  const text = (s: string, x: number, yy: number, align: 'left' | 'center' = 'left') => {
    if (!draw) return;
    ctx.textAlign = align;
    ctx.fillText(s, x, yy);
  };
  ctx.textBaseline = 'top';

  // Title and description.
  ctx.font = `700 68px ${FONT}`;
  ctx.fillStyle = look.accent;
  for (const line of wrap(ctx, t.name, inner)) {
    text(line, W / 2, y, 'center');
    y += 86;
  }
  if (t.description) {
    y += 4;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillStyle = INK;
    for (const line of wrap(ctx, t.description, inner)) {
      text(line, W / 2, y, 'center');
      y += 44;
    }
  }
  y += 28;

  // A card per restaurant.
  const cols = Math.max(1, Math.min(5, Math.round(look.columns)));
  const cardInner = inner - CARD_PAD * 2;
  const cell = (cardInner - (cols - 1) * GAP) / cols;
  const nameSize = cols >= 4 ? 22 : 26;

  t.places.forEach((place, i) => {
    const top = y;
    let cy = top + CARD_PAD;
    const x0 = PAD + CARD_PAD;

    // Measure the card first, so its background goes under everything else.
    const measure = () => {
      let h = CARD_PAD;
      const img = pics.places.get(place.id);
      if (img) h += Math.round(cardInner * 0.5) + 24;
      ctx.font = `700 40px ${FONT}`;
      h += Math.max(56, wrap(ctx, place.name, cardInner - 72).length * 52);
      if (place.note) {
        ctx.font = `400 26px ${FONT}`;
        h += 6 + wrap(ctx, place.note, cardInner - 72).length * 38;
      }
      if (place.menus.length) {
        h += 20;
        const rows = Math.ceil(place.menus.length / cols);
        h += rows * (cell + 12 + nameSize * 1.45 * 2) + (rows - 1) * GAP;
      }
      return h + CARD_PAD;
    };
    const cardH = measure();

    if (draw) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#fff';
      roundRect(ctx, PAD, top, inner, cardH, 28);
      ctx.fill();
      ctx.restore();
    }

    const placeImg = pics.places.get(place.id);
    if (placeImg) {
      const h = Math.round(cardInner * 0.5);
      if (draw) drawCover(ctx, placeImg, x0, cy, cardInner, h, 20);
      cy += h + 24;
    }

    // Number, name, note.
    if (draw) {
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(x0 + 26, cy + 26, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `700 28px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x0 + 26, cy + 28);
      ctx.textBaseline = 'top';
    }
    ctx.font = `700 40px ${FONT}`;
    ctx.fillStyle = INK;
    const nameLines = wrap(ctx, place.name, cardInner - 72);
    nameLines.forEach((line, k) => text(line, x0 + 72, cy + 2 + k * 52));
    cy += Math.max(56, nameLines.length * 52);
    if (place.note) {
      cy += 6;
      ctx.font = `400 26px ${FONT}`;
      ctx.fillStyle = MUTED;
      for (const line of wrap(ctx, place.note, cardInner - 72)) {
        text(line, x0 + 72, cy);
        cy += 38;
      }
    }

    // Dishes.
    if (place.menus.length) {
      cy += 20;
      const rowH = cell + 12 + nameSize * 1.45 * 2;
      place.menus.forEach((menu, k) => {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const mx = x0 + col * (cell + GAP);
        const my = cy + row * (rowH + GAP);
        if (!draw) return;
        const img = pics.menus.get(menu.id);
        if (img) {
          drawCover(ctx, img, mx, my, cell, cell, 18);
        } else {
          ctx.fillStyle = tint(look.accent, 0.1);
          roundRect(ctx, mx, my, cell, cell, 18);
          ctx.fill();
          // Opaque: an emoji keeps its own colours but takes the fill's transparency.
          ctx.fillStyle = '#000';
          ctx.font = `400 ${Math.round(cell * 0.35)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🍽️', mx + cell / 2, my + cell / 2);
          ctx.textBaseline = 'top';
        }

        // The name under the picture, two lines at most, with a box to tick before it.
        ctx.font = `600 ${nameSize}px ${FONT}`;
        ctx.fillStyle = INK;
        const box = look.checkboxes ? Math.round(nameSize * 0.95) : 0;
        const room = cell - (box ? box + 10 : 0);
        const lines = wrap(ctx, menu.name, room, 2);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const startX = mx + (cell - (widest + (box ? box + 10 : 0))) / 2;
        const ty = my + cell + 12;
        if (box) {
          ctx.strokeStyle = look.accent;
          ctx.lineWidth = 3;
          roundRect(ctx, startX, ty + nameSize * 0.2, box, box, 5);
          ctx.stroke();
        }
        ctx.textAlign = 'left';
        lines.forEach((line, n) => {
          const lw = ctx.measureText(line).width;
          // Centre each line in the space beside the box.
          const lx = box ? startX + box + 10 + (widest - lw) / 2 : mx + (cell - lw) / 2;
          ctx.fillText(line, lx, ty + n * nameSize * 1.45);
        });
      });
    }

    y = top + cardH + GAP + 8;
  });

  if (!t.places.length) {
    ctx.font = `400 30px ${FONT}`;
    ctx.fillStyle = MUTED;
    text('ยังไม่มีร้าน', W / 2, y, 'center');
    y += 60;
  }

  if (look.footer.trim()) {
    y += 8;
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = look.accent;
    for (const line of wrap(ctx, look.footer.trim(), inner)) {
      text(line, W / 2, y, 'center');
      y += 40;
    }
  }
  return y + PAD - GAP;
}

const canvas = ref<HTMLCanvasElement | null>(null);
const rendering = ref(false);
const ready = ref(false);
const error = ref('');
let pngBlob: Blob | null = null;
let renderId = 0;

async function render(): Promise<void> {
  error.value = '';
  ready.value = false;
  pngBlob = null;
  const el = canvas.value;
  if (!el) return;
  const id = ++renderId;
  rendering.value = true;
  try {
    const t = props.trail;
    const [places, menus] = await Promise.all([
      Promise.all(
        t.places.map(async (p) => [p.id, p.image ? await loadImage(`/food-trails/assets/place/${p.id}`) : null] as const),
      ),
      Promise.all(
        t.places.flatMap((p) => p.menus).map(
          async (m) => [m.id, m.image ? await loadImage(`/food-trails/assets/menu/${m.id}`) : null] as const,
        ),
      ),
      loadFont(),
    ]);
    if (id !== renderId) return;
    const pics: Pictures = { places: new Map(places), menus: new Map(menus) };

    const ctx = el.getContext('2d')!;
    const H = Math.ceil(paint(ctx, pics, false));
    const scale = Math.min(1, MAX_SIDE / H, Math.sqrt(MAX_AREA / (W * H)));
    el.width = Math.round(W * scale);
    el.height = Math.round(H * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = look.background;
    ctx.fillRect(0, 0, W, H);
    paint(ctx, pics, true);

    // Made now, not on the button: iOS only opens the share sheet straight from a tap.
    pngBlob = await new Promise<Blob | null>((r) => el.toBlob(r, 'image/png'));
    if (id !== renderId) return;
    ready.value = true;
  } catch {
    if (id === renderId) error.value = 'วาดรูปไม่สำเร็จ ลองกดวาดใหม่อีกครั้ง';
  } finally {
    if (id === renderId) rendering.value = false;
  }
}

onMounted(render);
watch(() => props.trail, render);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(look, () => {
  clearTimeout(timer);
  timer = setTimeout(render, 300);
});

// ── Saving ── (as the DJ poster's panel: hold-to-save on a touch screen, a download elsewhere)
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const saveOpen = ref(false);
const saveSrc = ref('');
const fileName = () => `food-trail-${props.trail.id}.png`;
const canShareFiles =
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });

async function sharePicture(): Promise<void> {
  if (!pngBlob) return;
  try {
    await navigator.share({ files: [new File([pngBlob], fileName(), { type: 'image/png' })] });
  } catch {
    // Closed without choosing anything: the hold-to-save still works.
  }
}

function download(): void {
  if (!pngBlob) return;
  if (isTouch && canvas.value) {
    saveSrc.value = canvas.value.toDataURL('image/png');
    saveOpen.value = true;
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pngBlob);
  a.download = fileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <div class="poster">
    <ElCard shadow="never" class="controls">
      <ElForm label-position="top" @submit.prevent>
        <div class="row">
          <ElFormItem label="สีพื้น">
            <ElColorPicker v-model="look.background" />
          </ElFormItem>
          <ElFormItem label="สีหลัก">
            <ElColorPicker v-model="look.accent" />
          </ElFormItem>
          <ElFormItem label="เมนูต่อแถว">
            <ElInputNumber v-model="look.columns" :min="1" :max="5" />
          </ElFormItem>
          <ElFormItem label="ช่องติ๊ก">
            <ElSwitch v-model="look.checkboxes" />
          </ElFormItem>
        </div>
        <ElFormItem label="ข้อความท้ายรูป">
          <ElInput v-model="look.footer" maxlength="200" placeholder="เช่น #ThioTogether" />
        </ElFormItem>
      </ElForm>
      <div class="buttons">
        <ElButton :loading="rendering" @click="render">วาดใหม่</ElButton>
        <ElButton type="primary" :disabled="!ready" @click="download">บันทึกรูป (PNG)</ElButton>
        <ElButton v-if="canShareFiles && isTouch" :disabled="!ready" @click="sharePicture">แชร์</ElButton>
      </div>
      <p class="hint">ใช้รูปร้านและรูปเมนูที่ลงไว้ · ร้านหรือเมนูที่ไม่มีรูปจะแสดงเป็นช่องว่าง</p>
      <p v-if="error" class="error">{{ error }}</p>
    </ElCard>

    <div v-loading="rendering" class="preview">
      <canvas ref="canvas" />
    </div>

    <ElDialog v-model="saveOpen" title="กดค้างที่รูปเพื่อบันทึก" width="95%" append-to-body>
      <img :src="saveSrc" class="save-img" alt="" />
      <template #footer>
        <ElButton v-if="canShareFiles" type="primary" @click="sharePicture">แชร์</ElButton>
        <ElButton @click="saveOpen = false">ปิด</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.poster { display: grid; gap: 16px; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); align-items: start; }
@media (max-width: 900px) { .poster { grid-template-columns: minmax(0, 1fr); } }
.row { display: flex; gap: 16px; flex-wrap: wrap; }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.buttons .el-button + .el-button { margin-left: 0; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.error { color: var(--el-color-danger); font-size: 13px; }
.preview { min-height: 200px; }
.preview canvas { width: 100%; max-width: 540px; height: auto; display: block; border-radius: 8px; box-shadow: 0 2px 12px rgb(0 0 0 / 0.1); }
.save-img { width: 100%; height: auto; display: block; }
</style>
