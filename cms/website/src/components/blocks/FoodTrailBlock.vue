<script setup lang="ts">
/**
 * A food trail as a checklist: each restaurant and its dishes, set in the admin under
 * ตามรอยร้านอาหาร, for a fan to tick as they eat them — then, with their account typed in,
 * saved as a picture to post.
 *
 * Names only: the restaurants' and dishes' pictures are for the admin's poster.
 *
 * Ticks are saved under the account the fan types (`/public/food-trail/progress`), so typing
 * the same account again — later, or on another phone — brings them back. There is no
 * password. They are also kept in this browser's localStorage, so ticking works before any
 * account is given; giving one that has nothing saved yet saves what is ticked under it.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { api } from '@/api/client';
import WishCardActions from '@/components/birthday/WishCardActions.vue';
import { drawChecklist, progress } from '@/components/foodTrail/drawChecklist';
import type { ApiResponse, FoodTrailProgress, PublicFoodTrail } from '@cms/shared';

const props = withDefaults(
  defineProps<{
    heading?: string;
    description?: string;
    /** One trail; 0 or blank shows the first trail on the web. */
    trailId?: number | string;
    accentColor?: string;
  }>(),
  { heading: '', description: '', trailId: 0, accentColor: '' },
);

const accent = computed(() => props.accentColor || '#ea480c');

const trail = ref<PublicFoodTrail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  const n = Math.round(Number(props.trailId));
  try {
    const { data } = await api.get<ApiResponse<PublicFoodTrail | null>>('/public/food-trail', {
      params: { trailId: Number.isFinite(n) && n > 0 ? n : undefined },
    });
    trail.value = data.data;
    restore();
    // Back on the page with an account given before: pick its ticks up again.
    if (trail.value && cleanAccount.value) void useAccount();
  } catch {
    error.value = 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่';
  } finally {
    loading.value = false;
  }
}
void load();

// ── What is ticked: in this browser, and under the account once one is given ──
const ACCOUNT_KEY = 'food-trail:account';
const ticksKey = () => `food-trail:${trail.value?.id}`;

const account = ref(localStorage.getItem(ACCOUNT_KEY) ?? '');
const cleanAccount = computed(() => account.value.trim().replace(/^@+/, '').trim());
// The "@" is already drawn in front of the field; a typed or pasted one would show twice.
watch(account, (v) => {
  if (v.startsWith('@')) account.value = v.replace(/^@+/, '');
  else localStorage.setItem(ACCOUNT_KEY, v.trim());
});

const ticked = reactive({ places: new Set<number>(), menus: new Set<number>() });
/**
 * Whose the ticks in this browser are: null while no account has been given. Only those
 * unclaimed ticks carry over to a new account — switching from one account to another starts
 * the new one empty rather than handing it the first one's.
 */
let ticksOwner: string | null = null;

function restore(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(ticksKey()) ?? '{}');
    ticked.places = new Set(saved.places ?? []);
    ticked.menus = new Set(saved.menus ?? []);
    ticksOwner = saved.owner ?? null;
  } catch {
    // Something else wrote there: start afresh.
  }
}

function persist(): void {
  if (!trail.value) return;
  ticksOwner = linked.value ?? ticksOwner;
  localStorage.setItem(
    ticksKey(),
    JSON.stringify({ places: [...ticked.places], menus: [...ticked.menus], owner: ticksOwner }),
  );
  scheduleSave();
}

/** The account the ticks are saved under — set once given, not while it is being typed. */
const linked = ref<string | null>(null);
const syncing = ref(false);
const syncNote = ref<{ ok: boolean; text: string } | null>(null);

async function saveNow(): Promise<void> {
  if (!trail.value || !linked.value) return;
  syncing.value = true;
  try {
    await api.put<ApiResponse<FoodTrailProgress>>('/public/food-trail/progress', {
      trailId: trail.value.id,
      account: linked.value,
      placeIds: [...ticked.places],
      menuIds: [...ticked.menus],
    });
    syncNote.value = { ok: true, text: `บันทึกใน @${linked.value} แล้ว ✓` };
  } catch (err: any) {
    syncNote.value = {
      ok: false,
      text:
        err?.response?.status === 429
          ? 'บันทึกถี่เกินไป รอสักครู่แล้วติ๊กใหม่อีกครั้ง'
          : 'บันทึกไม่สำเร็จ — ที่ติ๊กไว้ยังอยู่ในเครื่องนี้',
    };
  } finally {
    syncing.value = false;
  }
}

/** Ticks come in bursts; one save for the lot, a moment after the last. */
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(): void {
  if (!linked.value) return;
  clearTimeout(saveTimer);
  syncNote.value = { ok: true, text: 'กำลังบันทึก…' };
  saveTimer = setTimeout(() => void saveNow(), 700);
}
onBeforeUnmount(() => {
  // Leaving with a save still waiting: send it now rather than drop it.
  if (saveTimer) {
    clearTimeout(saveTimer);
    void saveNow();
  }
});

/**
 * Take the typed account as the fan's: what it has saved replaces what is ticked here; with
 * nothing saved yet, what is ticked here is saved under it.
 */
let linking = false;
async function useAccount(): Promise<void> {
  const name = cleanAccount.value;
  if (!trail.value || !name || linking) return;
  if (linked.value === name.toLowerCase()) return;
  // Enter fires both the form's submit and the field's change; one load is enough.
  linking = true;
  clearTimeout(saveTimer);
  syncing.value = true;
  syncNote.value = null;
  try {
    const { data } = await api.get<ApiResponse<FoodTrailProgress>>('/public/food-trail/progress', {
      params: { trailId: trail.value.id, account: name },
    });
    const saved = data.data;
    linked.value = saved.account;
    if (saved.updatedAt) {
      ticked.places = new Set(saved.placeIds);
      ticked.menus = new Set(saved.menuIds);
      ticksOwner = saved.account;
      localStorage.setItem(
        ticksKey(),
        JSON.stringify({ places: saved.placeIds, menus: saved.menuIds, owner: saved.account }),
      );
      syncNote.value = { ok: true, text: `โหลดรายการของ @${name} แล้ว` };
    } else if (!ticksOwner && (ticked.places.size || ticked.menus.size)) {
      // Ticked before any account was given: they are this fan's, so keep them under it.
      ticksOwner = saved.account;
      persist();
      clearTimeout(saveTimer);
      await saveNow();
    } else {
      // Another account's ticks on screen, or none: this one starts empty.
      ticked.places = new Set();
      ticked.menus = new Set();
      ticksOwner = saved.account;
      persist();
      clearTimeout(saveTimer);
      syncNote.value = { ok: true, text: `ติ๊กได้เลย ระบบจะบันทึกไว้ใน @${name}` };
    }
  } catch (err: any) {
    syncNote.value = {
      ok: false,
      text:
        err?.response?.status === 429
          ? 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่'
          : 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่',
    };
  } finally {
    syncing.value = false;
    linking = false;
  }
}

// Typing another name stops saving under the old one until the new one is given.
watch(account, () => {
  if (linked.value && cleanAccount.value.toLowerCase() !== linked.value) {
    clearTimeout(saveTimer);
    linked.value = null;
    syncNote.value = null;
  }
});

type Place = PublicFoodTrail['places'][number];

/** A restaurant counts as been to once it is ticked itself, or any of its dishes is. */
const visited = (p: Place) => ticked.places.has(p.id) || p.menus.some((m) => ticked.menus.has(m.id));

function togglePlace(p: Place): void {
  if (visited(p)) {
    // Unticking the restaurant unticks its dishes too, or it would stay ticked through them.
    ticked.places.delete(p.id);
    p.menus.forEach((m) => ticked.menus.delete(m.id));
  } else {
    ticked.places.add(p.id);
  }
  persist();
}

function toggleMenu(id: number): void {
  if (ticked.menus.has(id)) ticked.menus.delete(id);
  else ticked.menus.add(id);
  persist();
}

function clearAll(): void {
  ticked.places = new Set();
  ticked.menus = new Set();
  persist();
}

const stats = computed(() =>
  trail.value ? progress(trail.value, ticked.places, ticked.menus) : { total: 0, done: 0 },
);
const percent = computed(() => (stats.value.total ? (stats.value.done / stats.value.total) * 100 : 0));

// ── The picture ──
const accountError = ref(false);

async function render(): Promise<File | null> {
  if (!trail.value) return null;
  if (!cleanAccount.value) {
    accountError.value = true;
    document.getElementById('food-trail-account')?.focus();
    return null;
  }
  accountError.value = false;
  const blob = await drawChecklist({
    trail: trail.value,
    account: cleanAccount.value,
    places: ticked.places,
    menus: ticked.menus,
    accent: accent.value,
  });
  const safe = cleanAccount.value.replace(/[^\p{L}\p{N}\p{M}\-_]+/gu, '-').slice(0, 40);
  return new File([blob], `food-trail-${safe || 'checklist'}.png`, { type: 'image/png' });
}
</script>

<template>
  <div class="wrap container-site" :style="{ '--accent': accent }">
    <h2 v-if="heading" class="heading">{{ heading }}</h2>
    <p v-if="description" class="lead">{{ description }}</p>

    <p v-if="loading" class="muted center">กำลังโหลด…</p>
    <p v-else-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!trail" class="muted center">ยังไม่มีรายการ</p>

    <template v-else>
      <p v-if="trail.name !== heading" class="trail-name">{{ trail.name }}</p>
      <p v-if="trail.description" class="muted center pre">{{ trail.description }}</p>

      <form class="account" @submit.prevent="useAccount">
        <label for="food-trail-account" class="save-label">ใส่ชื่อ account เพื่อบันทึกรายการที่ติ๊ก</label>
        <div class="account-row">
          <div class="field" :class="{ invalid: accountError && !cleanAccount }">
            <span class="at" aria-hidden="true">@</span>
            <input
              id="food-trail-account"
              v-model="account"
              type="text"
              maxlength="101"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
              placeholder="account"
              @change="useAccount"
            />
          </div>
          <button type="submit" class="use" :disabled="!cleanAccount || syncing">บันทึก / โหลด</button>
        </div>
        <p class="hint">ใส่ account เดิมครั้งหน้า (หรือในเครื่องอื่น) จะได้รายการที่ติ๊กไว้กลับมา</p>
        <p v-if="accountError && !cleanAccount" class="error" role="alert">กรุณาใส่ชื่อ account ก่อนเซฟรูป</p>
        <p v-else-if="syncNote" :class="syncNote.ok ? 'sync' : 'error'" role="status">{{ syncNote.text }}</p>
      </form>

      <div class="progress" role="status" aria-live="polite">
        <div class="progress-text">กินแล้ว {{ stats.done }}/{{ stats.total }}</div>
        <div class="bar"><div class="bar-fill" :style="{ width: `${percent}%` }" /></div>
      </div>

      <ol class="places" role="list">
        <li v-for="(p, i) in trail.places" :key="p.id" class="place" :class="{ done: visited(p) }">
          <label class="place-head">
            <input type="checkbox" class="tick" :checked="visited(p)" @change="togglePlace(p)" />
            <span>
              <span class="place-name">{{ i + 1 }}. {{ p.name }}</span>
              <span v-if="p.note" class="muted note">{{ p.note }}</span>
            </span>
          </label>
          <ul v-if="p.menus.length" class="menus" role="list">
            <li v-for="m in p.menus" :key="m.id">
              <label class="menu" :class="{ eaten: ticked.menus.has(m.id) }">
                <input type="checkbox" class="tick" :checked="ticked.menus.has(m.id)" @change="toggleMenu(m.id)" />
                <span>{{ m.name }}</span>
              </label>
            </li>
          </ul>
        </li>
      </ol>

      <div class="save">
        <div class="save-actions">
          <WishCardActions
            :render="render"
            :name="cleanAccount || 'checklist'"
            :title="trail.name"
            save-label="💾 เซฟเป็นรูป"
            :theme-color="accent"
            center
          />
          <button v-if="stats.done" type="button" class="clear" @click="clearAll">ล้างที่ติ๊กไว้</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 40rem;
  padding: clamp(1.5rem, 4vw, 3rem) 1rem;
}
.heading {
  margin: 0 0 0.5rem;
  text-align: center;
  font-weight: 800;
  font-size: clamp(1.4rem, 3.2vw, 2.2rem);
  white-space: pre-line;
}
.lead {
  margin: 0 0 1.5rem;
  text-align: center;
  opacity: 0.75;
  white-space: pre-line;
}
.trail-name {
  margin: 0;
  text-align: center;
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--accent);
}
.center {
  text-align: center;
}
.pre {
  white-space: pre-line;
}
.muted {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: #6b7280;
}
.error {
  margin: 0.5rem 0 0;
  text-align: center;
  color: #dc2626;
}
.progress {
  margin: 1.25rem auto 1rem;
  max-width: 24rem;
  text-align: center;
}
.progress-text {
  font-weight: 700;
  margin-bottom: 0.4rem;
}
.bar {
  height: 0.6rem;
  border-radius: 999px;
  background: #f1e2d3;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.25s;
}
.places {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.place {
  background: #fff;
  color: #111827;
  border: 2px solid #f3f4f6;
  border-radius: 1rem;
  padding: 1rem 1.1rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
  transition: border-color 0.15s;
}
.place.done {
  border-color: var(--accent);
}
.place-head {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  cursor: pointer;
}
.place-name {
  display: block;
  font-weight: 700;
  font-size: 1.05rem;
}
.note {
  display: block;
  white-space: pre-line;
}
.menus {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.4rem 1rem;
}
.menu {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.35rem 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #4b5563;
}
.menu:hover {
  background: #f9fafb;
}
.menu.eaten {
  color: #111827;
  font-weight: 600;
}
.tick {
  flex: 0 0 auto;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.15rem;
  accent-color: var(--accent);
  cursor: pointer;
}
.save {
  margin-top: 1.5rem;
  display: grid;
  gap: 0.5rem;
  justify-items: center;
}
.account {
  margin: 1.25rem auto 0;
  max-width: 26rem;
  display: grid;
  gap: 0.4rem;
  justify-items: center;
  text-align: center;
}
.account-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}
.account-row .field {
  flex: 1 1 auto;
  max-width: none;
}
.use {
  flex: 0 0 auto;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  border-radius: 0.6rem;
  padding: 0 1rem;
}
.use:disabled {
  opacity: 0.5;
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: #6b7280;
}
.sync {
  margin: 0;
  font-size: 0.85rem;
  color: #15803d;
}
.save-label {
  font-weight: 600;
}
.field {
  width: 100%;
  max-width: 20rem;
  display: flex;
  align-items: center;
  border: 1px solid #d1d5db;
  border-radius: 0.6rem;
  background: #fff;
  color: #111827;
  padding-left: 0.9rem;
}
.field:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.field.invalid {
  border-color: #dc2626;
}
.at {
  color: #6b7280;
}
.field input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 0.8rem 0.9rem 0.8rem 0.2rem;
  font-size: 1rem;
}
.save-actions {
  display: grid;
  gap: 0.5rem;
  justify-items: center;
  margin-top: 0.25rem;
}
.clear {
  font-size: 0.85rem;
  color: #6b7280;
  text-decoration: underline;
}
</style>
