<script setup lang="ts">
/**
 * Board game play screen.
 *
 * Flow: enter account name → server reports the token balance for this game's
 * projects → pick a free tile → confirm → server reserves it and spends a token in
 * one transaction.
 *
 * Two rules shape the interaction:
 *  - A reserved tile must never open the confirm dialog. On desktop hovering shows
 *    who has it; on touch, where hover does not exist, tapping shows the same
 *    information instead of trying to book it.
 *  - Every reservation carries a fresh idempotency key, so a double tap or a retry
 *    after a dropped connection returns the original booking rather than taking a
 *    second tile.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import AppModal from '@/components/AppModal.vue';

interface Tile {
  boardNumber: number;
  frontImage: string | null;
  status: 'AVAILABLE' | 'RESERVED' | 'REVEALED';
  reservedBy: string | null;
  reward: { label: string; imageUrl: string | null } | null;
}
interface Board {
  name: string;
  slug: string;
  description: string | null;
  coverImage: string | null;
  status: string;
  tileCount: number;
  tileFrontImage: string | null;
  tokensPerTile: number;
  themeColor: string | null;
  maxTilesPerAccount: number | null;
  showReserverNames: boolean;
  reservedCount: number;
  projects: Array<{ id: number; name: string; slug: string }>;
  tiles: Tile[];
}
interface AccountState {
  found: boolean;
  displayName?: string;
  tokens: number;
  reservedByMe: number[];
  maxTilesPerAccount: number | null;
}

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug);

const board = ref<Board | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const accountName = ref('');
const account = ref<AccountState | null>(null);
const checking = ref(false);
const accountError = ref<string | null>(null);

const selected = ref<Tile | null>(null);
const confirmOpen = ref(false);
const submitting = ref(false);
const actionError = ref<string | null>(null);
const successMessage = ref<string | null>(null);

/** Tile whose overlay is pinned open by a tap (touch has no hover). */
const peeked = ref<number | null>(null);

/**
 * Square board: 4 tiles → 2×2, 16 → 4×4, 36 → 6×6.
 *
 * `ceil` keeps counts that are not perfect squares sensible too — 12 tiles become
 * 4 columns (4×3) rather than a ragged row. Tracks are min/max bounded in CSS so a
 * 2×2 board does not blow up to giant tiles on a desktop, and a large board scrolls
 * sideways instead of shrinking below a tappable size on a phone.
 */
/** Accent for every branded surface on this page; falls back to the site orange when the game sets none. */
const themeColor = computed(() => board.value?.themeColor ?? '#ea480c');

const columns = computed(() => Math.max(1, Math.ceil(Math.sqrt(board.value?.tiles.length ?? 1))));
const progress = computed(() =>
  board.value ? Math.round((board.value.reservedCount / board.value.tileCount) * 100) : 0,
);
const canPlay = computed(() => board.value?.status === 'OPEN');
const tilesAffordable = computed(() =>
  account.value && board.value ? Math.floor(account.value.tokens / board.value.tokensPerTile) : 0,
);
const myTileCount = computed(() => account.value?.reservedByMe.length ?? 0);
const atPersonalLimit = computed(() => {
  const max = board.value?.maxTilesPerAccount;
  return max !== null && max !== undefined && myTileCount.value >= max;
});

async function loadBoard(): Promise<void> {
  try {
    board.value = await get<Board>(`/games/${slug}`);
    applySeo({
      title: board.value.name,
      metaDescription: board.value.description ?? undefined,
      ogImage: board.value.coverImage ?? undefined,
    });
    if (board.value.status === 'REVEALED') {
      void router.replace({ name: 'game-results', params: { slug } });
    }
  } catch {
    loadError.value = 'ไม่พบเกมนี้ หรือเกมยังไม่เปิดให้เล่น';
  } finally {
    loading.value = false;
  }
}
void loadBoard();

// Keep the board fresh while the player is deciding, so tiles taken by others
// appear without a manual refresh. Paused while a dialog is open to avoid the
// board shifting under the player's finger.
const poll = window.setInterval(() => {
  if (!confirmOpen.value && !submitting.value && canPlay.value) void refreshBoard();
}, 12_000);
onBeforeUnmount(() => window.clearInterval(poll));

async function refreshBoard(): Promise<void> {
  try {
    const fresh = await get<Board>(`/games/${slug}`);
    board.value = fresh;
    if (fresh.status === 'REVEALED') {
      void router.replace({ name: 'game-results', params: { slug } });
    }
  } catch {
    // A failed background refresh is not worth interrupting play over.
  }
}

async function checkAccount(): Promise<void> {
  const name = accountName.value.trim();
  if (name.length < 2) {
    accountError.value = 'กรุณากรอกชื่อบัญชีอย่างน้อย 2 ตัวอักษร';
    return;
  }
  checking.value = true;
  accountError.value = null;
  try {
    const { data } = await api.post(`/public/games/${slug}/check-account`, { accountName: name });
    // An unknown name or a zero balance is a normal outcome, not an error — the
    // template gives each its own call to action.
    account.value = {
      ...data.data,
      tokens: data.data.tokens ?? 0,
      reservedByMe: data.data.reservedByMe ?? [],
    };
  } catch (err: any) {
    accountError.value =
      err?.response?.status === 429
        ? 'ตรวจสอบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
        : (err?.response?.data?.message ?? 'ตรวจสอบชื่อบัญชีไม่สำเร็จ');
  } finally {
    checking.value = false;
  }
}

function resetAccount(): void {
  account.value = null;
  accountName.value = '';
  successMessage.value = null;
  actionError.value = null;
}

/**
 * A reserved tile shows its overlay instead of opening the dialog — this is what
 * makes tapping safe on touch devices, where there is no hover to reveal it.
 */
function onTileActivate(tile: Tile): void {
  if (tile.status !== 'AVAILABLE') {
    peeked.value = peeked.value === tile.boardNumber ? null : tile.boardNumber;
    return;
  }
  if (!canPlay.value || !account.value?.found) return;
  if (tilesAffordable.value < 1 || atPersonalLimit.value) return;

  selected.value = tile;
  actionError.value = null;
  confirmOpen.value = true;
}

async function confirmReserve(): Promise<void> {
  if (!selected.value || submitting.value) return;
  submitting.value = true;
  actionError.value = null;

  // Fresh key per confirmed attempt: a retry of *this* attempt is idempotent,
  // while a deliberate second booking is a new request.
  const idempotencyKey =
    globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const { data } = await api.post(`/public/games/${slug}/reserve`, {
      accountName: accountName.value.trim(),
      boardNumber: selected.value.boardNumber,
      idempotencyKey,
    });
    confirmOpen.value = false;
    successMessage.value = data.message;
    await Promise.all([refreshBoard(), checkAccount()]);
  } catch (err: any) {
    const status = err?.response?.status;
    actionError.value =
      status === 429
        ? 'ส่งคำขอถี่เกินไป กรุณารอสักครู่'
        : (err?.response?.data?.message ?? 'จองป้ายไม่สำเร็จ กรุณาลองใหม่');
    // Someone else took it, or the game moved on — resync so the board tells the truth.
    if (status === 409) {
      await refreshBoard();
      confirmOpen.value = false;
    }
  } finally {
    submitting.value = false;
  }
}

function tileLabel(tile: Tile): string {
  if (tile.status === 'AVAILABLE') return `ป้ายหมายเลข ${tile.boardNumber} ยังว่าง เลือกเพื่อจอง`;
  const who = tile.reservedBy ? `จองแล้วโดย ${tile.reservedBy}` : 'มีผู้จองแล้ว';
  return `ป้ายหมายเลข ${tile.boardNumber} ${who}`;
}
function isMine(tile: Tile): boolean {
  return account.value?.reservedByMe.includes(tile.boardNumber) ?? false;
}
</script>

<template>
  <div class="font-sukhumvit container-site py-8 sm:py-12">
    <!-- Loading -->
    <div v-if="loading" class="py-24 text-center" role="status" aria-live="polite">
      <div class="animate-pulse text-gray-400">กำลังโหลดเกม…</div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError || !board" class="py-20 text-center">
      <div class="text-5xl mb-3" aria-hidden="true">🔍</div>
      <h1 class="text-xl font-bold mb-2">{{ loadError }}</h1>
      <!-- <RouterLink to="/games" class="text-blue-600 underline">ดูเกมทั้งหมด</RouterLink> -->
    </div>

    <template v-else>
      <!-- Header -->
      <header class="mb-6">
        <!-- <RouterLink to="/games" class="text-sm text-gray-500 hover:underline">← เกมทั้งหมด</RouterLink> -->
        <h1 class="text-center text-2xl sm:text-4xl font-extrabold mt-2">{{ board.name }}</h1>
        <p v-if="board.description" class="text-gray-600 mt-2">{{ board.description }}</p>
      </header>

      <!-- Progress -->
      <section class="mb-6" aria-label="ความคืบหน้าการจอง">
        <div class="flex justify-between text-sm font-medium mb-1.5">
          <span>จองแล้ว {{ board.reservedCount }} จาก {{ board.tileCount }} ป้าย</span>
          <span>{{ progress }}%</span>
        </div>
        <div
          class="h-2.5 bg-gray-200 rounded-full overflow-hidden"
          role="progressbar"
          :aria-valuenow="board.reservedCount"
          aria-valuemin="0"
          :aria-valuemax="board.tileCount"
        >
          <div class="h-full rounded-full transition-all" :style="{ width: `${progress}%`, background: themeColor }" />
        </div>
      </section>

      <!-- Closed states -->
      <div v-if="board.status === 'FULL'" class="notice notice-warn mb-6">
        <strong>ป้ายถูกจองครบทุกใบแล้ว 🎉</strong>
        <p>รอผู้จัดกิจกรรมกดเฉลยผล แล้วกลับมาดูได้ที่หน้านี้</p>
      </div>
      <div v-else-if="!canPlay" class="notice notice-info mb-6">
        <strong>เกมนี้ยังไม่เปิดให้จอง</strong>
      </div>

      <!-- Account gate -->
      <section v-if="canPlay" class="mb-8">
        <div v-if="!account" class="card">
          <h2 class="font-bold mb-1">กรอกชื่อบัญชีเพื่อเริ่มเล่น</h2>
          <p class="text-sm text-gray-500 mb-3">
            ใช้ชื่อบัญชีเดียวกับที่กรอกตอนบริจาค (ตัวพิมพ์เล็ก-ใหญ่และช่องว่างไม่มีผล)
          </p>
          <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="checkAccount">
            <label for="account-name" class="sr-only">ชื่อบัญชี</label>
            <input
              id="account-name"
              v-model="accountName"
              type="text"
              autocomplete="name"
              maxlength="190"
              placeholder="เช่น สมชาย ใจดี"
              class="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2"
              :style="{ '--tw-ring-color': themeColor }"
              :aria-invalid="!!accountError"
              aria-describedby="account-error"
            />
            <button
              type="submit"
              class="btn-primary"
              :style="{ background: themeColor }"
              :disabled="checking"
            >
              {{ checking ? 'กำลังตรวจสอบ…' : 'ตรวจสอบ Token' }}
            </button>
          </form>
          <p v-if="accountError" id="account-error" class="text-sm text-red-600 mt-2" role="alert">
            {{ accountError }}
          </p>
        </div>

        <!-- Account known, but no tokens -->
        <div v-else-if="tilesAffordable < 1 && myTileCount === 0" class="card text-center">
          <div class="text-4xl mb-2" aria-hidden="true">🎫</div>
          <h2 class="font-bold mb-1">
            {{ account.found ? `บัญชี "${account.displayName}" ยังไม่มี Token สำหรับเกมนี้` : 'ไม่พบบัญชีนี้ในระบบ' }}
          </h2>
          <p class="text-sm text-gray-600 mb-4">
            รับ Token ได้จากการบริจาคในโครงการที่ร่วมรายการ และ Token จะเข้าหลังผู้ดูแลตรวจสอบแล้ว
          </p>
          <div class="flex flex-wrap gap-2 justify-center">
            <RouterLink
              v-for="p in board.projects" :key="p.id"
              :to="`/donation/${p.slug}`"
              class="btn-primary" :style="{ background: themeColor }"
            >บริจาคที่ {{ p.name }}</RouterLink>
            <button type="button" class="btn-ghost" @click="resetAccount">เปลี่ยนชื่อบัญชี</button>
          </div>
        </div>

        <!-- Ready to play -->
        <div v-else class="card">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-bold">สวัสดี {{ account.displayName }}</div>
              <!-- Token balance moved to the coin badge on the board. -->
              <div class="text-sm text-gray-600">
                เปิดได้อีก <b>{{ atPersonalLimit ? 0 : tilesAffordable }}</b> ป้าย
                <span v-if="myTileCount > 0"> · จองไปแล้ว {{ myTileCount }} ป้าย</span>
              </div>
              <div v-if="atPersonalLimit" class="text-sm text-amber-700 mt-1">
                ⚠ จองครบสูงสุด {{ board.maxTilesPerAccount }} ป้ายต่อบัญชีแล้ว
              </div>
            </div>
            <button type="button" class="btn-ghost" @click="resetAccount">เปลี่ยนชื่อบัญชี</button>
          </div>
        </div>
      </section>

      <!-- Success banner -->
      <div v-if="successMessage" class="notice notice-success mb-6" role="status" aria-live="polite">
        <strong>{{ successMessage }}</strong>
      </div>

      <!-- Board -->
      <section aria-label="กระดานแผ่นป้าย" class="board-scroll">
        <ul class="board" role="list" :style="{ '--cols': columns }">
          <li v-for="tile in board.tiles" :key="tile.boardNumber">
            <button
              type="button"
              class="tile"
              :class="{
                'tile-available': tile.status === 'AVAILABLE',
                'tile-reserved': tile.status !== 'AVAILABLE',
                'tile-mine': isMine(tile),
                'tile-peeked': peeked === tile.boardNumber,
              }"
              :style="tile.status === 'AVAILABLE' ? { '--tile-accent': themeColor } : {}"
              :aria-label="tileLabel(tile)"
              :aria-pressed="tile.status !== 'AVAILABLE'"
              @click="onTileActivate(tile)"
            >
              <img v-if="tile.frontImage" :src="tile.frontImage" alt="" loading="lazy" class="tile-img" />
              <span class="tile-number" :class="{ 'on-image': tile.frontImage }">{{ tile.boardNumber }}</span>

              <!-- Status is never colour-only: reserved tiles carry a lock glyph. -->
              <span v-if="tile.status !== 'AVAILABLE'" class="tile-lock" aria-hidden="true">🔒</span>

              <span class="tile-overlay">
                <template v-if="tile.status !== 'AVAILABLE'">
                  {{ tile.reservedBy ? `จองแล้วโดย ${tile.reservedBy}` : 'มีผู้จองแล้ว' }}
                </template>
              </span>
            </button>
          </li>
        </ul>
        <p class="text-xs text-gray-500 mt-3 sm:hidden">แตะป้ายที่ถูกจองแล้วเพื่อดูชื่อผู้จอง</p>
      </section>

      <!--
        Token balance as a coin badge, in flow below the board and aligned right. The artwork sets the
        box through its own aspect ratio; the copy sits in the cream panel filling its right side.
      -->
      <div v-if="account" class="mt-4 flex justify-end">
        <!-- The negative term steepens the desktop growth while phones stay pinned to the floor. -->
        <div class="relative w-[clamp(160px,34vw_-_4rem,520px)] aspect-[413/175]">
          <img src="/images/bg-coin.png" alt="" aria-hidden="true" class="absolute inset-0 h-full w-full" />
          <p
            class="absolute inset-y-0 right-[4%] flex w-[58%] flex-col items-center justify-center text-center
                   font-bold leading-tight text-amber-800 text-[clamp(0.8rem,2.4vw_-_0.4rem,2.25rem)]"
          >
            คุณมี<br />{{ account.tokens }} เหรียญ
          </p>
        </div>
      </div>

      <!-- Confirm dialog -->
      <AppModal
        :open="confirmOpen"
        :busy="submitting"
        title="ยืนยันการจองป้าย"
        @close="confirmOpen = false"
      >
        <p class="text-gray-700">
          คุณต้องการใช้ <b>{{ board.tokensPerTile }}</b> Token
          เพื่อจองป้ายหมายเลข <b>{{ selected?.boardNumber }}</b> ใช่หรือไม่?
        </p>
        <p class="text-sm text-gray-500 mt-2">
          เมื่อจองแล้วจะเปลี่ยนหรือยกเลิกไม่ได้ และจะทราบรางวัลเมื่อผู้จัดกิจกรรมกดเฉลย
        </p>

        <p v-if="actionError" class="text-sm text-red-600 mt-3" role="alert">{{ actionError }}</p>

        <div class="flex gap-2 mt-5">
          <button type="button" class="btn-ghost flex-1" :disabled="submitting" @click="confirmOpen = false">
            ยกเลิก
          </button>
          <button
            type="button"
            class="btn-primary flex-1"
            :style="{ background: themeColor }"
            :disabled="submitting"
            @click="confirmReserve"
          >
            {{ submitting ? 'กำลังจอง…' : 'ยืนยันการจอง' }}
          </button>
        </div>
      </AppModal>
    </template>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-5 shadow-sm; }
.notice { @apply rounded-xl p-4 border; }
.notice-warn { @apply bg-amber-50 border-amber-200 text-amber-900; }
.notice-info { @apply bg-gray-50 border-gray-200 text-gray-700; }
.notice-success { @apply bg-emerald-50 border-emerald-200 text-emerald-900; }

.btn-primary {
  @apply text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-ghost {
  @apply border border-gray-300 font-medium px-5 py-2.5 rounded-lg transition hover:bg-gray-50 disabled:opacity-50;
}

/* Only the board scrolls sideways when a large grid cannot fit — never the page. */
.board-scroll { overflow-x: auto; padding-bottom: 4px; }

.board {
  display: grid;
  /* Exactly `--cols` columns, so the grid stays square. The min keeps every tile
     at the 44px minimum touch target; the max stops a small board from ballooning. */
  grid-template-columns: repeat(var(--cols), minmax(44px, 108px));
  justify-content: center;
  gap: 10px;
}
@media (min-width: 640px) {
  .board {
    grid-template-columns: repeat(var(--cols), minmax(56px, 132px));
    gap: 12px;
  }
}

/**
 * Gold frame: the tile itself carries the gradient and `::before` paints the inner surface inset by
 * the frame width. A gradient cannot be a `border-color`, and `border-image` would square off the
 * rounded corners, so the frame is drawn as background showing through the inset.
 */
.tile {
  --frame: 3px;
  --tile-radius: 14px;
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--tile-radius);
  border: 0;
  padding: 0;
  background: linear-gradient(150deg, #ffb648, #ffe08a 38%, #f7913a 70%, #ffcf6b);
  box-shadow: 0 2px 8px rgb(180 83 9 / 22%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tile::before {
  content: '';
  position: absolute;
  inset: var(--frame);
  border-radius: calc(var(--tile-radius) - var(--frame));
  background: #fff;
}
.tile:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }

.tile-available { cursor: pointer; }
.tile-available::before { background: color-mix(in srgb, var(--tile-accent) 12%, white); }
.tile-available:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgb(0 0 0 / 18%); }

.tile-reserved { cursor: default; }
.tile-reserved::before {
  background: #e5e7eb;
  /* Hatching distinguishes reserved tiles without relying on colour alone. */
  background-image: repeating-linear-gradient(
    45deg, transparent, transparent 6px, rgb(0 0 0 / 5%) 6px, rgb(0 0 0 / 5%) 12px
  );
}
.tile-mine { box-shadow: 0 0 0 2px #059669, 0 2px 8px rgb(180 83 9 / 22%); }

.tile-img {
  position: absolute;
  inset: var(--frame);
  /* Explicit size, not `auto`: an absolutely positioned replaced element falls back to its intrinsic
     size and honours only the top/left insets, which would let the art cover the bottom/right frame. */
  width: calc(100% - var(--frame) * 2);
  height: calc(100% - var(--frame) * 2);
  border-radius: calc(var(--tile-radius) - var(--frame));
  object-fit: cover;
}

/* Pinned to the top-right corner so cover art stays unobstructed in the middle. */
.tile-number {
  position: absolute;
  top: 5px;
  right: 8px;
  z-index: 1;
  font-size: 1.15rem;
  line-height: 1;
  font-weight: 900;
  font-style: italic;
  color: #ffd24a;
  /* Outline instead of a chip: the digits stay readable over any cover art while the picture
     underneath is left uncovered. */
  -webkit-text-stroke: 1.2px #7c3a09;
  paint-order: stroke fill;
  text-shadow: 0 2px 3px rgb(0 0 0 / 40%);
}
@media (min-width: 640px) {
  .tile-number { font-size: 1.45rem; top: 6px; right: 10px; }
}

/**
 * Cover art is arbitrary, so the number cannot rely on contrasting with it. A
 * translucent dark chip behind the digits keeps them readable over any photo —
 * light, dark or busy — without hiding the picture.
 */
.tile-number.on-image {
  /* The stroke already carries the contrast, so cover art needs no extra treatment. */
  text-shadow: 0 2px 4px rgb(0 0 0 / 55%);
}

.tile-reserved .tile-number { opacity: 0.45; }
.tile-reserved .tile-number.on-image { opacity: 0.85; }
/* Dim the artwork on reserved tiles so taken and free read differently at a glance. */
.tile-reserved .tile-img { filter: grayscale(0.85) brightness(0.85); opacity: 0.55; }

/* Moved to the opposite corner now that the number occupies the top-right. */
.tile-lock {
  position: absolute;
  top: 4px;
  left: 5px;
  z-index: 1;
  font-size: 0.7rem;
  text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
}

.tile-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 600;
  color: white;
  background: rgb(17 24 39 / 88%);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  word-break: break-word;
}
/* Hover reveals on pointer devices; tap pins it open where hover does not exist. */
@media (hover: hover) {
  .tile-reserved:hover .tile-overlay { opacity: 1; }
}
.tile-peeked .tile-overlay { opacity: 1; }
.tile-reserved:focus-visible .tile-overlay { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .tile, .tile-overlay { transition: none; }
  .tile-available:hover { transform: none; }
}
</style>
