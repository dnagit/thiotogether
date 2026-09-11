<script setup lang="ts">
/**
 * JOOX voting checklist — one shared list, kept on the server, that everyone on the page sees
 * and edits. See {@link useJooxVotes} for how it stays fresh, and the API module for the
 * 23:00 Thai-time reset.
 *
 * Laid out for a phone held in one hand, since that is where the voting happens: the list
 * comes first, newest account on top, and each account's vote link is the one big button on
 * its card. A filter narrows it to the accounts still to vote, or the finished ones. The add
 * form folds away once there is a list, to keep it from pushing the links down the screen.
 *
 * Marking an account done and deleting it both go through a confirm dialog: the buttons sit
 * side by side on a small screen, neither can be taken back, and on a shared list a slip
 * costs everybody.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import AppModal from '@/components/AppModal.vue';
import { applySeo } from '@/composables/useSeo';
import { useJooxVotes } from '@/composables/useJooxVotes';
import type { JooxVoteAccount } from '@/api/jooxVotes';

applySeo({ title: 'โหวต JOOX' });

const { accounts, loading, loadError, msUntilReset, refresh, add, countClick, markDone, remove } =
  useJooxVotes();

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
    // A new account is never done yet; don't let it vanish behind the "done" filter.
    if (filter.value === 'done') filter.value = 'all';
  }
}

// ── The list ──────────────────────────────────────────────────────────────────
type Filter = 'all' | 'pending' | 'done';
const filter = ref<Filter>('all');

const doneCount = computed(() => accounts.value.filter((a) => a.isDone).length);

const filters = computed<Array<{ key: Filter; label: string; count: number }>>(() => [
  { key: 'all', label: 'ทั้งหมด', count: accounts.value.length },
  { key: 'pending', label: 'ยังไม่ครบ', count: accounts.value.length - doneCount.value },
  { key: 'done', label: 'ครบแล้ว', count: doneCount.value },
]);

/** Newest first. Ids count up as accounts are added, so the highest id is the latest. */
const shown = computed(() =>
  accounts.value
    .filter((a) =>
      filter.value === 'all' ? true : filter.value === 'done' ? a.isDone : !a.isDone,
    )
    .sort((a, b) => b.id - a.id),
);

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

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ── Confirm dialog, shared by "done" and "delete" ─────────────────────────────
type Pending = { kind: 'done' | 'delete'; account: JooxVoteAccount };
const pending = ref<Pending | null>(null);
const confirming = ref(false);

function ask(kind: Pending['kind'], account: JooxVoteAccount): void {
  pending.value = { kind, account };
}

async function confirm(): Promise<void> {
  if (!pending.value) return;
  const { kind, account } = pending.value;
  confirming.value = true;
  const error = kind === 'done' ? await markDone(account.id) : await remove(account.id);
  confirming.value = false;
  pending.value = null;
  flash(error);
}
</script>

<template>
  <div class="container-site py-6 sm:py-12 max-w-2xl">
    <header class="text-center mb-5 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-extrabold mb-1">โหวต JOOX</h1>
      <p class="text-sm sm:text-base text-gray-500">
        รีเซ็ตทุกวัน 23:00 น. (เวลาไทย) · อีก {{ resetIn }}
      </p>
    </header>

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

      <p v-if="shown.length === 0" class="card text-center text-gray-500">
        {{ filter === 'done' ? 'ยังไม่มีบัญชีที่โหวตครบ' : 'โหวตครบทุกบัญชีแล้ว 🎉' }}
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
              <span class="text-3xl font-extrabold tabular-nums">{{ a.clicks }}</span>
              <span class="block text-xs text-gray-500 mt-1">ครั้งวันนี้</span>
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
            <button
              type="button"
              class="tap btn-done"
              :disabled="a.isDone"
              @click="ask('done', a)"
            >
              {{ a.isDone ? 'ครบแล้ว ✓' : 'ครบแล้ว' }}
            </button>
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
      รายการนี้ใช้ร่วมกัน ทุกคนที่เปิดหน้านี้เห็นและแก้ไขรายการเดียวกัน
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
      :title="pending?.kind === 'delete' ? 'ยืนยันการลบบัญชี' : 'ยืนยันว่าโหวตครบแล้ว'"
      @close="pending = null"
    >
      <template v-if="pending">
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
            @click="confirm"
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
/* 16px text: anything smaller and iOS zooms the page in when the field takes focus. */
.input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-3 text-base
    focus:outline-none focus:ring-2 focus:ring-blue-500;
}

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
