<script setup lang="ts">
/**
 * One streaming round's awards, set in the admin under Streaming Awards:
 *
 *  - 🏆 Streaming Star:  the highest totals.
 *  - 🔥 Rising Streamer: the biggest rise over the round before.
 *  - 🎧 DJ's Pick:       fans a DJ drew at random.
 *
 * Several ways to win on purpose — this is a game, not a ranking of who supports the most.
 * The results are a game-style board — podium, table, a tab bar to switch awards — see
 * AwardBoard. Every winner draws one prize per round; what they drew shows under their name.
 * Streaming Star and Rising Streamer are only provisional while the round is open, so their
 * winners draw once the admin closes it.
 *
 * Below the awards, two forms the block can switch off: sending a screenshot of your streams
 * into the round (while it is open), and a winner drawing their prize by entering their
 * account (once it is closed and the winners announced).
 */
import { computed, ref, watch } from 'vue';
import { api } from '@/api/client';
import { isImageFile, prepareImage } from '@/utils/image';
import type { ApiResponse, StreamAwards, StreamClaimResult } from '@cms/shared';
import AwardBoard from '@/components/streaming/AwardBoard.vue';

const props = withDefaults(
  defineProps<{
    heading?: string;
    description?: string;
    /** One round only; 0 or blank shows the newest round shown on the web. */
    sessionId?: number | string;
    /** Show the numbers next to the names, not only the names. */
    showCounts?: boolean;
    /** A picker for earlier rounds. */
    showPastRounds?: boolean;
    showSubmit?: boolean;
    showClaim?: boolean;
    accentColor?: string;
  }>(),
  {
    heading: '',
    description: '',
    sessionId: 0,
    showCounts: true,
    showPastRounds: true,
    showSubmit: true,
    showClaim: true,
    accentColor: '',
  },
);

const accentStyle = computed(() => (props.accentColor ? { '--accent': props.accentColor } : {}));
const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
const stripAt = (s: string) => s.trim().replace(/^@+/, '').trim();

const fixedSession = computed(() => {
  const n = Math.round(Number(props.sessionId));
  return Number.isFinite(n) && n > 0 ? n : null;
});

// ── Awards ────────────────────────────────────────────────────────────────────
const rounds = ref<Array<{ id: number; name: string }>>([]);
const chosen = ref<number | null>(fixedSession.value);
const awards = ref<StreamAwards | null>(null);
const loading = ref(true);
const loadError = ref(false);

async function loadAwards(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const { data } = await api.get<ApiResponse<StreamAwards | null>>('/public/streaming', {
      params: { sessionId: chosen.value ?? undefined },
    });
    awards.value = data.data;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadRounds(): Promise<void> {
  try {
    const { data } = await api.get<ApiResponse<Array<{ id: number; name: string }>>>(
      '/public/streaming/sessions',
    );
    rounds.value = data.data;
  } catch {
    // The picker is extra; the awards still show without it.
  }
}

void loadAwards();
if (props.showPastRounds && !fixedSession.value) void loadRounds();
watch(chosen, () => void loadAwards());

const shownId = computed(() => awards.value?.session.id ?? null);
const dates = computed(() =>
  awards.value
    ? `${dateFmt.format(new Date(awards.value.session.startsAt))} – ${dateFmt.format(new Date(awards.value.session.endsAt))}`
    : '',
);

// ── Send proof ────────────────────────────────────────────────────────────────
const proofAccount = ref('');
const proofStreams = ref('');
const proofNote = ref('');
const proofFile = ref<File | null>(null);
const proofPreview = ref<string | null>(null);
const sending = ref(false);
const proofMessage = ref<{ ok: boolean; text: string } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

watch(proofAccount, (v) => {
  if (v.startsWith('@')) proofAccount.value = v.replace(/^@+/, '');
});

async function pickFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!isImageFile(file)) {
    proofMessage.value = { ok: false, text: 'กรุณาเลือกไฟล์รูปภาพ' };
    return;
  }
  proofMessage.value = null;
  proofFile.value = await prepareImage(file);
  if (proofPreview.value) URL.revokeObjectURL(proofPreview.value);
  proofPreview.value = URL.createObjectURL(proofFile.value);
}

async function sendProof(): Promise<void> {
  const xAccount = stripAt(proofAccount.value);
  const streams = proofStreams.value.replace(/[,\s]/g, '');
  if (!xAccount || !streams || !proofFile.value || !shownId.value) {
    proofMessage.value = { ok: false, text: 'กรุณากรอก account X ยอดสตรีม และแนบภาพหน้าจอ' };
    return;
  }
  if (!/^\d+$/.test(streams)) {
    proofMessage.value = { ok: false, text: 'กรุณากรอกยอดสตรีมเป็นตัวเลข' };
    return;
  }
  sending.value = true;
  proofMessage.value = null;
  try {
    const form = new FormData();
    form.append('sessionId', String(shownId.value));
    form.append('xAccount', xAccount);
    form.append('streams', streams);
    if (proofNote.value.trim()) form.append('note', proofNote.value.trim());
    form.append('image', proofFile.value);
    const { data } = await api.post<ApiResponse<{ id: number }>>('/public/streaming/proofs', form);
    proofMessage.value = { ok: true, text: data.message ?? 'ส่งหลักฐานแล้ว' };
    proofStreams.value = '';
    proofNote.value = '';
    proofFile.value = null;
    if (proofPreview.value) URL.revokeObjectURL(proofPreview.value);
    proofPreview.value = null;
    if (fileInput.value) fileInput.value.value = '';
  } catch (err: any) {
    proofMessage.value = {
      ok: false,
      text:
        err?.response?.status === 429
          ? 'ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
          : (err?.response?.data?.message ?? 'ส่งไม่สำเร็จ กรุณาลองใหม่'),
    };
  } finally {
    sending.value = false;
  }
}

const awardLabel: Record<string, string> = {
  star: '🏆 Streaming Star',
  rising: '🔥 Rising Streamer',
  pick: "🎧 DJ's Pick",
};

// ── Claim a prize ─────────────────────────────────────────────────────
const claimAccount = ref('');
const claiming = ref(false);
/** The gift box shakes for a moment before the prize shows — it is a draw, after all. */
const revealing = ref(false);
const claimResult = ref<StreamClaimResult | null>(null);
const claimError = ref<string | null>(null);

watch(claimAccount, (v) => {
  if (v.startsWith('@')) claimAccount.value = v.replace(/^@+/, '');
});

async function claim(): Promise<void> {
  const xAccount = stripAt(claimAccount.value);
  if (!xAccount) {
    claimError.value = 'กรุณากรอก account X';
    return;
  }
  claiming.value = true;
  revealing.value = true;
  claimError.value = null;
  claimResult.value = null;
  try {
    const [{ data }] = await Promise.all([
      api.post<ApiResponse<StreamClaimResult>>('/public/streaming/claim', { xAccount }),
      new Promise((r) => setTimeout(r, 1600)),
    ]);
    claimResult.value = data.data;
    void loadAwards();
  } catch (err: any) {
    claimError.value =
      err?.response?.status === 429
        ? 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่'
        : (err?.response?.data?.message ?? 'สุ่มไม่สำเร็จ กรุณาลองใหม่');
  } finally {
    claiming.value = false;
    revealing.value = false;
  }
}
</script>

<template>
  <div class="wrap container-site" :style="accentStyle">
    <h2 v-if="heading" class="heading">{{ heading }}</h2>
    <p v-if="description" class="lead">{{ description }}</p>

    <div v-if="rounds.length > 1" class="rounds">
      <label for="stream-round" class="sr-only">รอบ</label>
      <select id="stream-round" v-model="chosen">
        <option :value="null">รอบล่าสุด</option>
        <option v-for="r in rounds" :key="r.id" :value="r.id">{{ r.name }}</option>
      </select>
    </div>

    <p v-if="loading && !awards" class="muted center" aria-live="polite">กำลังโหลด…</p>
    <p v-else-if="loadError" class="error">โหลดรางวัลไม่สำเร็จ กรุณาลองใหม่</p>
    <p v-else-if="!awards" class="muted center">ยังไม่มีรอบสตรีม</p>

    <template v-else>
      <p class="round">
        <b>{{ awards.session.name }}</b> <span class="muted">· {{ dates }}</span>
      </p>
      <p v-if="awards.session.description" class="muted center desc">{{ awards.session.description }}</p>

      <AwardBoard :awards="awards" :show-counts="showCounts" :dim="loading" />
      <p class="muted center note">ทุกคนที่ส่งยอดมีสิทธิ์ลุ้น DJ's Pick ไม่ว่าจะสตรีมมากหรือน้อย — คนที่ยังไม่ได้รางวัลได้ลุ้นก่อน 💛</p>

      <div class="forms">
        <!-- ── Send proof ── -->
        <form v-if="showSubmit && awards.session.isOpen" class="card form" @submit.prevent="sendProof">
          <h3>📸 ส่งหลักฐานยอดสตรีม</h3>
          <p class="muted">กรอกยอดสตรีมและแนบภาพแคปหน้าจอของยอดสตรีมสัปดาห์นี้</p>
          <label class="field">
            <span class="at" aria-hidden="true">@</span>
            <span class="sr-only">Account X</span>
            <input
              v-model="proofAccount"
              type="text"
              maxlength="101"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
              placeholder="account X"
            />
          </label>
          <label class="plain">
            <span class="sr-only">ยอดสตรีม</span>
            <input
              v-model="proofStreams"
              type="text"
              inputmode="numeric"
              maxlength="12"
              autocomplete="off"
              placeholder="ยอดสตรีม (ตัวเลข)"
            />
          </label>
          <label class="file">
            <input ref="fileInput" type="file" accept="image/*,.heic,.heif" @change="pickFile" />
            <img v-if="proofPreview" :src="proofPreview" alt="ภาพที่เลือก" class="preview" />
            <span v-else>แตะเพื่อเลือกภาพหน้าจอ</span>
          </label>
          <label class="plain">
            <span class="sr-only">หมายเหตุ</span>
            <input v-model="proofNote" type="text" maxlength="300" placeholder="หมายเหตุ (ไม่บังคับ)" />
          </label>
          <button type="submit" class="btn" :disabled="sending">{{ sending ? 'กำลังส่ง…' : 'ส่งหลักฐาน' }}</button>
          <p v-if="proofMessage" :class="proofMessage.ok ? 'success' : 'error'" role="status">{{ proofMessage.text }}</p>
        </form>

        <!-- ── Claim ── only once the round is closed, which is when its winners are announced. -->
        <form v-if="showClaim && !awards.session.isOpen" class="card form" @submit.prevent="claim">
          <h3>🎁 ได้รางวัล? สุ่มของรางวัลเลย</h3>
          <p class="muted">
            ได้ Streaming Star, Rising Streamer หรือ DJ's Pick กรอก account X ของตัวเองแล้วกดสุ่มได้เลย
            (คนละ 1 ชิ้นต่อรอบ)
          </p>
          <label class="field">
            <span class="at" aria-hidden="true">@</span>
            <span class="sr-only">Account X</span>
            <input
              v-model="claimAccount"
              type="text"
              maxlength="101"
              autocomplete="username"
              autocapitalize="off"
              spellcheck="false"
              placeholder="account X"
            />
          </label>
          <button type="submit" class="btn" :disabled="claiming">{{ claiming ? 'กำลังสุ่ม…' : '🎲 สุ่มของรางวัล' }}</button>

          <div v-if="revealing" class="reveal" aria-live="polite">
            <span class="box shake" aria-hidden="true">🎁</span>
            <p class="muted">กำลังสุ่ม…</p>
          </div>
          <div v-else-if="claimResult" class="reveal" role="status">
            <img v-if="claimResult.prize.image" :src="claimResult.prize.image" alt="" class="won-img" />
            <span v-else class="box" aria-hidden="true">🎉</span>
            <p class="muted">@{{ claimResult.xAccount }} ได้รับ</p>
            <p class="won">{{ claimResult.prize.name }}</p>
            <p class="muted">
              {{ claimResult.sessionName }}
              <template v-if="claimResult.awards.length">
                · {{ claimResult.awards.map((a) => awardLabel[a]).join(' · ') }}
              </template>
            </p>
          </div>
          <p v-if="claimError" class="error" role="alert">{{ claimError }}</p>
        </form>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wrap {
  /* The site's orange (header, buttons); the block's colour field overrides it. */
  --accent: #ea480c;
  max-width: 64rem;
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
  margin: 0 0 1.25rem;
  text-align: center;
  opacity: 0.75;
  white-space: pre-line;
}
.center {
  text-align: center;
}
.rounds {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}
.rounds select {
  border: 1px solid #d1d5db;
  border-radius: 0.6rem;
  background: #fff;
  color: #111827;
  padding: 0.5rem 0.8rem;
}
.round {
  margin: 0 0 0.25rem;
  text-align: center;
}
.desc {
  white-space: pre-line;
  margin-bottom: 1rem;
}
.card {
  background: #fff;
  color: #111827;
  border: 1px solid #f3f4f6;
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
.muted {
  margin: 0.2rem 0 0;
  font-size: 0.875rem;
  color: #6b7280;
}
.note {
  margin-top: 1rem;
}
.forms {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  margin-top: 2rem;
}
.form {
  display: grid;
  gap: 0.65rem;
  align-content: start;
}
.form h3 {
  margin: 0;
}
.field,
.plain input {
  border: 1px solid #d1d5db;
  border-radius: 0.6rem;
  background: #fff;
  color: #111827;
}
.field {
  display: flex;
  align-items: center;
  padding-left: 0.9rem;
}
.field:focus-within,
.plain input:focus {
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
  padding: 0.75rem 0.9rem 0.75rem 0.2rem;
  font-size: 1rem;
}
.plain input {
  width: 100%;
  padding: 0.75rem 0.9rem;
  font-size: 1rem;
  outline: 0;
}
.file {
  display: grid;
  place-items: center;
  min-height: 6rem;
  border: 2px dashed #d1d5db;
  border-radius: 0.6rem;
  color: #6b7280;
  font-size: 0.9rem;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.file:focus-within {
  outline: 2px solid var(--accent);
}
.file input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.preview {
  max-height: 14rem;
  max-width: 100%;
  object-fit: contain;
}
.btn {
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
  margin: 0.5rem 0 0;
  text-align: center;
  color: #dc2626;
}
.success {
  margin: 0.5rem 0 0;
  text-align: center;
  color: #16a34a;
}
.reveal {
  text-align: center;
  padding: 1rem 0 0.25rem;
}
.box {
  display: inline-block;
  font-size: 3.5rem;
  line-height: 1;
}
.shake {
  animation: shake 0.5s ease-in-out infinite;
}
@keyframes shake {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-12deg) scale(1.05); }
  75% { transform: rotate(12deg) scale(1.05); }
}
@media (prefers-reduced-motion: reduce) {
  .shake {
    animation: none;
  }
}
.won {
  margin: 0.25rem 0 0;
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--accent);
}
.won-img {
  width: 8rem;
  height: 8rem;
  object-fit: cover;
  border-radius: 0.8rem;
  margin: 0 auto;
}
</style>
