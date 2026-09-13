<script setup lang="ts">
/**
 * JOOX voting checklist — one shared list, kept on the server, that everyone on the page sees
 * and edits. See {@link useJooxVotes} for how it stays fresh, and the API module for the
 * 23:00 Thai-time reset.
 *
 * Everyone here signed in with a login an admin handed out — the router's guard turns away a
 * phone with no token, and the API refuses one whose token has gone stale. A session that
 * lapses mid-visit (expired, or revoked because an admin reset the password) surfaces as
 * `authLost` and sends the phone back to the login page with this route to return to.
 *
 * Laid out for a phone held in one hand, since that is where the voting happens: the list
 * comes first, oldest account on top, and each account's vote link is the one big button on
 * its card. A search on the account name and a filter (still to vote / finished) narrow it.
 * The add form folds away once there is a list, to keep it from pushing the links down the
 * screen.
 *
 * An account is done by itself on its third vote-link tap, or by hand with "ครบแล้ว". Once
 * done, that button turns into "ยังขาด…", for when some taps never became votes: saying how
 * many are missing puts the account back on the "still to vote" list until taps make them up.
 *
 * All three — done, missing, delete — go through a dialog: the buttons sit side by side on a
 * small screen, and on a shared list a slip costs everybody.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppModal from '@/components/AppModal.vue';
import { applySeo } from '@/composables/useSeo';
import { useJooxVotes } from '@/composables/useJooxVotes';
import { useJooxAuthStore } from '@/stores/jooxAuth';
import type { JooxVoteAccount } from '@/api/jooxVotes';
import { JOOX_VOTE_TARGET, jooxNameKey, stripBeforeJooxLink } from '@cms/shared';

applySeo({ title: 'โหวต JOOX' });

const {
  accounts,
  loading,
  loadError,
  authLost,
  msUntilReset,
  refresh,
  add,
  countClick,
  markDone,
  reportMissing,
  remove,
} = useJooxVotes();

// ── Who is signed in ──────────────────────────────────────────────────────────
const auth = useJooxAuthStore();
const route = useRoute();
const router = useRouter();

/** The session can be refused by two routes at once; the page is only sent away once. */
let leaving = false;

async function toLogin(): Promise<void> {
  if (leaving) return;
  leaving = true;
  auth.clear();
  await router.replace({ name: 'joox-login', query: { redirect: route.fullPath } });
}

// Confirms the stored token and fetches the name to show. A token the API no longer accepts
// sends the phone back to the login page — the router's guard only saw that one existed.
void auth.restore().then((valid) => {
  if (!valid) void toLogin();
});
watch(authLost, (lost) => {
  if (lost) void toLogin();
});

const signingOut = ref(false);

async function signOut(): Promise<void> {
  signingOut.value = true;
  await auth.logout();
  leaving = true;
  await router.replace({ name: 'joox-login' });
}

// ── A failed tap or confirm, shown for a few seconds above the list ───────────
const notice = ref<string | null>(null);
let noticeTimer: number | undefined;

function flash(message: string | null): void {
  if (!message) return;
  notice.value = message;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), 5000);
}
onBeforeUnmount(() => window.clearTimeout(noticeTimer));

// ── Add form ──────────────────────────────────────────────────────────────────
const accountName = ref('');
const link = ref('');
const formError = ref<string | null>(null);
const adding = ref(false);

// Links usually arrive pasted along with share text; keep just the URL, as soon as it's in.
watch(link, (value) => {
  const stripped = stripBeforeJooxLink(value);
  if (stripped !== value) link.value = stripped;
});

// With nothing on the list the form is the whole page; after that it opens on request, and
// stays open between adds for someone entering several accounts in a row.
const formRequested = ref(false);
const formOpen = computed(
  () =>
    (!loading.value && !loadError.value && accounts.value.length === 0) || formRequested.value,
);

function closeForm(): void {
  formRequested.value = false;
  formError.value = null;
}

/** Link format and duplicates are the server's call; it answers in Thai, naming the clash. */
async function submit(): Promise<void> {
  const name = accountName.value.trim();
  const url = link.value.trim();
  if (!name) {
    formError.value = 'กรุณากรอกชื่อบัญชี';
    return;
  }
  if (!url) {
    formError.value = 'กรุณากรอกลิงก์โหวต';
    return;
  }
  adding.value = true;
  formError.value = await add(name, url);
  adding.value = false;
  if (!formError.value) {
    accountName.value = '';
    link.value = '';
    // A new account is never done yet; don't let it vanish behind the "done" filter or a search.
    if (filter.value === 'done') filter.value = 'all';
    if (!jooxNameKey(name).includes(searchKey.value)) search.value = '';
  }
}

// ── The list ──────────────────────────────────────────────────────────────────
type Filter = 'all' | 'pending' | 'done';
// Opens on what still needs a vote — that's what people come to the page for.
const filter = ref<Filter>('pending');
const search = ref('');

const doneCount = computed(() => accounts.value.filter((a) => a.isDone).length);

/** Matched the way duplicate names are judged, so case and extra spaces don't matter. */
const searchKey = computed(() => jooxNameKey(search.value));
const matched = computed(() =>
  accounts.value.filter((a) => jooxNameKey(a.accountName).includes(searchKey.value)),
);

/** The counts follow the search, so each button says what tapping it would show. */
const filters = computed<Array<{ key: Filter; label: string; count: number }>>(() => {
  const done = matched.value.filter((a) => a.isDone).length;
  return [
    { key: 'all', label: 'ทั้งหมด', count: matched.value.length },
    { key: 'pending', label: 'ยังไม่ครบ', count: matched.value.length - done },
    { key: 'done', label: 'ครบแล้ว', count: done },
  ];
});

/** Oldest first. Ids count up as accounts are added, so the lowest id is the earliest. */
const shown = computed(() =>
  matched.value
    .filter((a) =>
      filter.value === 'all' ? true : filter.value === 'done' ? a.isDone : !a.isDone,
    )
    .sort((a, b) => a.id - b.id),
);

const emptyMessage = computed(() => {
  if (searchKey.value) return `ไม่พบบัญชีที่ตรงกับ “${search.value.trim()}”`;
  return filter.value === 'done' ? 'ยังไม่มีบัญชีที่โหวตครบ' : 'โหวตครบทุกบัญชีแล้ว 🎉';
});

const resetIn = computed(() => {
  const minutes = Math.max(0, Math.ceil(msUntilReset.value / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
});

async function onVoteClick(id: number): Promise<void> {
  flash(await countClick(id));
}

/** A middle click opens the link in a new tab too, so it counts as a vote. */
function onAuxClick(e: MouseEvent, id: number): void {
  if (e.button === 1) void onVoteClick(id);
}

/** Taps still to go before the account is done by itself. */
function shortBy(a: JooxVoteAccount): number {
  return Math.max(0, JOOX_VOTE_TARGET - a.clicks);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── Dialog, shared by "done", "missing" and "delete" ──────────────────────────
type Pending = { kind: 'done' | 'missing' | 'delete'; account: JooxVoteAccount };
const pending = ref<Pending | null>(null);
const confirming = ref(false);

const dialogTitles: Record<Pending['kind'], string> = {
  done: 'ยืนยันว่าโหวตครบแล้ว',
  missing: 'ยังขาดอีกกี่ครั้ง?',
  delete: 'ยืนยันการลบบัญชี',
};

function ask(kind: Pending['kind'], account: JooxVoteAccount): void {
  pending.value = { kind, account };
}

/** `missing` is the number picked in the "missing" dialog; the other two ignore it. */
async function confirm(missing = 0): Promise<void> {
  if (!pending.value) return;
  const { kind, account } = pending.value;
  confirming.value = true;
  const error =
    kind === 'done'
      ? await markDone(account.id)
      : kind === 'missing'
        ? await reportMissing(account.id, missing)
        : await remove(account.id);
  confirming.value = false;
  pending.value = null;
  // The card leaves the "done" list it was just on; say where it went.
  flash(
    error ??
      (kind === 'missing'
        ? `${account.accountName} กลับไปที่ “ยังไม่ครบ” แล้ว · ขาดอีก ${missing} ครั้ง`
        : null),
  );
}
</script>

<template>
  <div class="container-site py-6 sm:py-12 max-w-2xl">
    <header class="text-center mb-5 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-extrabold mb-1">โหวต JOOX</h1>
      <p class="text-sm sm:text-base text-gray-500">
        รีเซ็ตทุกวัน 23:00 น. (เวลาไทย) · อีก {{ resetIn }}
      </p>
      <!-- Who this phone is signed in as, and the way out. Quiet: the list is why we're here. -->
      <p v-if="auth.voterLabel" class="text-xs text-gray-400 mt-2">
        เข้าสู่ระบบเป็น <b class="text-gray-500">{{ auth.voterLabel }}</b>
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

    <!-- The house rules, above the list so they are read before the first tap. -->
    <section class="note mb-4 sm:mb-6" aria-labelledby="joox-note-title">
      <h2 id="joox-note-title" class="font-bold mb-2">📌 กติกาการโหวต</h2>
      <ol class="list-decimal pl-5 space-y-1.5">
        <li>บัญชี JOOX 1 บัญชี กดโหวต <b>6 ลิงก์</b></li>
        <li><b>อย่ากดลิงก์ของบัญชี JOOX ที่ตัวเอง login อยู่</b></li>
        <li>
          ถ้าบัญชีไหนขึ้น “ครบแล้ว” แต่จริง ๆ ยังไม่ครบ ให้ไปที่แท็บ “ครบแล้ว”
          กดปุ่ม <b>“ยังขาด…”</b> ของบัญชีนั้น แล้วเลือกจำนวนที่ยังขาด
          บัญชีจะกลับไปอยู่ใน “ยังไม่ครบ” ให้ช่วยกันกดต่อจนครบ {{ JOOX_VOTE_TARGET }}&nbsp;ครั้ง
        </li>
      </ol>
    </section>

    <p v-if="loading" class="text-center text-gray-400 py-10 animate-pulse">กำลังโหลดรายการ…</p>

    <div v-else-if="loadError" class="card text-center" role="alert">
      <p class="text-red-600 mb-4">{{ loadError }}</p>
      <button type="button" class="tap btn-ghost" @click="refresh">ลองใหม่</button>
    </div>

    <!-- The list -->
    <template v-else-if="accounts.length > 0">
      <p class="text-sm text-gray-600 mb-3" role="status" aria-live="polite">
        ครบแล้ว <b>{{ doneCount }}</b> / {{ accounts.length }} บัญชี
      </p>

      <div class="relative mb-2">
        <label for="joox-search" class="sr-only">ค้นหาบัญชี</label>
        <input
          id="joox-search"
          v-model="search"
          type="search"
          autocomplete="off"
          autocapitalize="off"
          enterkeyhint="search"
          placeholder="ค้นหาชื่อบัญชี"
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
          :class="{ 'bg-green-50 border-green-200': a.isDone }"
        >
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="min-w-0">
              <p class="font-bold text-lg leading-tight break-words">
                {{ a.accountName }}
                <span v-if="a.isDone" class="text-green-700 text-sm font-semibold whitespace-nowrap">
                  ✓ ครบแล้ว
                </span>
              </p>
              <p class="text-xs text-gray-400 truncate" :title="a.link">{{ hostOf(a.link) }}</p>
            </div>
            <div class="shrink-0 text-right leading-none">
              <span class="text-3xl font-extrabold tabular-nums">{{ a.clicks }}</span
              ><span class="text-base font-bold text-gray-400 tabular-nums">/{{ JOOX_VOTE_TARGET }}</span>
              <span class="block text-xs text-gray-500 mt-1">
                {{ !a.isDone && shortBy(a) > 0 ? `ขาดอีก ${shortBy(a)} ครั้ง` : 'ครั้งวันนี้' }}
              </span>
            </div>
          </div>

          <!-- The button the page exists for: full width and tall enough for a thumb. -->
          <a
            :href="a.link"
            target="_blank"
            rel="noopener noreferrer"
            class="tap btn-vote"
            :class="a.isDone ? 'btn-vote-done' : 'btn-primary'"
            @click="onVoteClick(a.id)"
            @auxclick="onAuxClick($event, a.id)"
          >
            เปิดลิงก์โหวต ↗
          </a>

          <div class="grid grid-cols-2 gap-2 mt-2">
            <button v-if="a.isDone" type="button" class="tap btn-missing" @click="ask('missing', a)">
              ยังขาด…
            </button>
            <button v-else type="button" class="tap btn-done" @click="ask('done', a)">ครบแล้ว</button>
            <button type="button" class="tap btn-delete" @click="ask('delete', a)">ลบ</button>
          </div>
        </li>
      </ul>

      <button
        v-if="!formOpen"
        type="button"
        class="tap w-full mt-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-600
               font-semibold py-4 hover:bg-gray-50"
        @click="formRequested = true"
      >
        + เพิ่มบัญชี
      </button>
    </template>

    <div v-else class="text-center text-gray-500 mb-4">
      <div class="text-5xl mb-2" aria-hidden="true">🎧</div>
      ยังไม่มีบัญชี เพิ่มบัญชีแรกได้เลย
    </div>

    <!-- Add an account -->
    <form
      v-if="formOpen"
      class="card"
      :class="{ 'mt-4': accounts.length > 0 }"
      novalidate
      @submit.prevent="submit"
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-bold">เพิ่มบัญชี</h2>
        <button
          v-if="accounts.length > 0"
          type="button"
          class="tap text-sm text-gray-500 px-2 py-1 -mr-2"
          @click="closeForm"
        >
          ปิด
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label for="joox-account" class="block text-sm font-medium mb-1">ชื่อบัญชี</label>
          <input
            id="joox-account"
            v-model="accountName"
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
          <label for="joox-link" class="block text-sm font-medium mb-1">ลิงก์โหวต</label>
          <input
            id="joox-link"
            v-model="link"
            type="url"
            inputmode="url"
            maxlength="500"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="done"
            placeholder="https://..."
            class="input"
          />
        </div>
      </div>
      <p v-if="formError" class="text-sm text-red-600 mt-3" role="alert">{{ formError }}</p>
      <button type="submit" class="tap btn-primary w-full mt-4" :disabled="adding">
        {{ adding ? 'กำลังเพิ่ม…' : 'เพิ่มบัญชี' }}
      </button>
    </form>

    <p class="text-xs text-gray-400 text-center mt-10">
      รายการนี้ใช้ร่วมกัน ทุกคนที่เข้าสู่ระบบเห็นและแก้ไขรายการเดียวกัน
    </p>

    <!-- A failed tap or confirm. Pinned to the bottom of the screen: the card that failed may
         be anywhere down a long list, and the top of the page is out of sight. -->
    <Transition name="toast">
      <p
        v-if="notice"
        class="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-xl bg-gray-900 text-white
               text-sm px-4 py-3 shadow-lg text-center"
        role="alert"
      >
        {{ notice }}
      </p>
    </Transition>

    <AppModal
      :open="pending !== null"
      :busy="confirming"
      :title="pending ? dialogTitles[pending.kind] : ''"
      @close="pending = null"
    >
      <template v-if="pending?.kind === 'missing'">
        <p class="text-gray-700">
          บัญชี <b>{{ pending.account.accountName }}</b> ยังโหวตไม่ครบอีกกี่ครั้ง?
          สถานะจะกลับเป็น “ยังไม่ครบ” จนกว่าจะกดโหวตครบ {{ JOOX_VOTE_TARGET }} ครั้ง
        </p>

        <div class="grid grid-cols-3 gap-2 mt-5" role="group" aria-label="จำนวนที่ยังขาด">
          <button
            v-for="n in JOOX_VOTE_TARGET"
            :key="n"
            type="button"
            class="tap btn-missing-pick"
            :disabled="confirming"
            @click="confirm(n)"
          >
            <span class="block text-2xl font-extrabold tabular-nums">{{ n }}</span>
            <span class="block text-xs font-medium">ครั้ง</span>
          </button>
        </div>
        <button
          type="button"
          class="tap btn-ghost w-full mt-2"
          :disabled="confirming"
          @click="pending = null"
        >
          {{ confirming ? 'กำลังบันทึก…' : 'ยกเลิก' }}
        </button>
      </template>

      <template v-else-if="pending">
        <p v-if="pending.kind === 'delete'" class="text-gray-700">
          ต้องการลบบัญชี <b>{{ pending.account.accountName }}</b> ใช่หรือไม่?
          บัญชีจะหายจากรายการของทุกคน
        </p>
        <p v-else class="text-gray-700">
          ยืนยันว่าบัญชี <b>{{ pending.account.accountName }}</b> โหวตครบแล้วสำหรับวันนี้?
          สถานะจะรีเซ็ตเวลา 23:00 น.
        </p>

        <div class="flex gap-2 mt-5">
          <button
            type="button"
            class="tap btn-ghost flex-1"
            :disabled="confirming"
            @click="pending = null"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            class="tap flex-1"
            :class="pending.kind === 'delete' ? 'btn-delete-solid' : 'btn-done'"
            :disabled="confirming"
            @click="confirm()"
          >
            {{ confirming ? 'กำลังบันทึก…' : pending.kind === 'delete' ? 'ลบ' : 'ยืนยัน' }}
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm; }
.note { @apply rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 text-sm sm:text-base text-amber-900; }
/* 16px text: anything smaller and iOS zooms the page in when the field takes focus. */
.input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-3 text-base
    focus:outline-none focus:ring-2 focus:ring-blue-500;
}
/* The search box has its own thumb-sized clear button; drop the small one Chrome/Safari add. */
.input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }

/*
 * Everything a thumb presses. At least 48px tall; `manipulation` stops a quick second tap —
 * common when voting account after account — from being read as double-tap-to-zoom; and the
 * grey flash iOS paints over a tapped link gives way to a press that shrinks the button.
 */
.tap {
  min-height: 48px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  @apply transition active:scale-[0.98];
}

/*
 * This page's own call-to-action colour, in place of the site's blue. Scoped, so it repaints
 * the buttons here and nothing else on the site.
 *
 * The text colour has to come with it: `.btn-primary` is white-on-primary, and white on a
 * yellow this light reads at about 1.3:1 — invisible. Near-black lands around 10:1, which is
 * what makes the swap safe on the one button the whole page exists for.
 */
.btn-primary {
  background: #ffde59;
  @apply text-gray-900;
}

.btn-vote {
  @apply flex w-full items-center justify-center rounded-xl py-4 text-lg font-bold;
}
/* Still there to tap after the account is done, but no longer the loudest thing on screen. */
.btn-vote-done {
  @apply border-2 border-green-600 bg-white text-green-700;
}
.btn-ghost {
  @apply border border-gray-300 font-medium px-5 py-3 rounded-lg hover:bg-gray-50 disabled:opacity-50;
}
.btn-done {
  @apply bg-green-600 text-white font-semibold px-4 py-3 rounded-lg hover:bg-green-700
    disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100;
}
/* On a done card: there if needed, but quieter than the vote link above it. */
.btn-missing {
  @apply border border-amber-400 text-amber-700 font-semibold px-4 py-3 rounded-lg hover:bg-amber-50;
}
.btn-missing-pick {
  @apply rounded-xl border-2 border-amber-400 text-amber-700 py-3 hover:bg-amber-50
    disabled:opacity-50;
}
.btn-delete {
  @apply border border-red-300 text-red-600 font-semibold px-4 py-3 rounded-lg hover:bg-red-50;
}
.btn-delete-solid {
  @apply bg-red-600 text-white font-semibold px-5 py-3 rounded-lg hover:bg-red-700 disabled:opacity-50;
}

.toast-enter-active,
.toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active { transition: none; }
}
</style>
