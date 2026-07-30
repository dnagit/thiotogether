<script setup lang="ts">
/**
 * Game list + lifecycle control. The lifecycle buttons are the risky surface here,
 * so each one states its precondition before firing and Reveal is double-confirmed.
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { tagMapper } from '@/utils/elementTypes';
import { PERMISSIONS, slugify, type ApiResponse } from '@cms/shared';

const router = useRouter();
const crud = useCrud<any>({ endpoint: '/games' });
const projects = ref<any[]>([]);
const busy = ref<number | null>(null);

void http
  .get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } })
  .then(({ data }) => (projects.value = data.data));

const statusTag = tagMapper({
  DRAFT: 'info', OPEN: 'success', FULL: 'warning', REVEALED: 'primary', ARCHIVED: 'info',
});
const statusLabel: Record<string, string> = {
  DRAFT: 'ร่าง', OPEN: 'เปิดจอง', FULL: 'จองครบแล้ว', REVEALED: 'เฉลยแล้ว', ARCHIVED: 'เก็บถาวร',
};

// ── Create dialog ───────────────────────────────────────────
const dialog = ref(false);
const blank = {
  name: '', slug: '', description: '', tileCount: 30, tokensPerTile: 1,
  showReserverNames: true, maxTilesPerAccount: null as number | null,
  themeColor: '#7c3aed', projectIds: [] as number[],
};
const form = reactive({ ...blank });
const saving = ref(false);

function openCreate(): void {
  Object.assign(form, blank);
  dialog.value = true;
}

const canSubmit = computed(() => form.name.trim().length > 0 && form.tileCount > 0);

async function create(): Promise<void> {
  saving.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>('/games', {
      ...form,
      slug: form.slug || slugify(form.name),
    });
    dialog.value = false;
    ElMessage.success('สร้างเกมแล้ว — ขั้นต่อไปคือใส่ข้อความรางวัล');
    void router.push({ name: 'game-edit', params: { id: data.data.id } });
  } finally {
    saving.value = false;
  }
}

// ── Lifecycle ───────────────────────────────────────────────

/** Rewards must equal tiles before the server will open a game; surface that early. */
function readiness(row: any): { ready: boolean; message: string } {
  const rewards = row._count?.rewards ?? 0;
  if (rewards !== row.tileCount) {
    return { ready: false, message: `มีรางวัล ${rewards}/${row.tileCount} รายการ` };
  }
  if ((row.projects?.length ?? 0) === 0) return { ready: false, message: 'ยังไม่ได้เลือกโครงการบริจาค' };
  return { ready: true, message: 'พร้อมเปิด' };
}

async function act(row: any, verb: 'open' | 'close' | 'duplicate', confirmText?: string): Promise<void> {
  if (confirmText) {
    try {
      await ElMessageBox.confirm(confirmText, 'ยืนยัน', {
        type: 'warning', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก',
      });
    } catch {
      return;
    }
  }
  busy.value = row.id;
  try {
    const { data } = await http.post<ApiResponse<any>>(`/games/${row.id}/${verb}`);
    ElMessage.success(data.message ?? 'สำเร็จ');
    await crud.fetchList();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'ทำรายการไม่สำเร็จ');
  } finally {
    busy.value = null;
  }
}

/**
 * Reveal is irreversible and decides real prizes, so it asks the admin to type the
 * game name — a plain OK button is too easy to hit by accident.
 *
 * A real dialog rather than ElMessageBox.prompt: the message needs several lines and
 * MessageBox renders plain text as a single run-on paragraph.
 */
const revealDialog = ref(false);
const revealTarget = ref<any>(null);
const revealTyped = ref('');
// Never matches when no game is targeted, so the confirm button cannot enable itself.
const revealNameMatches = computed(
  () => !!revealTarget.value && revealTyped.value.trim() === revealTarget.value.name,
);

function askReveal(row: any): void {
  const remaining = row.tileCount - (row._count?.reservations ?? 0);
  if (remaining > 0) {
    ElMessage.warning(`ยังเฉลยไม่ได้ เหลืออีก ${remaining} ป้ายที่ยังไม่ถูกจอง`);
    return;
  }
  revealTarget.value = row;
  revealTyped.value = '';
  revealDialog.value = true;
}

async function doReveal(): Promise<void> {
  if (!revealNameMatches.value || !revealTarget.value) return;
  const row = revealTarget.value;
  busy.value = row.id;
  try {
    await http.post(`/games/${row.id}/reveal`);
    ElMessage.success('เฉลยผลเรียบร้อย');
    revealDialog.value = false;
    await crud.fetchList();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'เฉลยผลไม่สำเร็จ');
  } finally {
    busy.value = null;
  }
}

async function remove(row: any): Promise<void> {
  await crud.deleteItem(row.id, row.name);
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>เกมเปิดแผ่นป้าย</h1>
      <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" type="primary" @click="openCreate">+ สร้างเกมใหม่</ElButton>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อเกม…" clearable style="width: 240px" />
        <ElSelect v-model="crud.query.filters.status" placeholder="สถานะ" clearable style="width: 160px">
          <ElOption v-for="s in ['DRAFT', 'OPEN', 'FULL', 'REVEALED']" :key="s" :value="s" :label="statusLabel[s]" />
        </ElSelect>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="เกม" min-width="220">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <div class="text-muted">/game/{{ row.slug }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ความคืบหน้า" min-width="200">
          <template #default="{ row }">
            <ElProgress
              :percentage="Math.round(((row._count?.reservations ?? 0) / row.tileCount) * 100)"
              :color="row.themeColor ?? undefined"
            />
            <span class="text-muted">
              จองแล้ว {{ row._count?.reservations ?? 0 }} จาก {{ row.tileCount }} ป้าย
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="รางวัล" width="110" align="center">
          <template #default="{ row }">
            <!-- Status is not conveyed by colour alone: the ✓/⚠ glyph carries it too. -->
            <span :class="readiness(row).ready ? 'ok' : 'warn'">
              {{ readiness(row).ready ? '✓' : '⚠' }} {{ row._count?.rewards ?? 0 }}/{{ row.tileCount }}
            </span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="สถานะ" width="120" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="statusTag(row.status)">{{ statusLabel[row.status] ?? row.status }}</ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="จัดการ" width="400" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="router.push({ name: 'game-edit', params: { id: row.id } })">แก้ไข</ElButton>
            <ElButton size="small" plain @click="router.push({ name: 'game-results', params: { id: row.id } })">ผล</ElButton>

            <ElTooltip v-if="row.status === 'DRAFT'" :content="readiness(row).message" placement="top">
              <span>
                <ElButton
                  v-permission="PERMISSIONS.GAMES_MANAGE"
                  size="small" type="success" plain
                  :disabled="!readiness(row).ready" :loading="busy === row.id"
                  @click="act(row, 'open', 'เปิดเกมแล้วจะสุ่มจับคู่รางวัลกับป้ายทันที และแก้ไขรางวัลไม่ได้อีกเมื่อมีผู้จอง')"
                >เปิดเกม</ElButton>
              </span>
            </ElTooltip>

            <ElButton
              v-else-if="row.status === 'OPEN'"
              v-permission="PERMISSIONS.GAMES_MANAGE"
              size="small" plain :loading="busy === row.id"
              @click="act(row, 'close', 'ปิดรับจองชั่วคราว ผู้เล่นจะจองป้ายเพิ่มไม่ได้')"
            >ปิดรับจอง</ElButton>

            <ElTooltip
              v-if="row.status !== 'REVEALED' && row.status !== 'DRAFT'"
              :content="row.tileCount - (row._count?.reservations ?? 0) > 0
                ? `เหลืออีก ${row.tileCount - (row._count?.reservations ?? 0)} ป้าย`
                : 'พร้อมเฉลย'"
              placement="top"
            >
              <span>
                <ElButton
                  v-permission="PERMISSIONS.GAMES_REVEAL"
                  size="small" type="warning"
                  :disabled="row.tileCount - (row._count?.reservations ?? 0) > 0"
                  :loading="busy === row.id"
                  @click="askReveal(row)"
                >เฉลยผล</ElButton>
              </span>
            </ElTooltip>

            <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" size="small" plain :loading="busy === row.id" @click="act(row, 'duplicate')">คัดลอก</ElButton>
            <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" size="small" type="danger" text @click="remove(row)">ลบ</ElButton>
          </template>
        </ElTableColumn>

        <template #empty>
          <div class="empty">
            <div class="empty-icon">🎲</div>
            <p>ยังไม่มีเกม</p>
            <ElButton v-permission="PERMISSIONS.GAMES_MANAGE" type="primary" @click="openCreate">สร้างเกมแรก</ElButton>
          </div>
        </template>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt"
        layout="prev, pager, next, total"
        :total="crud.meta.value.total"
        :page-size="crud.query.limit"
      />
    </ElCard>

    <!-- Reveal confirmation -->
    <ElDialog v-model="revealDialog" title="ยืนยันการเฉลยผล" width="520px" align-center>
      <template v-if="revealTarget">
        <ElAlert
          type="warning" show-icon :closable="false"
          title="การเฉลยผลย้อนกลับไม่ได้"
          description="เมื่อกดแล้ว ผู้เล่นทุกคนจะเห็นผลรางวัลทันที และผลจะไม่เปลี่ยนแปลงอีก"
        />

        <ElDescriptions :column="1" border size="small" class="mt">
          <ElDescriptionsItem label="เกม">{{ revealTarget.name }}</ElDescriptionsItem>
          <ElDescriptionsItem label="จำนวนป้าย">
            {{ revealTarget.tileCount }} ป้าย · จองครบแล้วทุกใบ
          </ElDescriptionsItem>
        </ElDescriptions>

        <div class="confirm-field">
          <label for="reveal-confirm">
            พิมพ์ชื่อเกม <b>{{ revealTarget.name }}</b> เพื่อยืนยัน
          </label>
          <ElInput
            id="reveal-confirm"
            v-model="revealTyped"
            placeholder="พิมพ์ชื่อเกมให้ตรงทุกตัวอักษร"
            @keyup.enter="doReveal"
          />
          <!-- Feedback is text, not just a colour, so the state is unambiguous. -->
          <div v-if="revealTyped && !revealNameMatches" class="hint err">✕ ชื่อเกมไม่ตรง</div>
          <div v-else-if="revealNameMatches" class="hint ok">✓ ชื่อตรงแล้ว</div>
        </div>
      </template>

      <template #footer>
        <ElButton @click="revealDialog = false">ยกเลิก</ElButton>
        <ElButton
          type="warning"
          :disabled="!revealNameMatches"
          :loading="busy === revealTarget?.id"
          @click="doReveal"
        >เฉลยผล</ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="dialog" title="สร้างเกมใหม่" width="640px">
      <ElForm label-position="top">
        <ElRow :gutter="12">
          <ElCol :span="14"><ElFormItem label="ชื่อเกม" required><ElInput v-model="form.name" /></ElFormItem></ElCol>
          <ElCol :span="10"><ElFormItem label="Slug"><ElInput v-model="form.slug" :placeholder="slugify(form.name)" /></ElFormItem></ElCol>
        </ElRow>
        <ElFormItem label="คำอธิบาย"><ElInput v-model="form.description" type="textarea" :rows="2" /></ElFormItem>
        <ElRow :gutter="12">
          <ElCol :span="8">
            <ElFormItem label="จำนวนป้าย" required>
              <ElInputNumber v-model="form.tileCount" :min="1" :max="1000" style="width: 100%" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="8">
            <ElFormItem label="Token ต่อ 1 ป้าย">
              <ElInputNumber v-model="form.tokensPerTile" :min="1" :max="100" style="width: 100%" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="8">
            <ElFormItem label="จองได้สูงสุด/บัญชี">
              <ElInputNumber v-model="form.maxTilesPerAccount" :min="1" placeholder="ไม่จำกัด" style="width: 100%" />
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElFormItem label="โครงการบริจาคที่ใช้ token กับเกมนี้ได้">
          <ElSelect v-model="form.projectIds" multiple style="width: 100%" placeholder="เลือกอย่างน้อย 1 โครงการ">
            <ElOption
              v-for="p in projects" :key="p.id" :value="p.id"
              :label="p.tokenValue ? `${p.name} — 1 token = ${p.tokenValue} บาท` : `${p.name} (ยังไม่ตั้งค่า token)`"
            />
          </ElSelect>
          <div class="text-muted hint">โครงการที่ยังไม่ตั้งมูลค่าต่อ token จะไม่ออก token ให้ผู้บริจาค</div>
        </ElFormItem>
        <ElRow :gutter="12">
          <ElCol :span="12"><ElFormItem label="สีธีม"><ElColorPicker v-model="form.themeColor" /></ElFormItem></ElCol>
          <ElCol :span="12">
            <ElFormItem label="แสดงชื่อผู้จองก่อนเฉลย">
              <ElSwitch v-model="form.showReserverNames" active-text="แสดง" inactive-text="ซ่อน" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="!canSubmit" @click="create">สร้างเกม</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt { margin-top: 12px; }
.hint { font-size: 12px; margin-top: 4px; }
.ok { color: var(--el-color-success); font-weight: 600; }
.warn { color: var(--el-color-warning); font-weight: 600; }
.empty { padding: 32px 0; text-align: center; }
.empty-icon { font-size: 40px; margin-bottom: 8px; }
.confirm-field { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.confirm-field label { font-size: 13px; }
.hint { font-size: 12px; }
.hint.err { color: var(--el-color-danger); }
.hint.ok { color: var(--el-color-success); }
</style>
