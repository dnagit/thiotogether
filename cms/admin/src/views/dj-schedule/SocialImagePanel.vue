<script setup lang="ts">
/**
 * The social-post image: the uploaded template, with the day's DJs' pictures either side of
 * the artist and "DATE : 25.09.26  TIME : 18:00–20:00 น." across the band near the bottom —
 * drawn in a <canvas> and saved as a PNG to post.
 *
 * The time is the day's first DJ's start to its last DJ's end, in Bangkok time, over the slots
 * that start that day. Each DJ appears once, in the order they go on air.
 *
 * Positions are shares of the template's size, measured off the 1080 × 1440 poster, so a
 * template made from the same design at any size lines up.
 *
 * Pictures come through the API (`/dj-schedule/assets/…`) rather than from their own URLs: a
 * canvas that draws a cross-origin picture without CORS headers refuses to be saved, and in
 * production the uploads are served by nginx without them.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useIsMobile } from '@/composables/useIsMobile';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse, type DjScheduleSettings } from '@cms/shared';

interface Slot {
  id: number;
  djId: number;
  startsAt: string;
  endsAt: string;
  dj: { id: number; name: string; image: string | null };
}

// ── Layout, as shares of the template's width (W) and height (H) ──
/**
 * Where the DJs' pictures go: beside the artist, each under the line of text printed on its
 * side of the template — "THI-O'S SONGS" on the left sits lower than "UNBOUND" on the right,
 * so the left picture does too.
 */
const ZONES = {
  left: { x: 0.05, y: 0.565, w: 0.22 },
  right: { x: 0.73, y: 0.525, w: 0.22 },
};
/**
 * With an odd number of DJs the right side takes the extra one, and starts higher — just under
 * "UNBOUND" — to make room for it. With an even number the sides hold the same, and the right
 * starts lower (`ZONES.right.y`) so the two answer each other across the artist.
 */
const RIGHT_Y_WHEN_FULLER = 0.49;
/** Both sides may run down to here, just above the date band. */
const ZONE_BOTTOM = 0.765;
/** The largest a picture gets — what a single DJ on a side is drawn at. */
const MAX_PICTURE = 0.18;
/** The space between two pictures on the same side. */
const PICTURE_GAP = 0.015;
/*
 * A loose, hand-placed look rather than a straight column: the n-th picture on a side is
 * nudged across (a share of the room the side has spare), turned a few degrees and drawn a
 * touch smaller or larger. Fixed values, not random, so the same day always comes out the
 * same; the right side takes them mirrored, so the two sides still answer each other.
 */
/**
 * Hand-placed spots for a given number of DJs, in on-air order, read left to right across the
 * poster: each picture's centre (shares of W and H), its size (a share of H) and its turn.
 * A count with no entry here falls back to the grid above.
 */
const PLACEMENTS: Record<number, { cx: number; cy: number; size: number; turn: number }[]> = {
  // Two outer pictures under "THI-O'S SONGS" and "UNBOUND"; two smaller inner ones low
  // either side of the artist, just above the band.
  4: [
    { cx: 0.14, cy: 0.605, size: 0.15, turn: -7 },
    { cx: 0.34, cy: 0.68, size: 0.12, turn: 5 },
    { cx: 0.665, cy: 0.685, size: 0.12, turn: -5 },
    { cx: 0.85, cy: 0.58, size: 0.15, turn: 7 },
  ],
};
const SCATTER = [
  { dx: -0.55, turn: -7, scale: 1 },
  { dx: 0.6, turn: 6, scale: 0.9 },
  { dx: -0.2, turn: -3, scale: 0.95 },
  { dx: 0.45, turn: 8, scale: 0.88 },
  { dx: -0.5, turn: -5, scale: 0.93 },
];
/** The DATE/TIME line: its centre, its type size and how wide it may run. */
const TEXT = { y: 0.855, size: 0.05, maxWidth: 0.92 };
const FONT_FAMILY = 'Mitr';
/** The glow round the DATE/TIME letters. */
const GLOW = 'rgba(230, 20, 50, 0.8)';

// ── Bangkok time ──
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const bkk = (d: Date) => new Date(d.getTime() + BKK_OFFSET_MS);
const bkkTodayKey = () => {
  const w = bkk(new Date());
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
};
const hhmm = (d: Date) => {
  const w = bkk(d);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
};

const settings = ref<DjScheduleSettings | null>(null);
const template = ref<string | null>(null);
const savingTemplate = ref(false);
const day = ref(bkkTodayKey());
/** Phones get their own date picker rather than Element's, which is built for a mouse. */
const isMobile = useIsMobile();
const slots = ref<Slot[]>([]);
const rendering = ref(false);
const error = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);

/** "25.09.26" — the chosen day, as on the poster. */
const dateText = computed(() => {
  const [y, m, d] = day.value.split('-');
  return `${d}.${m}.${y.slice(2)}`;
});

/** First start to last end of the DJs going on that day, or null when there are none. */
const timeText = computed(() => {
  if (!slots.value.length) return null;
  const start = Math.min(...slots.value.map((s) => new Date(s.startsAt).getTime()));
  const end = Math.max(...slots.value.map((s) => new Date(s.endsAt).getTime()));
  return `${hhmm(new Date(start))}-${hhmm(new Date(end))} น.`;
});

/** Each DJ once, in on-air order, and only those with a picture. */
const djs = computed(() => {
  const seen = new Set<number>();
  const out: Slot['dj'][] = [];
  for (const s of slots.value) {
    if (seen.has(s.dj.id) || !s.dj.image) continue;
    seen.add(s.dj.id);
    out.push(s.dj);
  }
  return out;
});

// ── Loading ──

async function loadSettings(): Promise<void> {
  const { data } = await http.get<ApiResponse<DjScheduleSettings>>('/dj-schedule/settings');
  settings.value = data.data;
  template.value = data.data.socialTemplate;
}

/** The slots that start on the chosen Bangkok day. */
async function loadSlots(): Promise<void> {
  const [y, m, d] = day.value.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, d) - BKK_OFFSET_MS);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const { data } = await http.get<ApiResponse<Slot[]>>('/dj-schedule/slots', {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  slots.value = data.data.filter((s) => {
    const t = new Date(s.startsAt).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
}

/**
 * Mitr bold, from Google Fonts' files, loaded once and awaited before any text is drawn.
 * Added through FontFace rather than a stylesheet so the load can be waited on for sure —
 * Safari would otherwise draw (and measure) the line before the font had arrived.
 */
const MITR_700 = [
  // Thai
  {
    url: 'https://fonts.gstatic.com/s/mitr/v13/pxiEypw5ucZF8YcdJIPecnFHGPezSQ.woff2',
    range: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC',
  },
  // Latin
  {
    url: 'https://fonts.gstatic.com/s/mitr/v13/pxiEypw5ucZF8YcdJJfecnFHGPc.woff2',
    range: 'U+0000-00FF, U+2000-206F',
  },
];
let fontReady: Promise<void> | null = null;
function loadFont(): Promise<void> {
  if (!fontReady) {
    fontReady = Promise.all(
      MITR_700.map(async ({ url, range }) => {
        const face = new FontFace(FONT_FAMILY, `url(${url}) format('woff2')`, {
          weight: '700',
          unicodeRange: range,
        });
        document.fonts.add(await face.load());
      }),
    )
      .then(() => undefined)
      // Offline or blocked: draw in the fallback face rather than not at all.
      .catch(() => undefined);
  }
  return fontReady;
}

/** A picture through the API, as something a canvas may draw and still save. */
const objectUrls: string[] = [];
async function loadImage(path: string): Promise<HTMLImageElement> {
  // A fresh query each time, so a picture swapped since the last draw is never served stale.
  const { data } = await http.get<Blob>(path, { responseType: 'blob', params: { t: Date.now() } });
  const url = URL.createObjectURL(data);
  objectUrls.push(url);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
onBeforeUnmount(() => objectUrls.forEach((u) => URL.revokeObjectURL(u)));

// ── Drawing ──

/**
 * The columns × rows for `n` pictures in a `w` × `h` box that make each cell's shorter side —
 * and so each picture, near enough square — as large as it can be.
 */
function bestGrid(
  n: number,
  w: number,
  h: number,
  gap: number,
): { cols: number; rows: number; size: number } {
  let best = { cols: 1, rows: n, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.min((w - (cols - 1) * gap) / cols, (h - (rows - 1) * gap) / rows);
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
}

/**
 * Draw `img` as large as fits in the box, centred both ways — so a wide picture and a tall one
 * sit with the same space round them — turned `turn` degrees about its centre.
 */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: { x: number; y: number; w: number; h: number },
  turn = 0,
): void {
  const scale = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate((turn * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Counts renders, so one overtaken by a newer (another day picked meanwhile) draws nothing. */
let renderId = 0;

async function render(): Promise<void> {
  error.value = '';
  ready.value = false;
  pngBlob = null;
  const el = canvas.value;
  if (!el || !template.value) return;
  const id = ++renderId;
  rendering.value = true;
  try {
    const [bg, pictures] = await Promise.all([
      loadImage('/dj-schedule/assets/template'),
      Promise.all(djs.value.map((dj) => loadImage(`/dj-schedule/assets/dj/${dj.id}`))),
      loadFont(),
    ]);
    if (id !== renderId) return;
    const W = bg.naturalWidth;
    const H = bg.naturalHeight;
    el.width = W;
    el.height = H;
    const ctx = el.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    const placed = PLACEMENTS[pictures.length];
    if (placed) {
      pictures.forEach((img, i) => {
        const p = placed[i];
        const size = p.size * H;
        drawContain(
          ctx,
          img,
          { x: p.cx * W - size / 2, y: p.cy * H - size / 2, w: size, h: size },
          p.turn,
        );
      });
    }

    // Otherwise DJs alternate right, left, right…. Each side lays its own out in the grid that gives its
    // pictures the most room between its line of text and the date band; then both sides draw
    // at the smaller of the two sizes, so the pictures match across the artist, with a gap
    // between each. However many there are, they shrink to fit and never reach the text.
    const sides: Record<'left' | 'right', HTMLImageElement[]> = { left: [], right: [] };
    // Alternate, starting on the right: an odd count leaves the right side one ahead.
    if (!placed) pictures.forEach((img, i) => sides[i % 2 === 0 ? 'right' : 'left'].push(img));
    const rightFuller = sides.right.length > sides.left.length;
    const gap = PICTURE_GAP * H;
    const layouts = (['left', 'right'] as const)
      .filter((side) => sides[side].length)
      .map((side) => {
        const z =
          side === 'right' && rightFuller
            ? { ...ZONES.right, y: RIGHT_Y_WHEN_FULLER }
            : ZONES[side];
        const box = { x: z.x * W, y: z.y * H, w: z.w * W, h: (ZONE_BOTTOM - z.y) * H };
        return { side, list: sides[side], box, ...bestGrid(sides[side].length, box.w, box.h, gap) };
      });
    const cell = Math.min(MAX_PICTURE * H, ...layouts.map((l) => l.size));
    for (const { side, list, box, cols } of layouts) {
      const mirror = side === 'right' ? -1 : 1;
      // Rows start under the side's line of text; a short last row is centred.
      list.forEach((img, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, list.length - row * cols);
        const col = i % cols;
        const rowW = inRow * cell + (inRow - 1) * gap;
        const spare = Math.max(0, (box.w - rowW) / 2);
        const look = SCATTER[i % SCATTER.length];
        const size = cell * look.scale;
        const x =
          box.x +
          (box.w - rowW) / 2 +
          col * (cell + gap) +
          (cell - size) / 2 +
          mirror * look.dx * spare;
        const y = box.y + row * (cell + gap) + (cell - size) / 2;
        drawContain(ctx, img, { x, y, w: size, h: size }, mirror * look.turn);
      });
    }

    // DATE/TIME, Mitr bold, white, shrunk if it would run past the band.
    if (timeText.value) {
      const text = `DATE : ${dateText.value}  TIME : ${timeText.value}`;
      let size = TEXT.size * W;
      ctx.font = `700 ${size}px "${FONT_FAMILY}", sans-serif`;
      const maxWidth = TEXT.maxWidth * W;
      const measured = ctx.measureText(text).width;
      if (measured > maxWidth) {
        size *= maxWidth / measured;
        ctx.font = `700 ${size}px "${FONT_FAMILY}", sans-serif`;
      }
      ctx.fillStyle = '#fff';
      // Placed by hand from the measured letters rather than by textAlign/textBaseline
      // 'center'/'middle', which Safari works out differently from Chrome: centred across on
      // their width, and down on the ink itself (cap tops to the lowest descender), so the line
      // sits in the band the same on an iPad as on a desktop.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const m = ctx.measureText(text);
      const width = Math.min(m.width, maxWidth);
      const ascent = m.actualBoundingBoxAscent || size * 0.72;
      const descent = m.actualBoundingBoxDescent || 0;
      const x = (W - width) / 2;
      const y = TEXT.y * H + (ascent - descent) / 2;
      // A red neon glow round the white letters, as on the poster: a wide soft pass, a tight
      // bright one, then the letters again on top without any, so they stay crisp. The width
      // cap makes sure the line never runs off the picture, whatever the browser measured.
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = size * 0.35;
      ctx.fillText(text, x, y, maxWidth);
      ctx.shadowBlur = size * 0.12;
      ctx.fillText(text, x, y, maxWidth);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillText(text, x, y, maxWidth);
    }
    // Made now, not on the button: iOS only opens the share sheet straight from a tap, and
    // waiting on toBlob there would lose it.
    pngBlob = await new Promise<Blob | null>((r) => el.toBlob(r, 'image/png'));
    if (id !== renderId) return;
    ready.value = true;
  } catch {
    if (id === renderId) error.value = 'วาดรูปไม่สำเร็จ — ตรวจว่ารูปแม่แบบและรูป DJ ยังเปิดได้';
  } finally {
    if (id === renderId) rendering.value = false;
  }
}

async function refresh(): Promise<void> {
  await loadSlots();
  await render();
}

async function saveTemplate(): Promise<void> {
  if (!settings.value) return;
  savingTemplate.value = true;
  try {
    const { data } = await http.put<ApiResponse<DjScheduleSettings>>('/dj-schedule/settings', {
      socialTemplate: template.value || null,
    });
    settings.value = data.data;
    ElMessage.success('บันทึกรูปแม่แบบแล้ว');
    await render();
  } finally {
    savingTemplate.value = false;
  }
}

/** The finished picture as a PNG, ready to save. */
let pngBlob: Blob | null = null;
/** Phones and tablets: a touch screen, where a download lands in Files rather than Photos. */
const isTouch = window.matchMedia('(pointer: coarse)').matches;

/**
 * On a phone or tablet, the picture shown full-size in a dialog: pressing and holding it gives
 * "Save to Photos" (iOS) or "Download image" (Android, which lands in the gallery) — the one way
 * that works in every mobile browser, in-app ones (LINE, Facebook) included. A share button
 * sits beside it for browsers that can share files.
 */
const saveOpen = ref(false);
const saveSrc = ref('');
const canShareFiles =
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] });

async function sharePicture(): Promise<void> {
  if (!pngBlob) return;
  const file = new File([pngBlob], `dj-schedule-${day.value}.png`, { type: 'image/png' });
  try {
    await navigator.share({ files: [file] });
  } catch {
    // Closed without choosing anything, or sharing refused: the hold-to-save still works.
  }
}

/** Save the picture: the hold-to-save dialog on a touch screen, a PNG download elsewhere. */
function download(): void {
  if (!pngBlob) return;
  const name = `dj-schedule-${day.value}.png`;
  if (isTouch && canvas.value) {
    // A data URL, not a blob one: iOS offers "Save to Photos" on it reliably.
    saveSrc.value = canvas.value.toDataURL('image/png');
    saveOpen.value = true;
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pngBlob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// A phone's date field can be cleared; wait for a date rather than fetching nothing.
watch(day, (value) => {
  if (value) void refresh();
});
onMounted(async () => {
  await loadSettings();
  await refresh();
});

const templateChanged = computed(
  () => (template.value || null) !== (settings.value?.socialTemplate ?? null),
);

// ── Caption ──────────────────────────────────────────────────
/*
 * The text to post with the picture: an editable template, filled from the same day's
 * line-up. Placeholders in `{braces}`; anything else is copied as written.
 */

const DEFAULT_CAPTION = `🎧 **THIOTOGEHTER ON AIR : DJ DROP THE BEAT!** 🎧

พรุ่งนี้พบกับ **DJ บ้าน THIOTOGEHTER** 💜

{lineup}

🎧 มาสตรีมไปด้วยกันนะคะ
⏰ เวลา **{start} - {end} น.**
🔗 http://share.stationhead.com/e8vlse6fajyx

อย่าลืมเช็กการเชื่อมต่อ **Spotify Premium หรือ Apple Music** กันด้วยนะคะ ❤️🫶🏻

#StreamForNexT1DE #ThioTogether
#THIO #THIOTHAMM #ไทโอ #NexT1DE_THIO`;
const DEFAULT_LINE = '{clock} {start} - {end} น. : DJ {name}';

const PLACEHOLDERS = [
  { key: '{lineup}', what: 'คิว DJ ทั้งวัน บรรทัดละคน (ตามรูปแบบบรรทัดด้านล่าง)' },
  { key: '{start}', what: 'เวลาเริ่มของคิวแรก เช่น 09.00' },
  { key: '{end}', what: 'เวลาจบของคิวสุดท้าย เช่น 24.00' },
  { key: '{date}', what: 'วันที่ เช่น 25.09.26' },
  { key: '{dateLong}', what: 'วันที่เต็ม เช่น วันพฤหัสบดีที่ 25 กันยายน 2569' },
];
const LINE_PLACEHOLDERS = '{clock} นาฬิกาตามชั่วโมง · {start} · {end} · {name} ชื่อ DJ';

const captionTemplate = ref(DEFAULT_CAPTION);
const lineTemplate = ref(DEFAULT_LINE);
const savingCaption = ref(false);
const copied = ref(false);

watch(settings, (st) => {
  if (!st) return;
  captionTemplate.value = st.socialCaption ?? DEFAULT_CAPTION;
  lineTemplate.value = st.socialCaptionLine ?? DEFAULT_LINE;
});

const CLOCKS = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
const HALF_CLOCKS = ['🕧', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦'];

/** "09.00", Bangkok time. An end on the stroke of midnight reads "24.00", as posters do. */
function dotTime(d: Date, isEnd = false): string {
  const w = bkk(d);
  const h = w.getUTCHours();
  const m = w.getUTCMinutes();
  if (isEnd && h === 0 && m === 0) return '24.00';
  return `${pad(h)}.${pad(m)}`;
}
/** The clock face for a start time: the hour, or the half past it. */
function clockFor(d: Date): string {
  const w = bkk(d);
  const h = w.getUTCHours() % 12;
  return w.getUTCMinutes() >= 30 ? HALF_CLOCKS[h] : CLOCKS[h];
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? vars[key] : all));
}

const caption = computed(() => {
  const sorted = [...slots.value].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const lineup = sorted
    .map((s) =>
      fill(lineTemplate.value, {
        clock: clockFor(new Date(s.startsAt)),
        start: dotTime(new Date(s.startsAt)),
        end: dotTime(new Date(s.endsAt), true),
        name: s.dj.name,
      }),
    )
    .join('\n');
  const first = sorted[0];
  const last = sorted.reduce<Slot | undefined>(
    (acc, s) => (!acc || new Date(s.endsAt) > new Date(acc.endsAt) ? s : acc),
    undefined,
  );
  const [y, m, d] = day.value.split('-').map(Number);
  return fill(captionTemplate.value, {
    lineup: lineup || '(ยังไม่มีคิว DJ ในวันนี้)',
    start: first ? dotTime(new Date(first.startsAt)) : '-',
    end: last ? dotTime(new Date(last.endsAt), true) : '-',
    date: dateText.value,
    dateLong: new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  });
});

const captionChanged = computed(
  () =>
    captionTemplate.value !== (settings.value?.socialCaption ?? DEFAULT_CAPTION) ||
    lineTemplate.value !== (settings.value?.socialCaptionLine ?? DEFAULT_LINE),
);

async function saveCaption(): Promise<void> {
  savingCaption.value = true;
  try {
    const { data } = await http.put<ApiResponse<DjScheduleSettings>>('/dj-schedule/settings', {
      socialCaption: captionTemplate.value,
      socialCaptionLine: lineTemplate.value,
    });
    settings.value = data.data;
    ElMessage.success('บันทึกข้อความแม่แบบแล้ว');
  } finally {
    savingCaption.value = false;
  }
}

function resetCaption(): void {
  captionTemplate.value = DEFAULT_CAPTION;
  lineTemplate.value = DEFAULT_LINE;
}

async function copyCaption(): Promise<void> {
  try {
    await navigator.clipboard.writeText(caption.value);
  } catch {
    // No clipboard API (plain http, older browsers): the textarea-and-execCommand way.
    const ta = document.createElement('textarea');
    ta.value = caption.value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  copied.value = true;
  ElMessage.success('คัดลอกข้อความแล้ว');
  setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="social">
    <ElForm label-position="top" class="controls">
      <ElFormItem label="รูปแม่แบบ (โปสเตอร์ที่ยังไม่มีวันเวลาและรูป DJ)">
        <MediaPicker v-model="template" />
      </ElFormItem>
      <ElButton
        v-if="templateChanged"
        v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
        type="primary"
        :loading="savingTemplate"
        @click="saveTemplate"
      >
        บันทึกรูปแม่แบบ
      </ElButton>
      <p class="hint">
        แนะนำขนาดเดียวกับโปสเตอร์ (เช่น 1080×1440) · มีแถบด้านล่างสำหรับ DATE / TIME ·
        เว้นที่ซ้ายขวาข้างศิลปินไว้ให้รูป DJ
      </p>

      <ElFormItem label="วันที่" class="mt">
        <input v-if="isMobile" v-model="day" type="date" class="native-date" required />
        <ElDatePicker
          v-else
          v-model="day"
          type="date"
          value-format="YYYY-MM-DD"
          format="DD/MM/YYYY"
          :clearable="false"
        />
      </ElFormItem>

      <div class="summary">
        <template v-if="timeText">
          <div><b>DATE :</b> {{ dateText }} <b>TIME :</b> {{ timeText }}</div>
          <div class="text-muted">
            DJ:
            {{
              slots
                .map((s) => s.dj.name)
                .filter((n, i, a) => a.indexOf(n) === i)
                .join(', ')
            }}
            <span v-if="djs.length < new Set(slots.map((s) => s.dj.id)).size">
              (บางคนไม่มีรูป จึงไม่ได้ใส่ในภาพ)
            </span>
          </div>
        </template>
        <div v-else class="text-muted">วันนี้ไม่มี DJ — จะไม่มีบรรทัด DATE / TIME</div>
      </div>

      <ElButton
        type="success"
        :disabled="!ready || rendering"
        :loading="rendering"
        class="mt"
        @click="download"
      >
        {{ isTouch ? 'บันทึกรูปลงคลังภาพ' : 'ดาวน์โหลด PNG' }}
      </ElButton>
      <ElDialog
        v-model="saveOpen"
        title="บันทึกรูปลงคลังภาพ"
        width="92%"
        append-to-body
        @closed="saveSrc = ''"
      >
        <p class="save-help">
          <b>กดค้างที่รูป</b> แล้วเลือก “บันทึกไปยังรูปภาพ” (Save to Photos)<br />
          Android: กดค้าง แล้วเลือก “ดาวน์โหลดรูปภาพ”
        </p>
        <img :src="saveSrc" alt="รูปโพสต์ DJ" class="save-img" />
        <ElButton v-if="canShareFiles" type="primary" class="mt share-btn" @click="sharePicture">
          แชร์ / บันทึกรูป
        </ElButton>
      </ElDialog>
      <p v-if="error" class="error">{{ error }}</p>
    </ElForm>

    <div class="preview">
      <p v-if="!template" class="text-muted">อัปโหลดรูปแม่แบบก่อน เพื่อดูตัวอย่าง</p>
      <canvas v-show="template" ref="canvas" class="canvas" />
    </div>
  </div>

  <ElDivider />

  <div class="caption">
    <div class="caption-edit">
      <h3 class="caption-title">ข้อความแม่แบบ</h3>
      <ElInput v-model="captionTemplate" type="textarea" :autosize="{ minRows: 12, maxRows: 24 }" />
      <ElFormItem label="รูปแบบแต่ละบรรทัดของ {lineup}" class="mt">
        <ElInput v-model="lineTemplate" />
      </ElFormItem>
      <p class="hint">บรรทัด: {{ LINE_PLACEHOLDERS }}</p>
      <ul class="placeholders">
        <li v-for="p in PLACEHOLDERS" :key="p.key">
          <code>{{ p.key }}</code> {{ p.what }}
        </li>
      </ul>
      <div class="caption-actions">
        <ElButton
          v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
          type="primary"
          :disabled="!captionChanged"
          :loading="savingCaption"
          @click="saveCaption"
        >
          บันทึกข้อความแม่แบบ
        </ElButton>
        <ElButton v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE" text @click="resetCaption">
          คืนค่าเริ่มต้น
        </ElButton>
      </div>
    </div>

    <div class="caption-result">
      <h3 class="caption-title">ข้อความของวันที่ {{ dateText }} (พร้อมคัดลอก)</h3>
      <ElInput
        :model-value="caption"
        type="textarea"
        readonly
        :autosize="{ minRows: 12, maxRows: 30 }"
        class="result"
      />
      <ElButton type="success" class="mt" @click="copyCaption">
        {{ copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อความ' }}
      </ElButton>
    </div>
  </div>
</template>

<style scoped>
.caption {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}
@media (max-width: 900px) {
  .caption {
    grid-template-columns: 1fr;
  }
}
.caption-title {
  margin: 0 0 8px;
  font-size: 15px;
}
.placeholders {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
}
.placeholders code {
  color: var(--el-color-primary);
}
.caption-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
.result :deep(textarea) {
  background: var(--el-fill-color-lighter);
}
.social {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 24px;
  align-items: start;
}
@media (max-width: 900px) {
  .social {
    grid-template-columns: 1fr;
  }
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.mt {
  margin-top: 16px;
}
.native-date {
  width: 100%;
  box-sizing: border-box;
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 16px;
}
.summary {
  font-size: 13px;
  line-height: 1.7;
}
.error {
  color: var(--el-color-danger);
  font-size: 13px;
}
.save-help {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
}
.save-img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  /* Let iOS show its own press-and-hold menu with "Save to Photos". */
  -webkit-touch-callout: default;
  user-select: auto;
}
.share-btn {
  width: 100%;
}
.preview {
  display: flex;
  justify-content: center;
}
.canvas {
  display: block;
  width: 100%;
  max-width: 540px;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}
</style>
