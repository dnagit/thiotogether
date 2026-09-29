<script setup lang="ts">
/**
 * One streaming round, in four tabs:
 *
 *  - หลักฐาน:   the fans' screenshots. Read the number off the picture, type it in, approve.
 *               Only approved proofs count, and an account's proofs add up.
 *  - รางวัล:    all three awards, exactly as the website will show them.
 *  - DJ's Pick: the DJ draws a winner from everyone with approved streams — the same chance
 *               whatever their number — or names one.
 *  - ของรางวัล: the prize pool, and every winner's draw. Winners enter their account on the
 *               website to draw one prize each per round; "สุ่มแทน" draws it here instead,
 *               for a winner who wants it done on air.
 *
 * Streaming Star and Rising Streamer winners can draw only once the round is closed — until
 * then the standings still move — so closing the round is also announcing the results.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { tagMapper } from '@/utils/elementTypes';
import { confirmDelete } from '@/utils/confirm';
import MediaPicker from '@/components/MediaPicker.vue';
import {
  PERMISSIONS,
  type ApiResponse,
  type StreamAwards,
  type StreamPick,
  type StreamPrize,
  type StreamProof,
  type StreamSession,
  type StreamWinner,
} from '@cms/shared';

const route = useRoute();
const sessionId = Number(route.params.id);

const session = ref<StreamSession | null>(null);
async function loadSession(): Promise<void> {
  const { data } = await http.get<ApiResponse<StreamSession>>(`/streaming/sessions/${sessionId}`);
  session.value = data.data;
}
void loadSession();

const tab = ref<'proofs' | 'awards' | 'picks' | 'prizes'>('proofs');

/** Closing settles Streaming Star and Rising Streamer, which lets their winners draw. */
const toggling = ref(false);
async function setOpen(isOpen: boolean): Promise<void> {
  toggling.value = true;
  try {
    await http.put(`/streaming/sessions/${sessionId}`, { isOpen });
    ElMessage.success(isOpen ? 'เปิดรับหลักฐานอีกครั้งแล้ว' : 'ปิดรอบแล้ว ผู้ได้รางวัลสุ่มของได้เลย');
    await loadSession();
    if (tab.value === 'awards') void loadAwards();
    if (tab.value === 'prizes') void loadWinners();
  } finally {
    toggling.value = false;
  }
}
const num = (n: number) => n.toLocaleString('th-TH');

// ── Proofs ────────────────────────────────────────────────────────────────────
const proofs = useCrud<StreamProof>({ endpoint: '/streaming/proofs', params: { sessionId } });
proofs.query.filters.status = 'PENDING';

const statusTag = tagMapper({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'info' });
const statusLabel: Record<string, string> = {
  PENDING: 'รอตรวจ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
};

/** The number being typed for each row, before it is saved. */
const drafts = reactive<Record<number, number | undefined>>({});
watch(proofs.items, (rows) => {
  for (const r of rows) drafts[r.id] = r.streams ?? undefined;
});
const busy = ref<number | null>(null);

async function review(row: StreamProof | Record<string, any>, status: 'APPROVED' | 'REJECTED'): Promise<void> {
  const streams = drafts[row.id];
  if (status === 'APPROVED' && (streams === undefined || streams === null)) {
    ElMessage.warning('กรอกยอดสตรีมจากภาพก่อนอนุมัติ');
    return;
  }
  busy.value = row.id;
  try {
    await http.put(`/streaming/proofs/${row.id}`, { status, streams: streams ?? null });
    ElMessage.success(status === 'APPROVED' ? `อนุมัติ @${row.xAccount} แล้ว` : 'ไม่อนุมัติแล้ว');
    await proofs.fetchList();
    void loadSession();
  } finally {
    busy.value = null;
  }
}

async function removeProof(row: StreamProof | Record<string, any>): Promise<void> {
  if (await proofs.deleteItem(row.id, `@${row.xAccount}`)) void loadSession();
}

/** A number the admin already has — from a spreadsheet, or sent in some other way. */
const manualOpen = ref(false);
const manual = reactive({ xAccount: '', streams: undefined as number | undefined, note: '' });
const stripAt = (s: string) => s.trim().replace(/^@+/, '').trim();

function openManual(): void {
  Object.assign(manual, { xAccount: '', streams: undefined, note: '' });
  manualOpen.value = true;
}

async function saveManual(): Promise<void> {
  await proofs.createItem({
    sessionId,
    xAccount: stripAt(manual.xAccount),
    streams: manual.streams,
    note: manual.note.trim() || null,
  } as Partial<StreamProof>);
  manualOpen.value = false;
}

// ── Awards ────────────────────────────────────────────────────────────────────
const awards = ref<StreamAwards | null>(null);
const awardsLoading = ref(false);

async function loadAwards(): Promise<void> {
  awardsLoading.value = true;
  try {
    const { data } = await http.get<ApiResponse<StreamAwards>>(`/streaming/sessions/${sessionId}/awards`);
    awards.value = data.data;
  } finally {
    awardsLoading.value = false;
  }
}
watch(tab, (t) => {
  if (t === 'awards') void loadAwards();
  if (t === 'prizes') void loadWinners();
});

// ── Prizes ────────────────────────────────────────────────────────────────────
const prizes = useCrud<StreamPrize>({ endpoint: '/streaming/prizes', params: { sessionId } });
prizes.query.limit = 100;

const prizeOpen = ref(false);
const blankPrize = { id: null as number | null, name: '', image: null as string | null, quantity: 1, sortOrder: 0 };
const prizeForm = reactive({ ...blankPrize });

function openPrize(row?: StreamPrize | Record<string, any>): void {
  Object.assign(prizeForm, blankPrize, row ? { ...row } : {});
  prizeOpen.value = true;
}

async function savePrize(): Promise<void> {
  const payload = {
    name: prizeForm.name.trim(),
    image: prizeForm.image || null,
    quantity: prizeForm.quantity,
    sortOrder: prizeForm.sortOrder,
  };
  if (prizeForm.id) await prizes.updateItem(prizeForm.id, payload);
  else await prizes.createItem({ ...payload, sessionId });
  prizeOpen.value = false;
}

const prizesLeft = computed(() =>
  prizes.items.value.reduce((n, p) => n + Math.max(0, p.quantity - (p._count?.draws ?? 0)), 0),
);

// ── Picks ─────────────────────────────────────────────────────────────────────
const picks = useCrud<StreamPick>({ endpoint: '/streaming/picks', params: { sessionId } });
picks.query.limit = 100;

const djs = ref<Array<{ id: number; name: string; image: string | null }>>([]);
void http
  .get<ApiResponse<typeof djs.value>>('/streaming/djs')
  .then(({ data }) => (djs.value = data.data));
const djId = ref<number | null>(null);

const drawing = ref(false);
/** The winner just drawn, shown big until the next draw. */
const justPicked = ref<StreamPick | null>(null);

async function drawWinner(): Promise<void> {
  drawing.value = true;
  try {
    const { data } = await http.post<ApiResponse<StreamPick>>('/streaming/picks/draw', {
      sessionId,
      djId: djId.value,
    });
    justPicked.value = data.data;
    await picks.fetchList();
  } finally {
    drawing.value = false;
  }
}

const namedAccount = ref('');
/** DJ's Pick stops at the round's number; the API says so too. */
const pickFull = computed(() => !!session.value && picks.meta.value.total >= session.value.pickCount);
async function addNamed(): Promise<void> {
  const made = await picks.createItem({
    sessionId,
    djId: djId.value,
    xAccount: stripAt(namedAccount.value),
  } as Partial<StreamPick>);
  justPicked.value = made;
  namedAccount.value = '';
}

async function removePick(row: StreamPick | Record<string, any>): Promise<void> {
  if (await picks.deleteItem(row.id, `@${row.xAccount}`)) {
    if (justPicked.value?.id === row.id) justPicked.value = null;
  }
}

// ── Winners' draws ────────────────────────────────────────────────────────────
const winners = ref<StreamWinner[]>([]);
const winnersLoading = ref(false);
const drawingFor = ref<string | null>(null);

async function loadWinners(): Promise<void> {
  winnersLoading.value = true;
  try {
    const { data } = await http.get<ApiResponse<StreamWinner[]>>(`/streaming/sessions/${sessionId}/winners`);
    winners.value = data.data;
  } finally {
    winnersLoading.value = false;
  }
}

async function drawFor(row: StreamWinner | Record<string, any>): Promise<void> {
  drawingFor.value = row.xAccount;
  try {
    const { data } = await http.post<ApiResponse<unknown>>(`/streaming/sessions/${sessionId}/draws`, {
      xAccount: row.xAccount,
    });
    ElMessage.success(data.message ?? 'สุ่มแล้ว');
    await Promise.all([loadWinners(), prizes.fetchList()]);
  } finally {
    drawingFor.value = null;
  }
}

async function undoDraw(row: StreamWinner | Record<string, any>): Promise<void> {
  if (!row.draw) return;
  const ok = await confirmDelete(`@${row.xAccount}`, {
    title: 'ยกเลิกการสุ่ม',
    note: `ยกเลิกของที่ @${row.xAccount} สุ่มได้ (${row.draw.prize.name}) ใช่หรือไม่? ของจะกลับเข้ากอง และ @${row.xAccount} สุ่มใหม่ได้`,
    confirmText: 'ยกเลิกการสุ่ม',
  });
  if (!ok) return;
  await http.delete(`/streaming/draws/${row.draw.id}`);
  ElMessage.success('ยกเลิกแล้ว ของรางวัลกลับเข้ากอง');
  await Promise.all([loadWinners(), prizes.fetchList()]);
}

const awardLabel: Record<string, string> = {
  star: '🏆 Streaming Star',
  rising: '🔥 Rising Streamer',
  pick: "🎧 DJ's Pick",
};

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const when = (iso: string) => dateFmt.format(new Date(iso));
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <ElButton text @click="$router.push({ name: 'streaming' })">← Streaming Awards</ElButton>
        <h1>{{ session?.name ?? '…' }}</h1>
        <div v-if="session" class="hint">
          Session ID {{ session.id }} · {{ when(session.startsAt) }} – {{ when(session.endsAt) }} ·
          {{ session.isOpen ? 'เปิดรับหลักฐาน' : 'ปิดรับหลักฐาน' }} ·
          {{ session.isActive ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ' }} ·
          ผู้ชนะ: Star {{ session.starCount }} · Rising {{ session.risingCount }} · DJ's Pick {{ session.pickCount }}
        </div>
      </div>
      <div v-if="session" v-permission="PERMISSIONS.STREAMING_MANAGE">
        <ElButton v-if="session.isOpen" type="warning" :loading="toggling" @click="setOpen(false)">
          ปิดรอบ & ประกาศผล
        </ElButton>
        <ElButton v-else :loading="toggling" @click="setOpen(true)">เปิดรับหลักฐานอีกครั้ง</ElButton>
      </div>
    </div>

    <ElAlert
      v-if="session?.isOpen"
      type="info"
      :closable="false"
      show-icon
      class="mb"
      title="รอบนี้ยังเปิดอยู่ — อันดับ Streaming Star / Rising Streamer ยังเปลี่ยนได้ ผู้ได้ 2 รางวัลนี้จะสุ่มของได้เมื่อกด &quot;ปิดรอบ & ประกาศผล&quot; ส่วน DJ's Pick สุ่มของได้ทันที"
    />

    <ElTabs v-model="tab">
      <!-- ── Proofs ── -->
      <ElTabPane name="proofs">
        <template #label>
          หลักฐาน
          <ElTag v-if="session?._count?.proofs" size="small" type="warning" class="ml">
            {{ session._count.proofs }}
          </ElTag>
        </template>
        <ElCard>
          <div class="toolbar">
            <ElRadioGroup v-model="proofs.query.filters.status">
              <ElRadioButton value="PENDING">รอตรวจ</ElRadioButton>
              <ElRadioButton value="APPROVED">อนุมัติแล้ว</ElRadioButton>
              <ElRadioButton value="REJECTED">ไม่อนุมัติ</ElRadioButton>
              <ElRadioButton value="">ทั้งหมด</ElRadioButton>
            </ElRadioGroup>
            <ElInput v-model="proofs.query.search" placeholder="ค้นหา account X…" clearable style="max-width: 220px" />
            <ElButton v-permission="PERMISSIONS.STREAMING_MANAGE" @click="openManual">+ เพิ่มยอดเอง</ElButton>
          </div>

          <ElTable v-loading="proofs.loading.value" :data="proofs.items.value" @sort-change="proofs.onSortChange">
            <ElTableColumn label="ภาพ" width="110">
              <template #default="{ row }">
                <ElImage
                  v-if="row.imageUrl"
                  :src="row.imageUrl"
                  :preview-src-list="[row.imageUrl]"
                  preview-teleported
                  fit="cover"
                  class="shot"
                />
                <span v-else class="hint">กรอกเอง</span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="xAccount" label="Account X" min-width="160" sortable="custom">
              <template #default="{ row }">
                <div>@{{ row.xAccount }}</div>
                <div v-if="row.note" class="hint">{{ row.note }}</div>
                <div class="hint">{{ when(row.createdAt) }}</div>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="streams" label="ยอดสตรีม" width="170" sortable="custom">
              <template #default="{ row }">
                <ElInputNumber
                  v-model="drafts[row.id]"
                  :min="0"
                  :step="1"
                  :controls="false"
                  placeholder="ดูจากภาพ"
                  style="width: 140px"
                  @keyup.enter="review(row, 'APPROVED')"
                />
              </template>
            </ElTableColumn>
            <ElTableColumn label="สถานะ" width="110" align="center">
              <template #default="{ row }">
                <ElTag size="small" :type="statusTag(row.status)">{{ statusLabel[row.status] }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="จัดการ" width="250" fixed="right">
              <template #default="{ row }">
                <ElButton
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  type="success"
                  :loading="busy === row.id"
                  @click="review(row, 'APPROVED')"
                >
                  {{ row.status === 'APPROVED' ? 'บันทึกยอด' : 'อนุมัติ' }}
                </ElButton>
                <ElButton
                  v-if="row.status !== 'REJECTED'"
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  :disabled="busy === row.id"
                  @click="review(row, 'REJECTED')"
                >
                  ไม่อนุมัติ
                </ElButton>
                <ElButton
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  type="danger"
                  text
                  @click="removeProof(row)"
                >
                  ลบ
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>

          <ElPagination
            v-model:current-page="proofs.query.page"
            class="mt"
            layout="prev, pager, next, total"
            :total="proofs.meta.value.total"
            :page-size="proofs.query.limit"
          />
        </ElCard>
      </ElTabPane>

      <!-- ── Awards ── -->
      <ElTabPane label="รางวัล" name="awards">
        <div class="toolbar">
          <span class="hint">
            ผู้ชนะ Star {{ awards?.starCount }} คน · Rising {{ awards?.risingCount }} คน ·
            DJ's Pick {{ awards?.pickCount }} คน — เปลี่ยนได้ที่ "แก้ไข" รอบในหน้ารายการรอบ
          </span>
          <ElButton size="small" :loading="awardsLoading" @click="loadAwards">รีเฟรช</ElButton>
        </div>
        <div v-if="awards" v-loading="awardsLoading" class="awards">
          <ElCard>
            <template #header>🏆 Streaming Star <span class="hint">— ยอดสูงสุด</span></template>
            <ElEmpty v-if="!awards.stars.length" description="ยังไม่มียอดที่อนุมัติ" :image-size="60" />
            <ol v-else class="rank">
              <li v-for="r in awards.stars" :key="r.xAccount">
                <span>@{{ r.xAccount }}</span><b>{{ num(r.streams) }}</b>
              </li>
            </ol>
          </ElCard>
          <ElCard>
            <template #header>🔥 Rising Streamer <span class="hint">— เพิ่มขึ้นมากสุด ผู้ชนะ {{ awards.risingCount }} คน (เท่ากันตัดสินด้วยยอดรวมรอบนี้)</span></template>
            <p class="hint">
              {{ awards.previous ? `เทียบกับ ${awards.previous.name}` : 'ไม่มีรอบก่อนหน้า — ใช้ยอดรอบนี้แทน' }}
            </p>
            <ElEmpty
              v-if="!awards.rising.length"
              :description="awards.previous ? 'ยังไม่มีใครที่ยอดเพิ่มจากรอบก่อน' : 'ยังไม่มียอดที่อนุมัติ'"
              :image-size="60"
            />
            <ol v-else-if="awards.rising.length" class="rank">
              <li v-for="r in awards.rising" :key="r.xAccount">
                <span>@{{ r.xAccount }}</span>
                <ElTag v-if="r.winner" size="small" type="warning" class="ml">ผู้ชนะ</ElTag>
                <b>+{{ num(r.gain) }}</b>
                <span class="hint">{{ !awards.previous ? '' : r.previous ? `${num(r.previous)} → ${num(r.streams)}` : 'ใหม่รอบนี้' }}</span>
              </li>
            </ol>
          </ElCard>
          <ElCard>
            <template #header>🎧 DJ's Pick <span class="hint">— สุ่มจาก {{ awards.participants }} คน</span></template>
            <ElEmpty v-if="!awards.picks.length" description="ยังไม่ได้สุ่ม" :image-size="60" />
            <ul v-else class="rank">
              <li v-for="p in awards.picks" :key="p.id">
                <span>@{{ p.xAccount }}</span>
              </li>
            </ul>
          </ElCard>
        </div>
      </ElTabPane>

      <!-- ── DJ's Pick ── -->
      <ElTabPane label="DJ's Pick" name="picks">
        <div class="picks-grid">
          <ElCard v-permission="PERMISSIONS.STREAMING_MANAGE">
            <template #header>
              🎧 สุ่มผู้โชคดี
              <span class="hint">สุ่มแล้ว {{ picks.meta.value.total }} / {{ session?.pickCount ?? '–' }} คน</span>
            </template>
            <ElForm label-position="top" @submit.prevent>
              <ElFormItem label="DJ ที่สุ่ม">
                <ElSelect v-model="djId" clearable placeholder="เลือก DJ (ไม่บังคับ)" style="width: 100%">
                  <ElOption v-for="d in djs" :key="d.id" :label="d.name" :value="d.id" />
                </ElSelect>
              </ElFormItem>
              <ElButton
                type="primary"
                size="large"
                :loading="drawing"
                :disabled="pickFull"
                class="draw"
                @click="drawWinner"
              >
                🎲 สุ่มผู้โชคดี
              </ElButton>
              <p class="hint">
                สุ่มจากคนที่มียอดอนุมัติแล้วในรอบนี้ ทุกคนมีโอกาสเท่ากันไม่ว่ายอดเท่าไหร่ ·
                สุ่มจากคนที่ยังไม่ได้รางวัลอะไรก่อน ถ้าไม่เหลือแล้วจึงสุ่มจากคนที่ได้ Star / Rising ·
                คนที่ถูกสุ่มในรอบนี้แล้วจะไม่ถูกสุ่มซ้ำ
              </p>
              <ElFormItem label="หรือ DJ เลือกเอง">
                <ElInput v-model="namedAccount" placeholder="account X" @keyup.enter="namedAccount.trim() && addNamed()">
                  <template #prepend>@</template>
                  <template #append>
                    <ElButton :disabled="!stripAt(namedAccount) || pickFull" @click="addNamed">เพิ่ม</ElButton>
                  </template>
                </ElInput>
              </ElFormItem>
            </ElForm>

            <div v-if="justPicked" class="winner">
              <div class="hint">ผู้โชคดีคือ</div>
              <div class="winner-name">@{{ justPicked.xAccount }}</div>
              <div class="hint">ผู้โชคดีกรอก account ตัวเองบนเว็บเพื่อสุ่มของรางวัลได้เลย (ดูในแท็บของรางวัล)</div>
            </div>
          </ElCard>
        </div>

        <ElCard class="mt">
          <template #header>ผู้โชคดีรอบนี้</template>
          <ElTable v-loading="picks.loading.value" :data="picks.items.value">
            <ElTableColumn label="Account X" min-width="150">
              <template #default="{ row }">
                @{{ row.xAccount }}
                <div class="hint">{{ row.dj ? `DJ ${row.dj.name}` : '–' }} · {{ when(row.createdAt) }}</div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="จัดการ" width="100" fixed="right">
              <template #default="{ row }">
                <ElButton
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  type="danger"
                  text
                  @click="removePick(row)"
                >
                  ลบ
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElTabPane>

      <!-- ── Prizes & draws ── -->
      <ElTabPane label="ของรางวัล" name="prizes">
        <div class="picks-grid">
          <ElCard>
            <template #header>
              <div class="card-head">
                <span>🎁 ของรางวัล <span class="hint">เหลือ {{ prizesLeft }} ชิ้น</span></span>
                <ElButton v-permission="PERMISSIONS.STREAMING_MANAGE" size="small" @click="openPrize()">
                  + เพิ่มของรางวัล
                </ElButton>
              </div>
            </template>
            <ElTable v-loading="prizes.loading.value" :data="prizes.items.value" size="small">
              <ElTableColumn label="" width="60">
                <template #default="{ row }">
                  <ElImage v-if="row.image" :src="row.image" fit="cover" class="thumb" />
                </template>
              </ElTableColumn>
              <ElTableColumn prop="name" label="ของรางวัล" min-width="140" />
              <ElTableColumn label="สุ่มไป / ทั้งหมด" width="120" align="center">
                <template #default="{ row }">{{ row._count?.draws ?? 0 }} / {{ row.quantity }}</template>
              </ElTableColumn>
              <ElTableColumn label="" width="120">
                <template #default="{ row }">
                  <ElButton v-permission="PERMISSIONS.STREAMING_MANAGE" size="small" text @click="openPrize(row)">
                    แก้ไข
                  </ElButton>
                  <ElButton
                    v-permission="PERMISSIONS.STREAMING_MANAGE"
                    size="small"
                    type="danger"
                    text
                    @click="prizes.deleteItem(row.id, row.name)"
                  >
                    ลบ
                  </ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </ElCard>
        </div>

        <ElCard class="mt">
          <template #header>ผู้ได้รางวัล & ของที่สุ่มได้ <span class="hint">— คนละ 1 ครั้งต่อรอบ</span></template>
          <ElTable v-loading="winnersLoading" :data="winners">
            <ElTableColumn label="Account X" min-width="150">
              <template #default="{ row }">@{{ row.xAccount }}</template>
            </ElTableColumn>
            <ElTableColumn label="รางวัล" min-width="200">
              <template #default="{ row }">
                <ElTag v-for="a in row.awards" :key="a" size="small" class="award-tag">{{ awardLabel[a] }}</ElTag>
                <span v-if="!row.awards.length" class="hint">หลุดจากอันดับแล้ว</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="ของที่สุ่มได้" min-width="180">
              <template #default="{ row }">
                <template v-if="row.draw">
                  🎁 {{ row.draw.prize.name }}
                  <div class="hint">สุ่มเมื่อ {{ when(row.draw.createdAt) }}</div>
                </template>
                <ElTag v-else-if="row.canDraw" size="small" type="warning">รอผู้ได้รางวัลสุ่ม</ElTag>
                <ElTag v-else size="small" type="info">รอปิดรอบ</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="จัดการ" width="170" fixed="right">
              <template #default="{ row }">
                <ElButton
                  v-if="!row.draw && row.canDraw"
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  :loading="drawingFor === row.xAccount"
                  @click="drawFor(row)"
                >
                  สุ่มแทน
                </ElButton>
                <ElButton
                  v-if="row.draw"
                  v-permission="PERMISSIONS.STREAMING_MANAGE"
                  size="small"
                  type="danger"
                  text
                  @click="undoDraw(row)"
                >
                  ยกเลิกการสุ่ม
                </ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="manualOpen" title="เพิ่มยอดเอง" width="440px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="Account X" required>
          <ElInput v-model="manual.xAccount" maxlength="101"><template #prepend>@</template></ElInput>
        </ElFormItem>
        <ElFormItem label="ยอดสตรีม" required>
          <ElInputNumber v-model="manual.streams" :min="0" :controls="false" style="width: 100%" />
        </ElFormItem>
        <ElFormItem label="หมายเหตุ">
          <ElInput v-model="manual.note" maxlength="300" />
        </ElFormItem>
        <p class="hint">เพิ่มแบบนี้จะนับเป็น "อนุมัติแล้ว" ทันที</p>
      </ElForm>
      <template #footer>
        <ElButton @click="manualOpen = false">ยกเลิก</ElButton>
        <ElButton
          type="primary"
          :loading="proofs.saving.value"
          :disabled="!stripAt(manual.xAccount) || manual.streams === undefined || manual.streams === null"
          @click="saveManual"
        >
          บันทึก
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="prizeOpen" :title="prizeForm.id ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัล'" width="460px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อของรางวัล" required>
          <ElInput v-model="prizeForm.name" maxlength="200" placeholder="เช่น โปสการ์ดลายเซ็น" />
        </ElFormItem>
        <ElFormItem label="รูป">
          <MediaPicker v-model="prizeForm.image" />
        </ElFormItem>
        <ElFormItem label="จำนวน">
          <ElInputNumber v-model="prizeForm.quantity" :min="0" />
          <div class="hint">ยิ่งเหลือมาก ยิ่งมีโอกาสถูกสุ่มได้มาก</div>
        </ElFormItem>
        <ElFormItem label="ลำดับ">
          <ElInputNumber v-model="prizeForm.sortOrder" :step="1" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="prizeOpen = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="prizes.saving.value" :disabled="!prizeForm.name.trim()" @click="savePrize">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.mb { margin-bottom: 12px; }
.award-tag { margin: 0 4px 4px 0; }
.ml { margin-left: 6px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.shot { width: 80px; height: 80px; border-radius: 6px; }
.thumb { width: 40px; height: 40px; border-radius: 4px; }
.awards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.rank { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.rank li span:first-child { margin-right: 8px; }
.rank b { margin-right: 8px; }
.picks-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.draw { width: 100%; margin-bottom: 8px; }
.winner {
  margin-top: 12px;
  padding: 16px;
  text-align: center;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
}
.winner-name { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
</style>
