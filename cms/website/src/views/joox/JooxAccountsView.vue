<script setup lang="ts">
/**
 * บัญชี JOOX ของฉัน — a voter's own JOOX logins, and which accounts on the shared vote list
 * each has voted for today. See the API's `publicJooxAccounts.module.ts`.
 *
 * Private to whoever is signed in: the list holds emails and phone numbers. Signed in the same
 * way as `/joox-vote`, and a session that lapses mid-visit sends the phone to the same login
 * page with this route to come back to.
 *
 * Each account casts up to {@link JOOX_VOTES_PER_ACCOUNT} votes a voting day. They are picked
 * from the checklist's list in a dialog and saved as a whole set, and they all come off at the
 * 23:00 Thai-time reset. Picking here changes nothing on the checklist — this page only keeps
 * track.
 *
 * Laid out for a phone like the checklist: search and a filter on top, one card per account,
 * and add / edit / delete / pick votes each in a dialog.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocumentVisibility, useNow } from '@vueuse/core';
import AppModal from '@/components/AppModal.vue';
import { applySeo } from '@/composables/useSeo';
import { useJooxAuthStore } from '@/stores/jooxAuth';
import { isJooxAuthError } from '@/api/jooxAuth';
import { listJooxVotes, messageOf, statusOf, type JooxVoteAccount } from '@/api/jooxVotes';
import {
  addJooxAccount,
  deleteJooxAccount,
  listJooxAccounts,
  setJooxAccountVotes,
  updateJooxAccount,
  type JooxAccount,
} from '@/api/jooxAccounts';
import {
  JOOX_VOTES_PER_ACCOUNT,
  isJooxAccountUser,
  jooxNameKey,
  jooxVoteDay,
  jooxVoteResetAt,
} from '@cms/shared';

applySeo({ title: 'บัญชี JOOX ของฉัน' });

// ── Who is signed in ──────────────────────────────────────────────────────────
const auth = useJooxAuthStore();
const route = useRoute();
const router = useRouter();

let leaving = false;

async function toLogin(): Promise<void> {
  if (leaving) return;
  leaving = true;
  auth.clear();
  await router.replace({ name: 'joox-login', query: { redirect: route.fullPath } });
}

void auth.restore().then((valid) => {
  if (!valid) void toLogin();
});

/** Runs every failed call past the session check; true when the phone is being sent away. */
function checkAuth(err: unknown): boolean {
  if (!isJooxAuthError(err)) return false;
  void toLogin();
  return true;
}

const signingOut = ref(false);

async function signOut(): Promise<void> {
  signingOut.value = true;
  await auth.logout();
  leaving = true;
  await router.replace({ name: 'joox-login' });
}

// ── Data ──────────────────────────────────────────────────────────────────────
const accounts = ref<JooxAccount[]>([]);
/** The checklist's accounts: what a vote can go to. */
const targets = ref<JooxVoteAccount[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

async function refresh(): Promise<void> {
  try {
    const [mine, list] = await Promise.all([listJooxAccounts(), listJooxVotes()]);
    accounts.value = mine;
    targets.value = list;
    loadError.value = null;
  } catch (err) {
    if (checkAuth(err)) return;
    if (loading.value) loadError.value = 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่';
  } finally {
    loading.value = false;
  }
}

function put(row: JooxAccount): void {
  const i = accounts.value.findIndex((a) => a.id === row.id);
  if (i === -1) accounts.value = [...accounts.value, row];
  else accounts.value.splice(i, 1, row);
}

function drop(id: number): void {
  accounts.value = accounts.value.filter((a) => a.id !== id);
}

void refresh();

// Back from the JOOX app, or another tab: catch up. And at 23:00 every vote comes off.
const visibility = useDocumentVisibility();
watch(visibility, (v) => {
  if (v === 'visible') void refresh();
});
const now = useNow({ interval: 15_000 });
const today = computed(() => jooxVoteDay(now.value));
watch(today, () => void refresh());

const resetIn = computed(() => {
  const ms = jooxVoteResetAt(now.value).getTime() - now.value.getTime();
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
});

// ── A failed save, or a confirmation, shown for a few seconds ─────────────────
const notice = ref<string | null>(null);
let noticeTimer: number | undefined;

function flash(message: string | null): void {
  if (!message) return;
  notice.value = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), 4000);
}
onBeforeUnmount(() => window.clearTimeout(noticeTimer));

// ── The list ──────────────────────────────────────────────────────────────────
type Filter = 'all' | 'pending' | 'full';
const filter = ref<Filter>('all');
const search = ref('');

function isFull(a: JooxAccount): boolean {
  return a.votes.length >= JOOX_VOTES_PER_ACCOUNT;
}

const searchKey = computed(() => jooxNameKey(search.value));
const matched = computed(() =>
  accounts.value.filter((a) =>
    [a.accountName, a.accountUser, a.note ?? ''].some((text) =>
      jooxNameKey(text).includes(searchKey.value),
    ),
  ),
);

const filters = computed<Array<{ key: Filter; label: string; count: number }>>(() => {
  const full = matched.value.filter(isFull).length;
  return [
    { key: 'all', label: 'ทั้งหมด', count: matched.value.length },
    { key: 'pending', label: 'ยังไม่ครบ', count: matched.value.length - full },
    { key: 'full', label: 'ครบแล้ว', count: full },
  ];
});

const shown = computed(() =>
  matched.value.filter((a) =>
    filter.value === 'all' ? true : filter.value === 'full' ? isFull(a) : !isFull(a),
  ),
);

const fullCount = computed(() => accounts.value.filter(isFull).length);
const votesToday = computed(() => accounts.value.reduce((sum, a) => sum + a.votes.length, 0));

const emptyMessage = computed(() => {
  if (searchKey.value) return `ไม่พบบัญชีที่ตรงกับ “${search.value.trim()}”`;
  return filter.value === 'full' ? 'ยังไม่มีบัญชีที่โหวตครบ' : 'ทุกบัญชีโหวตครบแล้ว 🎉';
});

// ── Add / edit ────────────────────────────────────────────────────────────────
const editing = ref<{ id: number | null } | null>(null);
const form = ref({ accountName: '', accountUser: '', note: '' });
const formError = ref<string | null>(null);
const saving = ref(false);

function openForm(account?: JooxAccount): void {
  form.value = {
    accountName: account?.accountName ?? '',
    accountUser: account?.accountUser ?? '',
    note: account?.note ?? '',
  };
  formError.value = null;
  editing.value = { id: account?.id ?? null };
}

async function submitForm(): Promise<void> {
  if (!editing.value) return;
  const input = {
    accountName: form.value.accountName.trim(),
    accountUser: form.value.accountUser.trim(),
    note: form.value.note.trim(),
  };
  if (!input.accountName) {
    formError.value = 'กรุณากรอกชื่อบัญชี';
    return;
  }
  if (!input.accountUser) {
    formError.value = 'กรุณากรอกอีเมลหรือเบอร์โทร';
    return;
  }
  if (!isJooxAccountUser(input.accountUser)) {
    formError.value = 'กรุณากรอกอีเมลหรือเบอร์โทรให้ถูกต้อง';
    return;
  }

  const { id } = editing.value;
  saving.value = true;
  try {
    const row = id === null ? await addJooxAccount(input) : await updateJooxAccount(id, input);
    put(row);
    editing.value = null;
    flash(id === null ? `เพิ่มบัญชี ${row.accountName} แล้ว` : 'บันทึกแล้ว');
    // A new account has no votes yet; don't let it vanish behind the "full" filter or a search.
    if (id === null) {
      if (filter.value === 'full') filter.value = 'all';
      search.value = '';
    }
  } catch (err) {
    if (checkAuth(err)) return;
    if (statusOf(err) === 404 && id !== null) {
      drop(id);
      editing.value = null;
    }
    formError.value = messageOf(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deleting = ref<JooxAccount | null>(null);
const removing = ref(false);

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return;
  const { id, accountName } = deleting.value;
  removing.value = true;
  try {
    await deleteJooxAccount(id);
    drop(id);
    flash(`ลบบัญชี ${accountName} แล้ว`);
  } catch (err) {
    if (checkAuth(err)) return;
    // Already gone is what was asked for.
    if (statusOf(err) === 404) drop(id);
    else flash(messageOf(err, 'ลบไม่สำเร็จ กรุณาลองใหม่'));
  } finally {
    removing.value = false;
    deleting.value = null;
  }
}

// ── Picking today's votes ─────────────────────────────────────────────────────
const picking = ref<JooxAccount | null>(null);
const picked = ref<number[]>([]);
const pickSearch = ref('');
const pickSaving = ref(false);
const pickError = ref<string | null>(null);

function openPicker(account: JooxAccount): void {
  picking.value = account;
  picked.value = account.votes.map((v) => v.voteAccountId);
  pickSearch.value = '';
  pickError.value = null;
  // What is on screen may be a while old; the dialog opens on it and updates when this lands.
  listJooxVotes()
    .then((list) => (targets.value = list))
    .catch(checkAuth);
}

interface PickOption {
  id: number;
  accountName: string;
  /** Deleted from the checklist since this account voted for it. Can be taken back, not added. */
  removed: boolean;
  /** Most likely the account itself, going by name — which the rules say not to vote for. */
  self: boolean;
  /** How many of this voter's *other* accounts voted for it today. */
  byOthers: number;
}

const pickOptions = computed<PickOption[]>(() => {
  const account = picking.value;
  if (!account) return [];
  const selfKey = jooxNameKey(account.accountName);
  const byOthers = new Map<number, number>();
  for (const a of accounts.value) {
    if (a.id === account.id) continue;
    for (const v of a.votes) byOthers.set(v.voteAccountId, (byOthers.get(v.voteAccountId) ?? 0) + 1);
  }

  const live = new Set(targets.value.map((t) => t.id));
  const removed = account.votes
    .filter((v) => v.removed || !live.has(v.voteAccountId))
    .map((v) => ({ id: v.voteAccountId, accountName: v.accountName, removed: true }));
  const options = [
    ...removed,
    ...[...targets.value].sort((a, b) => a.id - b.id).map((t) => ({ ...t, removed: false })),
  ];

  const key = jooxNameKey(pickSearch.value);
  return options
    .filter((o) => jooxNameKey(o.accountName).includes(key))
    .map((o) => ({
      id: o.id,
      accountName: o.accountName,
      removed: o.removed,
      self: jooxNameKey(o.accountName) === selfKey,
      byOthers: byOthers.get(o.id) ?? 0,
    }));
});

const pickFull = computed(() => picked.value.length >= JOOX_VOTES_PER_ACCOUNT);

function isPicked(id: number): boolean {
  return picked.value.includes(id);
}

function canToggle(o: PickOption): boolean {
  if (isPicked(o.id)) return true;
  return !o.removed && !o.self && !pickFull.value;
}

function toggle(o: PickOption): void {
  if (!canToggle(o)) return;
  picked.value = isPicked(o.id) ? picked.value.filter((id) => id !== o.id) : [...picked.value, o.id];
}

const pickChanged = computed(() => {
  const before = picking.value?.votes.map((v) => v.voteAccountId) ?? [];
  return before.length !== picked.value.length || picked.value.some((id) => !before.includes(id));
});

async function savePicks(): Promise<void> {
  const account = picking.value;
  if (!account) return;
  pickSaving.value = true;
  pickError.value = null;
  try {
    const row = await setJooxAccountVotes(account.id, picked.value);
    put(row);
    picking.value = null;
    flash(`บันทึกแล้ว · ${row.accountName} โหวต ${row.votes.length}/${JOOX_VOTES_PER_ACCOUNT}`);
  } catch (err) {
    if (checkAuth(err)) return;
    if (statusOf(err) === 404) {
      drop(account.id);
      picking.value = null;
      flash(messageOf(err, 'ไม่พบบัญชีนี้ อาจถูกลบไปแล้ว'));
      return;
    }
    pickError.value = messageOf(err, 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    // Most likely an account picked has just left the checklist: show the list as it now is.
    listJooxVotes()
      .then((list) => (targets.value = list))
      .catch(() => undefined);
  } finally {
    pickSaving.value = false;
  }
}
</script>

<template>
  <div class="container-site py-6 sm:py-12 max-w-2xl">
    <header class="text-center mb-5 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-extrabold mb-1">บัญชี JOOX ของฉัน</h1>
      <p class="text-sm sm:text-base text-gray-500">
        1 บัญชีโหวตได้ {{ JOOX_VOTES_PER_ACCOUNT }} ครั้ง · รีเซ็ตทุกวัน 23:00 น. · อีก {{ resetIn }}
      </p>
      <p v-if="auth.voterLabel" class="text-xs text-gray-400 mt-2">
        เข้าสู่ระบบเป็น <b class="text-gray-500">{{ auth.voterLabel }}</b>
        ·
        <RouterLink :to="{ name: 'joox-vote' }" class="underline underline-offset-2">
          ไปหน้าโหวต
        </RouterLink>
        ·
        <button
          type="button"
          class="underline underline-offset-2 disabled:opacity-50"
          :disabled="signingOut"
          @click="signOut"
        >
          {{ signingOut ? 'กำลังออก…' : 'ออกจากระบบ' }}
        </button>
      </p>
    </header>

    <p v-if="loading" class="text-center text-gray-400 py-10 animate-pulse">กำลังโหลดรายการ…</p>

    <div v-else-if="loadError" class="card text-center" role="alert">
      <p class="text-red-600 mb-4">{{ loadError }}</p>
      <button type="button" class="tap btn-ghost" @click="refresh">ลองใหม่</button>
    </div>

    <template v-else-if="accounts.length > 0">
      <p class="text-sm text-gray-600 mb-3" role="status" aria-live="polite">
        โหวตครบแล้ว <b>{{ fullCount }}</b> / {{ accounts.length }} บัญชี · วันนี้โหวตไป
        <b>{{ votesToday }}</b> ครั้ง
      </p>

      <div class="relative mb-2">
        <label for="joox-acc-search" class="sr-only">ค้นหาบัญชี</label>
        <input
          id="joox-acc-search"
          v-model="search"
          type="search"
          autocomplete="off"
          autocapitalize="off"
          enterkeyhint="search"
          placeholder="ค้นหาชื่อบัญชี อีเมล เบอร์โทร หรือโน้ต"
          class="input pr-12"
        />
        <button
          v-if="search"
          type="button"
          class="tap absolute inset-y-0 right-0 w-12 text-gray-400 text-xl"
          aria-label="ล้างคำค้นหา"
          @click="search = ''"
        >
          ×
        </button>
      </div>

      <div
        class="grid grid-cols-3 gap-1 p-1 mb-3 rounded-xl bg-gray-100"
        role="group"
        aria-label="กรองรายการ"
      >
        <button
          v-for="f in filters"
          :key="f.key"
          type="button"
          class="tap rounded-lg text-sm font-semibold px-2"
          :class="filter === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'"
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }} <span class="tabular-nums">({{ f.count }})</span>
        </button>
      </div>

      <p v-if="shown.length === 0" class="card text-center text-gray-500 break-words">
        {{ emptyMessage }}
      </p>

      <ul v-else class="space-y-3" role="list">
        <li
          v-for="a in shown"
          :key="a.id"
          class="card"
          :class="{ 'bg-green-50 border-green-200': isFull(a) }"
        >
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="min-w-0">
              <p class="font-bold text-lg leading-tight break-words">
                {{ a.accountName }}
                <span v-if="isFull(a)" class="text-green-700 text-sm font-semibold whitespace-nowrap">
                  ✓ ครบแล้ว
                </span>
              </p>
              <p class="text-sm text-gray-500 break-all">{{ a.accountUser }}</p>
            </div>
            <div class="shrink-0 text-right leading-none">
              <span class="text-3xl font-extrabold tabular-nums">{{ a.votes.length }}</span
              ><span class="text-base font-bold text-gray-400 tabular-nums"
                >/{{ JOOX_VOTES_PER_ACCOUNT }}</span
              >
              <span class="block text-xs text-gray-500 mt-1">
                {{
                  isFull(a) ? 'โหวตวันนี้' : `เหลืออีก ${JOOX_VOTES_PER_ACCOUNT - a.votes.length} ครั้ง`
                }}
              </span>
            </div>
          </div>

          <p
            v-if="a.note"
            class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 mb-3 whitespace-pre-line break-words"
          >
            {{ a.note }}
          </p>

          <div class="mb-3">
            <p class="text-xs font-medium text-gray-500 mb-1.5">โหวตให้แล้ววันนี้</p>
            <ul v-if="a.votes.length" class="flex flex-wrap gap-1.5" role="list">
              <li
                v-for="v in a.votes"
                :key="v.voteAccountId"
                class="chip"
                :class="v.removed ? 'chip-removed' : 'chip-voted'"
                :title="v.removed ? 'บัญชีนี้ถูกลบออกจากรายการโหวตแล้ว' : undefined"
              >
                {{ v.accountName }}<span v-if="v.removed"> (ลบแล้ว)</span>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-400">ยังไม่ได้โหวต</p>
          </div>

          <button
            type="button"
            class="tap btn-pick"
            :class="isFull(a) ? 'btn-pick-done' : 'btn-primary'"
            @click="openPicker(a)"
          >
            เลือกบัญชีที่โหวตแล้ว
          </button>

          <div class="grid grid-cols-2 gap-2 mt-2">
            <button type="button" class="tap btn-ghost" @click="openForm(a)">แก้ไข</button>
            <button type="button" class="tap btn-delete" @click="deleting = a">ลบ</button>
          </div>
        </li>
      </ul>

      <button
        type="button"
        class="tap w-full mt-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-600
               font-semibold py-4 hover:bg-gray-50"
        @click="openForm()"
      >
        + เพิ่มบัญชี
      </button>
    </template>

    <div v-else class="card text-center">
      <div class="text-5xl mb-2" aria-hidden="true">🎧</div>
      <p class="text-gray-500 mb-4">ยังไม่มีบัญชี JOOX เพิ่มบัญชีแรกได้เลย</p>
      <button type="button" class="tap btn-primary w-full" @click="openForm()">+ เพิ่มบัญชี</button>
    </div>

    <p class="text-xs text-gray-400 text-center mt-10">
      รายการนี้เห็นเฉพาะคุณ · การเลือกที่นี่ไม่เปลี่ยนยอดในหน้าโหวต
    </p>

    <Transition name="toast">
      <p
        v-if="notice"
        class="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-gray-900 text-white
               text-sm px-4 py-3 shadow-lg text-center"
        role="status"
      >
        {{ notice }}
      </p>
    </Transition>

    <!-- Add / edit -->
    <AppModal
      :open="editing !== null"
      :busy="saving"
      :title="editing?.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี JOOX'"
      @close="editing = null"
    >
      <form novalidate @submit.prevent="submitForm">
        <div class="space-y-3">
          <div>
            <label for="joox-acc-name" class="block text-sm font-medium mb-1">ชื่อบัญชี</label>
            <input
              id="joox-acc-name"
              v-model="form.accountName"
              type="text"
              maxlength="100"
              autocomplete="off"
              autocapitalize="off"
              enterkeyhint="next"
              placeholder="เช่น บัญชีหลัก"
              class="input"
            />
          </div>
          <div>
            <label for="joox-acc-user" class="block text-sm font-medium mb-1">
              อีเมล หรือ เบอร์โทร
            </label>
            <input
              id="joox-acc-user"
              v-model="form.accountUser"
              type="text"
              inputmode="email"
              maxlength="100"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="next"
              placeholder="name@example.com หรือ 0812345678"
              class="input"
            />
          </div>
          <div>
            <label for="joox-acc-note" class="block text-sm font-medium mb-1">
              โน้ต <span class="text-gray-400 font-normal">(ไม่บังคับ)</span>
            </label>
            <textarea
              id="joox-acc-note"
              v-model="form.note"
              rows="3"
              maxlength="1000"
              placeholder="เช่น login ด้วย Facebook"
              class="input resize-y"
            />
          </div>
        </div>
        <p v-if="formError" class="text-sm text-red-600 mt-3" role="alert">{{ formError }}</p>
        <div class="flex gap-2 mt-5">
          <button
            type="button"
            class="tap btn-ghost flex-1"
            :disabled="saving"
            @click="editing = null"
          >
            ยกเลิก
          </button>
          <button type="submit" class="tap btn-primary flex-1" :disabled="saving">
            {{ saving ? 'กำลังบันทึก…' : editing?.id ? 'บันทึก' : 'เพิ่มบัญชี' }}
          </button>
        </div>
      </form>
    </AppModal>

    <!-- Delete -->
    <AppModal
      :open="deleting !== null"
      :busy="removing"
      title="ยืนยันการลบบัญชี"
      @close="deleting = null"
    >
      <p class="text-gray-700">
        ต้องการลบบัญชี <b>{{ deleting?.accountName }}</b> ใช่หรือไม่?
        การโหวตที่บันทึกไว้ของบัญชีนี้จะหายไปด้วย
      </p>
      <div class="flex gap-2 mt-5">
        <button
          type="button"
          class="tap btn-ghost flex-1"
          :disabled="removing"
          @click="deleting = null"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          class="tap btn-delete-solid flex-1"
          :disabled="removing"
          @click="confirmDelete"
        >
          {{ removing ? 'กำลังลบ…' : 'ลบ' }}
        </button>
      </div>
    </AppModal>

    <!-- Pick today's votes -->
    <AppModal
      :open="picking !== null"
      :busy="pickSaving"
      :title="picking ? `${picking.accountName} โหวตให้ใครแล้ว?` : ''"
      @close="picking = null"
    >
      <p class="text-sm text-gray-600 mb-3" role="status" aria-live="polite">
        เลือกแล้ว
        <b class="tabular-nums" :class="{ 'text-green-700': pickFull }">
          {{ picked.length }}/{{ JOOX_VOTES_PER_ACCOUNT }}
        </b>
        <span v-if="pickFull"> · ครบแล้ว เอาออกก่อนถ้าจะเลือกบัญชีอื่น</span>
      </p>

      <div class="relative mb-3">
        <label for="joox-pick-search" class="sr-only">ค้นหาบัญชีในรายการโหวต</label>
        <input
          id="joox-pick-search"
          v-model="pickSearch"
          type="search"
          autocomplete="off"
          autocapitalize="off"
          enterkeyhint="search"
          placeholder="ค้นหาบัญชีในรายการโหวต"
          class="input"
        />
      </div>

      <p v-if="targets.length === 0 && pickOptions.length === 0" class="text-center text-gray-500 py-6">
        ยังไม่มีบัญชีในหน้าโหวต
      </p>
      <p v-else-if="pickOptions.length === 0" class="text-center text-gray-500 py-6 break-words">
        ไม่พบบัญชีที่ตรงกับ “{{ pickSearch.trim() }}”
      </p>

      <ul v-else class="pick-list" role="list">
        <li v-for="o in pickOptions" :key="o.id">
          <label
            class="pick-row"
            :class="{
              'pick-row-on': isPicked(o.id),
              'opacity-50 cursor-not-allowed': !canToggle(o),
            }"
          >
            <input
              type="checkbox"
              class="h-5 w-5 shrink-0 accent-green-600"
              :checked="isPicked(o.id)"
              :disabled="!canToggle(o) || pickSaving"
              @change="toggle(o)"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold break-words">{{ o.accountName }}</span>
              <span v-if="o.removed" class="block text-xs text-red-600">ถูกลบออกจากรายการโหวตแล้ว</span>
              <span v-else-if="o.self" class="block text-xs text-amber-700">
                น่าจะเป็นบัญชีนี้เอง — ห้ามโหวตให้ตัวเอง
              </span>
              <span v-else-if="o.byOthers" class="block text-xs text-gray-500">
                บัญชีอื่นของคุณโหวตให้แล้ว {{ o.byOthers }} บัญชี
              </span>
            </span>
          </label>
        </li>
      </ul>

      <p v-if="pickError" class="text-sm text-red-600 mt-3" role="alert">{{ pickError }}</p>

      <div class="flex gap-2 mt-4">
        <button
          type="button"
          class="tap btn-ghost flex-1"
          :disabled="pickSaving"
          @click="picking = null"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          class="tap btn-done flex-1"
          :disabled="pickSaving || !pickChanged"
          @click="savePicks"
        >
          {{ pickSaving ? 'กำลังบันทึก…' : 'บันทึก' }}
        </button>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm; }
/* 16px text: anything smaller and iOS zooms the page in when the field takes focus. */
.input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-3 text-base
    focus:outline-none focus:ring-2 focus:ring-blue-500;
}
.input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }

/* Same thumb rules as the checklist; see JooxVoteView. */
.tap {
  min-height: 48px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  @apply transition active:scale-[0.98];
}

/* The checklist's yellow, with the near-black text it needs to stay readable. */
.btn-primary {
  background: #ffde59;
  @apply text-gray-900 font-bold rounded-xl disabled:opacity-50;
}
.btn-pick {
  @apply flex w-full items-center justify-center rounded-xl py-3 text-base font-bold;
}
.btn-pick-done {
  @apply border-2 border-green-600 bg-white text-green-700;
}
.btn-ghost {
  @apply border border-gray-300 font-medium px-5 py-3 rounded-lg hover:bg-gray-50 disabled:opacity-50;
}
.btn-done {
  @apply bg-green-600 text-white font-semibold px-4 py-3 rounded-lg hover:bg-green-700
    disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100;
}
.btn-delete {
  @apply border border-red-300 text-red-600 font-semibold px-4 py-3 rounded-lg hover:bg-red-50;
}
.btn-delete-solid {
  @apply bg-red-600 text-white font-semibold px-5 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50;
}

.chip { @apply inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold break-all; }
.chip-voted { @apply bg-green-100 text-green-800; }
.chip-removed { @apply bg-gray-100 text-gray-500 line-through; }

/* Tall enough to pick from without the dialog outgrowing a phone screen. */
.pick-list { @apply space-y-1.5 overflow-y-auto -mx-1 px-1; max-height: min(50vh, 420px); }
.pick-row {
  @apply flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 cursor-pointer;
  min-height: 48px;
}
.pick-row-on { @apply border-green-500 bg-green-50; }

.toast-enter-active,
.toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active { transition: none; }
}
</style>
