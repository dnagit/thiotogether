<script setup lang="ts">
/**
 * Reveal page. Reward data only exists in the payload once the game is REVEALED —
 * before that the server withholds it, so there is nothing here to leak early.
 *
 * Tiles flip individually or all at once; the summary table is always available for
 * anyone who would rather read than click.
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';

interface Tile {
  boardNumber: number;
  frontImage: string | null;
  status: string;
  reservedBy: string | null;
  reward: { label: string; imageUrl: string | null } | null;
}
interface Board {
  name: string;
  slug: string;
  description: string | null;
  status: string;
  tileCount: number;
  themeColor: string | null;
  revealedAt: string | null;
  commitmentHash: string | null;
  tiles: Tile[];
}

const route = useRoute();
const slug = String(route.params.slug);

const board = ref<Board | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const opened = ref<Set<number>>(new Set());
const view = ref<'board' | 'table'>('board');
const search = ref('');

const themeColor = computed(() => board.value?.themeColor ?? 'var(--color-primary)');

/** Same square layout as the play board, so revealing does not reshape the grid. */
const columns = computed(() => Math.max(1, Math.ceil(Math.sqrt(board.value?.tiles.length ?? 1))));
const revealed = computed(() => board.value?.status === 'REVEALED');
const allOpen = computed(
  () => !!board.value && opened.value.size >= board.value.tiles.length,
);

const tableRows = computed(() => {
  const rows = board.value?.tiles ?? [];
  const q = search.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (t) =>
      String(t.boardNumber).includes(q) ||
      (t.reservedBy ?? '').toLowerCase().includes(q) ||
      (t.reward?.label ?? '').toLowerCase().includes(q),
  );
});

void get<Board>(`/games/${slug}`)
  .then((b) => {
    board.value = b;
    applySeo({ title: `ผลรางวัล — ${b.name}` });
  })
  .catch(() => (error.value = 'ไม่พบเกมนี้'))
  .finally(() => (loading.value = false));

function openTile(n: number): void {
  opened.value = new Set(opened.value).add(n);
}
function openAll(): void {
  opened.value = new Set((board.value?.tiles ?? []).map((t) => t.boardNumber));
}
function closeAll(): void {
  opened.value = new Set();
}
</script>

<template>
  <div class="container-site py-8 sm:py-12">
    <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse" role="status">กำลังโหลดผล…</div>

    <div v-else-if="error || !board" class="py-20 text-center">
      <div class="text-5xl mb-3" aria-hidden="true">🔍</div>
      <h1 class="text-xl font-bold mb-2">{{ error }}</h1>
      <RouterLink to="/games" class="text-blue-600 underline">ดูเกมทั้งหมด</RouterLink>
    </div>

    <template v-else>
      <header class="text-center mb-8">
        <RouterLink to="/games" class="text-sm text-gray-500 hover:underline">← เกมทั้งหมด</RouterLink>
        <h1 class="text-2xl sm:text-4xl font-extrabold mt-2">{{ board.name }}</h1>
        <p v-if="revealed" class="text-gray-600 mt-2">🎉 ประกาศผลรางวัลแล้ว</p>
      </header>

      <!-- Not revealed yet -->
      <div v-if="!revealed" class="max-w-lg mx-auto text-center card">
        <div class="text-5xl mb-3" aria-hidden="true">⏳</div>
        <h2 class="font-bold text-lg mb-1">ยังไม่ประกาศผล</h2>
        <p class="text-gray-600 mb-4">
          ผลรางวัลจะแสดงเมื่อป้ายถูกจองครบทุกใบและผู้จัดกิจกรรมกดเฉลย
        </p>
        <RouterLink :to="`/game/${board.slug}`" class="btn-primary inline-block" :style="{ background: themeColor }">
          กลับไปหน้าเกม
        </RouterLink>
      </div>

      <template v-else>
        <!-- Controls -->
        <div class="flex flex-wrap items-center justify-center gap-2 mb-6">
          <button type="button" class="btn-ghost" :class="{ active: view === 'board' }" @click="view = 'board'">
            มุมมองกระดาน
          </button>
          <button type="button" class="btn-ghost" :class="{ active: view === 'table' }" @click="view = 'table'">
            ตารางสรุปผล
          </button>
          <template v-if="view === 'board'">
            <button v-if="!allOpen" type="button" class="btn-primary" :style="{ background: themeColor }" @click="openAll">
              เปิดทั้งหมด
            </button>
            <button v-else type="button" class="btn-ghost" @click="closeAll">ปิดทั้งหมด</button>
          </template>
        </div>

        <!-- Board -->
        <section v-if="view === 'board'" aria-label="ผลรางวัลรายป้าย" class="board-scroll">
          <ul class="board" role="list" :style="{ '--cols': columns }">
            <li v-for="tile in board.tiles" :key="tile.boardNumber">
              <button
                type="button"
                class="flip"
                :class="{ open: opened.has(tile.boardNumber) }"
                :aria-expanded="opened.has(tile.boardNumber)"
                :aria-label="opened.has(tile.boardNumber)
                  ? `ป้าย ${tile.boardNumber} จองโดย ${tile.reservedBy ?? 'ไม่มีผู้จอง'} ได้รับ ${tile.reward?.label ?? '-'}`
                  : `ป้ายหมายเลข ${tile.boardNumber} กดเพื่อเปิดดูรางวัล`"
                @click="openTile(tile.boardNumber)"
              >
                <span class="flip-inner">
                  <span class="face front" :style="{ '--accent': themeColor }">
                    <img v-if="tile.frontImage" :src="tile.frontImage" alt="" loading="lazy" class="face-img" />
                    <span class="num" :class="{ 'on-image': tile.frontImage }">{{ tile.boardNumber }}</span>
                  </span>
                  <span class="face back">
                    <img v-if="tile.reward?.imageUrl" :src="tile.reward.imageUrl" alt="" loading="lazy" class="face-img" />
                    <span class="back-content">
                      <span class="back-no">#{{ tile.boardNumber }}</span>
                      <!-- Labelled so the two lines cannot be mistaken for each other:
                           the name is who booked the tile, the line under it is the prize. -->
                      <span class="back-row">
                        <span class="back-key">จองโดย</span>
                        <span class="back-by">{{ tile.reservedBy ?? '—' }}</span>
                      </span>
                      <span class="back-row">
                        <span class="back-key">ได้รับ</span>
                        <span class="back-reward">{{ tile.reward?.label ?? '—' }}</span>
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            </li>
          </ul>
          <p class="text-center text-sm text-gray-500 mt-4">
            เปิดแล้ว {{ opened.size }} จาก {{ board.tiles.length }} ป้าย
          </p>
        </section>

        <!-- Table -->
        <section v-else aria-label="ตารางสรุปผล">
          <div class="mb-3 flex justify-center">
            <label for="result-search" class="sr-only">ค้นหาผล</label>
            <input
              id="result-search"
              v-model="search"
              type="search"
              placeholder="ค้นหาเลขป้าย ชื่อ หรือรางวัล…"
              class="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2"
              :style="{ '--tw-ring-color': themeColor }"
            />
          </div>
          <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-4 py-3 text-left font-semibold w-20">ป้าย</th>
                  <th scope="col" class="px-4 py-3 text-left font-semibold">จองโดย</th>
                  <th scope="col" class="px-4 py-3 text-left font-semibold">ได้รับ</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in tableRows" :key="t.boardNumber" class="border-t border-gray-100">
                  <td class="px-4 py-3 font-bold">#{{ t.boardNumber }}</td>
                  <td class="px-4 py-3">{{ t.reservedBy ?? '—' }}</td>
                  <td class="px-4 py-3">{{ t.reward?.label ?? '—' }}</td>
                </tr>
                <tr v-if="tableRows.length === 0">
                  <td colspan="3" class="px-4 py-10 text-center text-gray-400">ไม่พบผลที่ตรงกับคำค้น</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Audit footer -->
        <p v-if="board.commitmentHash" class="text-center text-xs text-gray-400 mt-8 break-all">
          ค่าตรวจสอบการสุ่ม (commitment): <span class="font-mono">{{ board.commitmentHash }}</span>
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-6 shadow-sm; }
.btn-primary { @apply text-white font-semibold px-5 py-2.5 rounded-lg transition; }
.btn-primary:hover { opacity: 0.9; }
.btn-ghost { @apply border border-gray-300 font-medium px-5 py-2.5 rounded-lg transition hover:bg-gray-50; }
.btn-ghost.active { @apply bg-gray-900 text-white border-gray-900; }

.board-scroll { overflow-x: auto; padding-bottom: 4px; }

.board {
  display: grid;
  /* Mirrors the play board's square grid; reveal tiles are taller (3:4) so they
     carry the winner's name and prize text. */
  grid-template-columns: repeat(var(--cols), minmax(72px, 140px));
  justify-content: center;
  gap: 12px;
}
@media (min-width: 640px) {
  .board { grid-template-columns: repeat(var(--cols), minmax(88px, 168px)); }
}

/* Square, matching the play board's tiles. */
.flip { width: 100%; aspect-ratio: 1; perspective: 900px; }
.flip:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 3px; border-radius: 14px; }

.flip-inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  /* Transform-only animation: composited, so a 100-tile board stays smooth. */
  transition: transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.flip.open .flip-inner { transform: rotateY(180deg); }

.face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  overflow: hidden;
  backface-visibility: hidden;
  border: 2px solid #e5e7eb;
}
.front { background: color-mix(in srgb, var(--accent) 14%, white); border-color: color-mix(in srgb, var(--accent) 35%, white); }
.back { transform: rotateY(180deg); background: white; }

.face-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
/* Top-right, matching the play board so the front face looks the same in both places. */
.num {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 1;
  font-size: 1.15rem;
  line-height: 1;
  font-weight: 800;
  color: #374151;
}
/* Same reasoning as the play board: cover art is arbitrary, so give the digits
   their own contrasting chip rather than hoping they land on a readable area. */
.num.on-image {
  color: #fff;
  min-width: 1.7em;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgb(17 24 39 / 68%);
  text-shadow: 0 1px 2px rgb(0 0 0 / 55%);
  text-align: center;
}

.back-content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  text-align: center;
  background: rgb(255 255 255 / 90%);
  border-radius: 10px;
  width: 100%;
  /* A square face is shorter than the old 3:4 one, so keep the block inside the
     tile and let the two text lines clamp rather than spill over the edge. */
  max-height: 100%;
  overflow: hidden;
}
.back-no { font-size: 10px; font-weight: 700; color: #6b7280; line-height: 1.2; }
.back-row { display: block; min-height: 0; }
.back-key {
  display: block;
  font-size: 9px;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: #9ca3af;
  text-transform: uppercase;
}

/* Clamp instead of truncating with an ellipsis mid-word: Thai has no word spaces,
   so a character-level cut reads as a typo. Whole lines drop cleanly. */
.back-by,
.back-reward {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.25;
  word-break: break-word;
}
.back-by { -webkit-line-clamp: 2; font-weight: 600; color: #111827; }
.back-reward { -webkit-line-clamp: 3; font-weight: 700; color: #047857; }

@media (prefers-reduced-motion: reduce) {
  .flip-inner { transition: none; }
}
</style>
