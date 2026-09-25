<script setup lang="ts">
/**
 * Parcels' tracking numbers by X account, grouped by the project they came from. The numbers
 * are set in the admin under Tracking.
 *
 * Two ways to show them, picked on the block:
 *  - `showAll`: the whole list, loaded once, with the box narrowing it as the fan types.
 *  - otherwise a lookup: the whole account has to match, nothing shows until it does, and the
 *    endpoint is rate limited, so a 429 gets a plain message rather than a raw error.
 */
import { computed, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { ApiResponse, PublicTrackingList, PublicTrackingLookup } from '@cms/shared';

const props = withDefaults(
  defineProps<{
    heading?: string;
    description?: string;
    /** One project only; 0 or blank searches every project shown on the web. */
    projectId?: number | string;
    /** Every account and number, rather than only the one typed. */
    showAll?: boolean;
    buttonLabel?: string;
    accentColor?: string;
  }>(),
  { heading: '', description: '', projectId: 0, showAll: false, buttonLabel: 'ค้นหา', accentColor: '' },
);

const account = ref('');
// The "@" is already drawn in front of the field; a typed or pasted one would show twice.
watch(account, (v) => {
  if (v.startsWith('@')) account.value = v.replace(/^@+/, '');
});
const result = ref<PublicTrackingLookup | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
/** Which number was just copied, so only its button says so. */
const copied = ref<string | null>(null);

const onlyProject = computed(() => {
  const n = Math.round(Number(props.projectId));
  return Number.isFinite(n) && n > 0 ? n : null;
});

const accentStyle = computed(() => (props.accentColor ? { '--accent': props.accentColor } : {}));

async function lookup(): Promise<void> {
  const xAccount = account.value.trim().replace(/^@+/, '').trim();
  if (!xAccount) {
    error.value = 'กรุณากรอกชื่อ account X';
    return;
  }
  loading.value = true;
  error.value = null;
  result.value = null;
  try {
    const { data } = await api.post<ApiResponse<PublicTrackingLookup>>('/public/tracking/lookup', {
      xAccount,
      projectId: onlyProject.value,
    });
    result.value = data.data;
  } catch (err: any) {
    error.value =
      err?.response?.status === 429
        ? 'ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
        : (err?.response?.data?.message ?? 'ค้นหาไม่สำเร็จ กรุณาลองใหม่');
  } finally {
    loading.value = false;
  }
}

// ── The whole list ──
const list = ref<PublicTrackingList | null>(null);

async function loadList(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<ApiResponse<PublicTrackingList>>('/public/tracking/list', {
      params: { projectId: onlyProject.value ?? undefined },
    });
    list.value = data.data;
  } catch {
    error.value = 'โหลดรายการไม่สำเร็จ กรุณาลองใหม่';
  } finally {
    loading.value = false;
  }
}
if (props.showAll) void loadList();

/** The list narrowed to accounts or numbers containing what is typed, ignoring case. */
const filtered = computed(() => {
  const q = account.value.trim().toLowerCase();
  return (list.value?.projects ?? []).map((p) => ({
    ...p,
    entries: q
      ? p.entries.filter(
          (e) => e.xAccount.toLowerCase().includes(q) || e.trackingNo.toLowerCase().includes(q),
        )
      : p.entries,
  }));
});
const filteredCount = computed(() => filtered.value.reduce((n, p) => n + p.entries.length, 0));

function submit(): void {
  if (!props.showAll) void lookup();
}

async function copy(no: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(no);
    copied.value = no;
    setTimeout(() => {
      if (copied.value === no) copied.value = null;
    }, 1500);
  } catch {
    // No clipboard (plain HTTP, an old in-app browser): the number is on screen to select.
  }
}
</script>

<template>
  <div class="wrap container-site" :style="accentStyle">
    <h2 v-if="heading" class="heading">{{ heading }}</h2>
    <p v-if="description" class="lead">{{ description }}</p>

    <form class="form" role="search" @submit.prevent="submit">
      <label for="tracking-account" class="sr-only">Account X</label>
      <div class="field">
        <span class="at" aria-hidden="true">@</span>
        <input
          id="tracking-account"
          v-model="account"
          type="text"
          maxlength="101"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="showAll ? 'ค้นหา account X หรือเลข Tracking' : 'account X'"
          :aria-invalid="!!error"
          aria-describedby="tracking-error"
        />
      </div>
      <button v-if="!showAll" type="submit" class="btn" :disabled="loading">
        {{ loading ? 'กำลังค้นหา…' : buttonLabel }}
      </button>
    </form>

    <p v-if="error" id="tracking-error" class="error" role="alert">{{ error }}</p>

    <!-- The whole list -->
    <div v-if="showAll" class="results">
      <p v-if="loading" class="muted who" aria-live="polite">กำลังโหลด…</p>
      <template v-else-if="list">
        <p class="muted who" aria-live="polite">
          {{ account.trim() ? `พบ ${filteredCount} รายการ` : `ทั้งหมด ${filteredCount} รายการ` }}
        </p>
        <div v-for="p in filtered" :key="p.id" class="card">
          <!-- One project on the page: its name would only repeat the heading. -->
          <p v-if="filtered.length > 1" class="title">{{ p.name }}</p>
          <p v-if="p.description" class="muted desc">{{ p.description }}</p>
          <p v-if="!p.entries.length" class="muted">
            {{ account.trim() ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีเลข Tracking' }}
          </p>
          <ul v-else class="numbers" role="list">
            <li v-for="(e, i) in p.entries" :key="i" class="row">
              <span class="acc">@{{ e.xAccount }}</span>
              <span class="no">{{ e.trackingNo }}</span>
              <button type="button" class="copy" @click="copy(e.trackingNo)">
                {{ copied === e.trackingNo ? 'คัดลอกแล้ว' : 'คัดลอก' }}
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <div v-else-if="result" class="results" role="status" aria-live="polite">
      <div v-if="!result.projects.length" class="card empty">
        <p class="big" aria-hidden="true">🔍</p>
        <p class="title">ไม่พบ Tracking ของ @{{ result.xAccount }}</p>
        <p class="muted">ตรวจการสะกดชื่อ account อีกครั้ง หรือรอผู้ดูแลอัปเดตเลข Tracking</p>
      </div>

      <template v-else>
        <p class="muted who">@{{ result.xAccount }}</p>
        <div v-for="p in result.projects" :key="p.id" class="card">
          <p class="title">{{ p.name }}</p>
          <p v-if="p.description" class="muted desc">{{ p.description }}</p>
          <ul class="numbers" role="list">
            <li v-for="no in p.trackingNos" :key="no">
              <span class="no">{{ no }}</span>
              <button type="button" class="copy" @click="copy(no)">
                {{ copied === no ? 'คัดลอกแล้ว' : 'คัดลอก' }}
              </button>
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  /* The site's orange (header, buttons); the block's colour field overrides it. */
  --accent: #ea480c;
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
.form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.field {
  flex: 1 1 14rem;
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
.btn {
  flex: 0 0 auto;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  border-radius: 0.6rem;
  padding: 0.8rem 1.5rem;
  transition: filter 0.15s;
}
.btn:hover {
  filter: brightness(1.1);
}
.btn:disabled {
  opacity: 0.6;
}
.error {
  margin: 1rem 0 0;
  text-align: center;
  color: #dc2626;
}
.results {
  margin-top: 1.5rem;
  display: grid;
  gap: 0.75rem;
}
.card {
  background: #fff;
  color: #111827;
  border: 1px solid #f3f4f6;
  border-radius: 1rem;
  padding: 1.1rem 1.25rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
.empty {
  text-align: center;
}
.big {
  font-size: 2.5rem;
  margin: 0 0 0.5rem;
}
.title {
  margin: 0;
  font-weight: 700;
  font-size: 1.05rem;
}
.muted {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: #6b7280;
}
.who {
  text-align: center;
}
.desc {
  white-space: pre-line;
}
.numbers {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.numbers li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: #f9fafb;
  border-radius: 0.6rem;
  padding: 0.6rem 0.8rem;
}
.no {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  word-break: break-all;
  user-select: all;
}
/* Account over number, copy button to the side: a phone is too narrow for three columns. */
.numbers li.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 0.75rem;
}
.row .acc {
  font-size: 0.85rem;
  color: #4b5563;
  overflow-wrap: anywhere;
}
.row .no {
  grid-column: 1;
  word-break: normal;
  overflow-wrap: anywhere;
}
.row .copy {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.copy {
  flex: 0 0 auto;
  font-size: 0.85rem;
  color: var(--accent);
  font-weight: 600;
}
</style>
