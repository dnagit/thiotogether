<script setup lang="ts">
/**
 * Streaming — the rounds. Each round takes the fans' proof of streams and has its own awards
 * and DJ's Pick prizes, a click away on the round's own page.
 *
 * Rising Streamer compares a round with the one that started just before it, so the dates
 * matter even when a round is hidden.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useCrud } from '@/composables/useCrud';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse, type StreamSession } from '@cms/shared';

const router = useRouter();
const crud = useCrud<StreamSession>({ endpoint: '/streaming/sessions' });

/** A week from today, the usual length of a round. */
function blankForm() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return {
    id: null as number | null,
    name: '',
    description: '',
    range: [start, end] as [Date, Date],
    isOpen: true,
    isActive: true,
    starCount: 3,
    risingCount: 1,
    pickCount: 3,
    starMedal: null as string | null,
    risingMedal: null as string | null,
    pickMedal: null as string | null,
    starRankMedals: [] as string[],
    risingRankMedals: [] as string[],
  };
}

/** The latest round's medals, so a new round starts with the same pictures. */
async function lastMedals(): Promise<Partial<StreamSession>> {
  try {
    const { data } = await http.get<ApiResponse<StreamSession[]>>('/streaming/sessions', {
      params: { limit: 1, sortBy: 'startsAt', sortOrder: 'desc' },
    });
    const last = data.data[0];
    return last
      ? {
          starMedal: last.starMedal,
          risingMedal: last.risingMedal,
          pickMedal: last.pickMedal,
          starRankMedals: [...(last.starRankMedals ?? [])],
          risingRankMedals: [...(last.risingRankMedals ?? [])],
        }
      : {};
  } catch {
    return {};
  }
}

const dialog = ref(false);
const form = reactive(blankForm());
const isEdit = computed(() => form.id !== null);
const canSave = computed(() => form.name.trim().length > 0 && form.range?.length === 2);

async function openDialog(row?: StreamSession | Record<string, any>): Promise<void> {
  Object.assign(
    form,
    blankForm(),
    row
      ? {
          id: row.id,
          name: row.name,
          description: row.description ?? '',
          range: [new Date(row.startsAt), new Date(row.endsAt)],
          isOpen: row.isOpen,
          isActive: row.isActive,
          starCount: row.starCount,
          risingCount: row.risingCount,
          pickCount: row.pickCount,
          starMedal: row.starMedal ?? null,
          risingMedal: row.risingMedal ?? null,
          pickMedal: row.pickMedal ?? null,
          starRankMedals: [...(row.starRankMedals ?? [])],
          risingRankMedals: [...(row.risingRankMedals ?? [])],
        }
      : await lastMedals(),
  );
  dialog.value = true;
}

async function save(): Promise<void> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    startsAt: form.range[0].toISOString(),
    endsAt: form.range[1].toISOString(),
    isOpen: form.isOpen,
    isActive: form.isActive,
    starCount: form.starCount,
    risingCount: form.risingCount,
    pickCount: form.pickCount,
    starMedal: form.starMedal || null,
    risingMedal: form.risingMedal || null,
    pickMedal: form.pickMedal || null,
    starRankMedals: rankList(form.starRankMedals, form.starCount),
    risingRankMedals: rankList(form.risingRankMedals, form.risingCount),
  };
  if (form.id) {
    await crud.updateItem(form.id, payload as Partial<StreamSession>);
    dialog.value = false;
  } else {
    const made = await crud.createItem(payload as Partial<StreamSession>);
    dialog.value = false;
    openSession(made);
  }
}

function openSession(row: StreamSession | Record<string, any>): void {
  void router.push({ name: 'streaming-session', params: { id: row.id } });
}

/** Places past the winner count are dropped, and so are empty places at the end. */
function rankList(list: string[], count: number): string[] {
  const out = Array.from({ length: count }, (_, i) => list[i] || '');
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/** One picker per winning place; `form.*RankMedals[i]` is place i + 1. */
const RANK_MEDALS = [
  { key: 'starRankMedals', countKey: 'starCount', label: '🏆 Streaming Star' },
  { key: 'risingRankMedals', countKey: 'risingCount', label: '🔥 Rising Streamer' },
] as const;

function setRankMedal(key: 'starRankMedals' | 'risingRankMedals', i: number, url: string | null): void {
  const list = [...form[key]];
  while (list.length <= i) list.push('');
  list[i] = url ?? '';
  form[key] = list;
}

const MEDALS = [
  { key: 'starMedal', label: '🏆 Streaming Star' },
  { key: 'risingMedal', label: '🔥 Rising Streamer' },
  { key: 'pickMedal', label: "🎧 DJ's Pick" },
] as const;

const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const range = (row: StreamSession | Record<string, any>) =>
  `${dateFmt.format(new Date(row.startsAt))} – ${dateFmt.format(new Date(row.endsAt))}`;
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h1>Streaming Awards</h1>
        <div class="hint">
          🏆 Streaming Star · 🔥 Rising Streamer · 🎧 DJ's Pick — แฟนส่งหลักฐานยอดสตรีมเข้ารอบ
          แอดมินตรวจแล้วกรอกยอด ระบบคิดรางวัลให้เอง
        </div>
      </div>
      <ElButton v-permission="PERMISSIONS.STREAMING_MANAGE" type="primary" @click="openDialog()">
        + สร้างรอบ
      </ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อรอบ…" clearable style="max-width: 260px" />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value" @sort-change="crud.onSortChange">
        <ElTableColumn prop="id" label="ID" width="70" />
        <ElTableColumn prop="name" label="รอบ" min-width="200" sortable="custom">
          <template #default="{ row }">
            <ElLink type="primary" @click="openSession(row)">{{ row.name }}</ElLink>
            <div class="hint">{{ range(row) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="รอตรวจ" width="100" align="center">
          <template #default="{ row }">
            <ElTag v-if="row._count?.proofs" type="warning" size="small">{{ row._count.proofs }}</ElTag>
            <span v-else class="hint">–</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="รับหลักฐาน" width="110" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isOpen ? 'success' : 'info'">
              {{ row.isOpen ? 'เปิด' : 'ปิด' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="บนเว็บ" width="100" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.isActive ? 'success' : 'info'">
              {{ row.isActive ? 'แสดง' : 'ซ่อน' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="จัดการ" width="230" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" plain @click="openSession(row)">เปิดรอบ</ElButton>
            <ElButton v-permission="PERMISSIONS.STREAMING_MANAGE" size="small" @click="openDialog(row)">
              แก้ไข
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.STREAMING_MANAGE"
              size="small"
              type="danger"
              text
              @click="crud.deleteItem(row.id, row.name)"
            >
              ลบ
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt"
        layout="prev, pager, next, total"
        :total="crud.meta.value.total"
        :page-size="crud.query.limit"
      />
    </ElCard>

    <ElDialog v-model="dialog" :title="isEdit ? 'แก้ไขรอบ' : 'สร้างรอบ'" width="520px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อรอบ" required>
          <ElInput v-model="form.name" maxlength="200" placeholder="เช่น Week 1 · 1–7 ต.ค." />
        </ElFormItem>
        <ElFormItem label="ช่วงเวลา" required>
          <ElDatePicker
            v-model="form.range"
            type="datetimerange"
            start-placeholder="เริ่ม"
            end-placeholder="จบ"
            format="D MMM YYYY HH:mm"
            style="width: 100%"
          />
          <div class="hint">Rising Streamer จะเทียบกับรอบที่เริ่มก่อนหน้ารอบนี้</div>
        </ElFormItem>
        <ElFormItem label="รายละเอียด">
          <ElInput
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="1000"
            placeholder="แสดงบนเว็บ เช่น เพลงที่สตรีม วิธีแคปหน้าจอ (ไม่บังคับ)"
          />
        </ElFormItem>
        <ElFormItem label="จำนวนผู้ชนะแต่ละรางวัล">
          <div class="counts">
            <label>🏆 Streaming Star <ElInputNumber v-model="form.starCount" :min="1" :max="50" size="small" /></label>
            <label>🔥 Rising Streamer <ElInputNumber v-model="form.risingCount" :min="1" :max="50" size="small" /></label>
            <label>🎧 DJ's Pick <ElInputNumber v-model="form.pickCount" :min="1" :max="50" size="small" /></label>
          </div>
          <div class="hint">
            Star / Rising: คะแนนเท่ากันตรงอันดับสุดท้ายได้ด้วยกัน (Rising ตัดสินยอดเพิ่มเท่ากันด้วยยอดรวมรอบนี้) ·
            DJ's Pick: สุ่มครบแล้วสุ่มเพิ่มไม่ได้
          </div>
        </ElFormItem>
        <ElFormItem label="รูปเหรียญแต่ละรางวัล">
          <div class="medals">
            <div v-for="m in MEDALS" :key="m.key" class="medal">
              <div class="medal-label">{{ m.label }}</div>
              <MediaPicker v-model="form[m.key]" />
            </div>
          </div>
          <div class="hint">
            แสดงบนเว็บแทนเหรียญ/ไอคอนเดิมของรางวัลนั้น (หัวกระดาน แถบเลือกรางวัล และหน้าชื่อผู้ชนะ) ·
            ไม่ใส่ = ใช้แบบเดิม · ใช้ PNG พื้นใสจะสวยสุด · รอบใหม่จะใช้รูปจากรอบล่าสุดให้ก่อน
          </div>
        </ElFormItem>
        <ElFormItem label="รูปเหรียญแต่ละอันดับ (หน้าชื่อผู้ชนะ)">
          <div v-for="r in RANK_MEDALS" :key="r.key" class="rank-group">
            <div class="medal-label">{{ r.label }}</div>
            <div class="medals">
              <div v-for="i in form[r.countKey]" :key="i" class="medal">
                <div class="rank-label">อันดับ {{ i }}</div>
                <MediaPicker
                  :model-value="form[r.key][i - 1] || null"
                  @update:model-value="setRankMedal(r.key, i - 1, $event)"
                />
              </div>
            </div>
          </div>
          <div class="hint">
            แสดงด้านซ้ายของชื่อผู้ชนะแต่ละอันดับ · จำนวนช่องตามจำนวนผู้ชนะด้านบน ·
            อันดับที่ไม่ใส่ = ใช้รูปเหรียญของรางวัล (หรือเหรียญเดิม) · DJ's Pick ไม่มีอันดับจึงใช้รูปเดียว
          </div>
        </ElFormItem>
        <ElFormItem>
          <ElCheckbox v-model="form.isOpen">เปิดรับหลักฐานจากแฟน (ปิด = ประกาศผล ผู้ได้รางวัลสุ่มของได้)</ElCheckbox>
          <ElCheckbox v-model="form.isActive">แสดงบนเว็บ</ElCheckbox>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="crud.saving.value" :disabled="!canSave" @click="save">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.counts { display: grid; gap: 6px; width: 100%; }
.medals { display: grid; gap: 10px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.rank-group { width: 100%; margin-bottom: 10px; }
.rank-label { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 2px; }
.medal-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.counts label { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; }
</style>
