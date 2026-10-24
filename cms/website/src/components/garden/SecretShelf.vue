<script setup lang="ts">
/**
 * The secret fertiliser shelf: a wooden cabinet of every flower that can be bought with tokens,
 * four to a shelf and six shelves to a page, paged with the arrows, the dots or a swipe.
 *
 * Three steps, all in this one popup: say which donation account pays (its tokens are shown),
 * choose a flower off the shelf, and confirm — once, because it cannot be changed afterwards.
 * Every flower costs the same, so the price is on the sign at the top rather than under each.
 */
import { computed, ref } from 'vue';
import {
  buySecret,
  checkTokens,
  errorMessage,
  fetchShelf,
  type Plant,
  type ShelfFlower,
} from '@/api/garden';
import { RARITY_LABEL } from './garden';

const props = defineProps<{
  slug: string;
  plant: Plant;
  donationSlug: string | null;
  donationName: string | null;
}>();
const emit = defineEmits<{ close: []; bought: [plant: Plant, message: string] }>();

const PER_PAGE = 24;

const price = ref(0);
const designs = ref<ShelfFlower[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

void fetchShelf(props.slug)
  .then((shelf) => {
    price.value = shelf.price;
    designs.value = shelf.designs;
  })
  .catch((err) => (error.value = errorMessage(err)))
  .finally(() => (loading.value = false));

// ── Account ──

const ACCOUNT_KEY = 'garden.accountName';
const accountName = ref(readAccount());
const tokens = ref<number | null>(null);
const checking = ref(false);

function readAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) ?? '';
  } catch {
    return '';
  }
}

async function check(): Promise<void> {
  if (!accountName.value.trim()) return;
  checking.value = true;
  error.value = null;
  try {
    const result = await checkTokens(props.slug, accountName.value.trim());
    tokens.value = result.found ? result.tokens : 0;
    if (!result.found) error.value = 'ไม่พบชื่อบัญชีนี้ ลองพิมพ์ให้ตรงกับที่ใช้ตอนโดเนท';
    try {
      localStorage.setItem(ACCOUNT_KEY, accountName.value.trim());
    } catch {
      // Only a convenience for next time.
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    checking.value = false;
  }
}

const affordable = computed(() => tokens.value !== null && tokens.value >= price.value);

// ── Shelf paging ──

const page = ref(0);
const pages = computed(() => Math.max(1, Math.ceil(designs.value.length / PER_PAGE)));
const onPage = computed(() =>
  designs.value.slice(page.value * PER_PAGE, (page.value + 1) * PER_PAGE),
);
/** Six shelves of four, the last ones empty on a short page — a cabinet is never half-built. */
const shelves = computed(() =>
  Array.from({ length: 6 }, (_, row) => {
    const items: Array<ShelfFlower | null> = onPage.value.slice(row * 4, row * 4 + 4);
    while (items.length < 4) items.push(null);
    return items;
  }),
);

function go(delta: number): void {
  page.value = (page.value + delta + pages.value) % pages.value;
}

let startX: number | null = null;
function onPointerDown(e: PointerEvent): void {
  startX = e.clientX;
}
function onPointerUp(e: PointerEvent): void {
  if (startX === null) return;
  const dx = e.clientX - startX;
  startX = null;
  if (Math.abs(dx) > 50 && pages.value > 1) go(dx < 0 ? 1 : -1);
}

// ── Choosing ──

const chosen = ref<ShelfFlower | null>(null);
const confirming = ref(false);
const buying = ref(false);
const idempotencyKey = ref(newKey());

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function choose(flower: ShelfFlower | null): void {
  if (!flower) return;
  chosen.value = flower;
  confirming.value = false;
  error.value = null;
}

async function buy(): Promise<void> {
  if (!chosen.value || buying.value) return;
  buying.value = true;
  error.value = null;
  try {
    const result = await buySecret(props.slug, props.plant.id, {
      designId: chosen.value.id,
      accountName: accountName.value.trim(),
      idempotencyKey: idempotencyKey.value,
    });
    tokens.value = result.remainingTokens;
    emit('bought', result.plant, result.message);
  } catch (err) {
    error.value = errorMessage(err);
    // A failed purchase may be retried with a different choice; that is a new request.
    idempotencyKey.value = newKey();
  } finally {
    buying.value = false;
  }
}
</script>

<template>
  <div
    class="shelf-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="ชั้นปุ๋ยลับ"
    @click.self="emit('close')"
  >
    <div class="cabinet">
      <div class="sign">
        <span class="sign-title">ปุ๋ยลับ</span>
        <span class="sign-sub">{{ price }} token ต่อแบบ · ต้นที่ {{ plant.plotIndex }}</span>
      </div>

      <!-- Step 1: who pays. -->
      <div class="account">
        <form class="account-row" @submit.prevent="check">
          <input
            v-model="accountName"
            class="account-input"
            placeholder="ชื่อบัญชีที่ใช้โดเนท"
            autocomplete="off"
            maxlength="190"
          />
          <button type="submit" class="btn-wood" :disabled="checking || !accountName.trim()">
            {{ checking ? 'กำลังตรวจ…' : 'ดู token' }}
          </button>
        </form>
        <p v-if="tokens !== null" class="account-note">
          มี <b>{{ tokens }}</b> token
          <template v-if="!affordable">
            · ไม่พอสำหรับปุ๋ยลับ
            <a v-if="donationSlug" :href="`/donation/${donationSlug}`" class="link"
              >ไปโดเนท{{ donationName ? ` ${donationName}` : '' }}</a
            >
          </template>
        </p>
        <p v-else class="account-note">กรอกชื่อบัญชีก่อน แล้วเลือกทานตะวันบนชั้นได้เลย</p>
      </div>

      <div v-if="loading" class="state">กำลังเปิดตู้…</div>
      <div v-else-if="!designs.length" class="state">ยังไม่มีทานตะวันบนชั้น</div>

      <template v-else>
        <div class="dots" aria-hidden="true">
          <span v-for="n in pages" :key="n" class="dot" :class="{ 'dot-on': n - 1 === page }" />
        </div>

        <div class="shelves-wrap">
          <div class="shelves" @pointerdown="onPointerDown" @pointerup="onPointerUp">
            <div v-for="(row, r) in shelves" :key="`${page}-${r}`" class="shelf">
              <button
                v-for="(item, i) in row"
                :key="item?.id ?? `empty-${i}`"
                type="button"
                class="slot"
                :class="{ 'slot-empty': !item, 'slot-chosen': item && chosen?.id === item.id }"
                :disabled="!item"
                :aria-label="item ? item.name : undefined"
                @click="choose(item)"
              >
                <img
                  v-if="item"
                  :src="item.imageUrl"
                  :alt="item.name"
                  loading="lazy"
                  draggable="false"
                />
              </button>
            </div>
          </div>

          <button
            v-if="pages > 1"
            type="button"
            class="arrow arrow-left"
            aria-label="หน้าก่อน"
            @click="go(-1)"
          >
            ‹
          </button>
          <button
            v-if="pages > 1"
            type="button"
            class="arrow arrow-right"
            aria-label="หน้าถัดไป"
            @click="go(1)"
          >
            ›
          </button>
        </div>
      </template>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- In the flow rather than pinned, so a long cabinet never scrolls a shelf under them. -->
      <div class="foot">
        <span />
        <button type="button" class="close" aria-label="ปิด" @click="emit('close')">✕</button>
        <span class="count">{{ onPage.length }}/{{ designs.length }}</span>
      </div>

      <!-- Step 2 and 3: the chosen flower, then the one confirmation. -->
      <div v-if="chosen" class="detail" @click.self="chosen = null">
        <div class="detail-card">
          <img :src="chosen.imageUrl" :alt="chosen.name" class="detail-img" />
          <h3 class="detail-name">{{ chosen.name }}</h3>
          <p class="detail-meta">
            {{ RARITY_LABEL[chosen.rarity] ?? chosen.rarity }}
            <template v-if="chosen.allowFace"> · มีรูปหน้าสุ่ม เฉลยในวันเปิดผล</template>
          </p>

          <template v-if="!confirming">
            <button
              type="button"
              class="btn-wood btn-big"
              :disabled="!affordable"
              @click="confirming = true"
            >
              ใช้ปุ๋ยนี้ ({{ price }} token)
            </button>
            <p v-if="tokens === null" class="detail-hint">กรอกชื่อบัญชีโดเนทด้านบนก่อน</p>
            <p v-else-if="!affordable" class="detail-hint">token ไม่พอ</p>
          </template>
          <template v-else>
            <p class="warn">ใส่แล้วเปลี่ยนแบบไม่ได้ และใส่ได้ต้นละครั้งเดียว</p>
            <div class="confirm-row">
              <button
                type="button"
                class="btn-plain"
                :disabled="buying"
                @click="confirming = false"
              >
                ยกเลิก
              </button>
              <button type="button" class="btn-wood" :disabled="buying" @click="buy">
                {{ buying ? 'กำลังใส่ปุ๋ย…' : 'ยืนยัน ใส่ปุ๋ยลับ' }}
              </button>
            </div>
          </template>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button type="button" class="btn-plain" @click="chosen = null">กลับไปที่ชั้น</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shelf-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgb(17 24 39 / 0.6);
}
.cabinet {
  position: relative;
  width: min(440px, 100%);
  max-height: calc(100svh - 24px);
  overflow-y: auto;
  padding: 64px 14px 12px;
  border-radius: 18px;
  background: linear-gradient(#a0522d, #8b4513);
  border: 6px solid #6b3410;
  box-shadow:
    inset 0 0 0 3px #c47a45,
    0 20px 40px rgb(0 0 0 / 0.35);
}
.sign {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 22px;
  border-radius: 10px;
  background: #f4c27a;
  border: 3px solid #b8743a;
  color: #5b2d0a;
  white-space: nowrap;
}
.sign-title {
  font-size: 1.15rem;
  font-weight: 800;
}
.sign-sub {
  font-size: 0.75rem;
}
.account {
  margin: 8px 0 10px;
  padding: 10px;
  border-radius: 12px;
  background: rgb(255 248 235 / 0.95);
}
.account-row {
  display: flex;
  gap: 8px;
}
.account-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d6b48a;
  font-size: 0.95rem;
}
.account-note {
  margin-top: 6px;
  font-size: 0.8rem;
  color: #5b3a1e;
}
.link {
  text-decoration: underline;
  font-weight: 700;
  margin-left: 4px;
}
.state {
  padding: 40px 0;
  text-align: center;
  color: #fde7c7;
}
.dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.35);
}
.dot-on {
  background: #fff;
}
.shelves-wrap {
  position: relative;
}
.shelves {
  display: flex;
  flex-direction: column;
  gap: 6px;
  touch-action: pan-y;
}
.shelf {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 6px 6px 10px;
  border-radius: 6px;
  background: #5a2d0c;
  box-shadow:
    inset 0 -8px 0 #d08a4c,
    inset 0 -11px 0 #8b4513;
}
.slot {
  aspect-ratio: 1 / 1.1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 4px 2px 6px;
  border-radius: 6px;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s;
}
.slot:hover:not(:disabled) {
  transform: translateY(-3px);
}
.slot img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 2px rgb(0 0 0 / 0.35));
}
.slot-empty {
  cursor: default;
}
.slot-chosen {
  border-color: #fde047;
  background: rgb(253 224 71 / 0.15);
}
.arrow {
  position: absolute;
  top: 50%;
  width: 34px;
  height: 56px;
  border-radius: 10px;
  background: #f4c27a;
  border: 3px solid #b8743a;
  color: #5b2d0a;
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
}
.arrow-left {
  left: -6px;
}
.arrow-right {
  right: -6px;
}
.foot {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  margin-top: 12px;
}
.count {
  justify-self: end;
  font-weight: 800;
  color: #fde7c7;
  font-size: 1.1rem;
}
.close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #ef4444;
  border: 3px solid #fff;
  color: #fff;
  font-weight: 800;
}
.error {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.85rem;
}
.detail {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(17 24 39 / 0.55);
}
.detail-card {
  width: min(360px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
  border-radius: 18px;
  background: #fffaf0;
  text-align: center;
}
.detail-img {
  width: 60%;
  max-height: 40svh;
  object-fit: contain;
}
.detail-name {
  font-size: 1.25rem;
  font-weight: 800;
  color: #5b2d0a;
}
.detail-meta {
  font-size: 0.85rem;
  color: #6b7280;
}
.detail-hint {
  font-size: 0.8rem;
  color: #92400e;
}
.warn {
  font-weight: 700;
  color: #b91c1c;
}
.confirm-row {
  display: flex;
  gap: 8px;
}
.btn-wood {
  padding: 8px 14px;
  border-radius: 10px;
  background: #f59e0b;
  border: 2px solid #b45309;
  color: #3b1d06;
  font-weight: 800;
}
.btn-wood:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-big {
  padding: 12px 20px;
  font-size: 1rem;
}
.btn-plain {
  padding: 8px 14px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
  font-weight: 600;
}
</style>
