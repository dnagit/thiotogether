<script setup lang="ts">
/**
 * Account search and per-account token history.
 *
 * "Account" here is not a login — it is a normalized donation name. The drawer
 * shows grants, the full ledger, and reservations so a support question like
 * "where did my tokens go?" can be answered from one screen.
 */
import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { tagMapper } from '@/utils/elementTypes';
import { formatDateTime, PERMISSIONS, type ApiResponse } from '@cms/shared';

const crud = useCrud<any>({ endpoint: '/tokens/accounts' });
const projects = ref<any[]>([]);
void http
  .get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } })
  .then(({ data }) => (projects.value = data.data));

const reasonTag = tagMapper({
  GRANT: 'success', SPEND: 'warning', REFUND: 'primary', REVOKE: 'danger', ADJUST: 'info',
});
const reasonLabel: Record<string, string> = {
  GRANT: 'ได้รับ', SPEND: 'ใช้ไป', REFUND: 'คืน', REVOKE: 'ยกเลิก', ADJUST: 'ปรับโดยแอดมิน',
};

const drawer = ref(false);
const detail = ref<any>(null);
const detailLoading = ref(false);

async function openDetail(row: any): Promise<void> {
  drawer.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const { data } = await http.get<ApiResponse<any>>(`/tokens/accounts/${row.id}`);
    detail.value = data.data;
  } catch {
    ElMessage.error('โหลดประวัติไม่สำเร็จ');
    drawer.value = false;
  } finally {
    detailLoading.value = false;
  }
}

/**
 * Rehearsal cleanup for one account. Deletes for real and cannot be undone, so it asks for the
 * account name to be typed — the rows here look alike and hitting the wrong one is easy.
 */
const clearing = ref<number | null>(null);

async function clearAccount(row: any): Promise<void> {
  try {
    await ElMessageBox.prompt(
      `ลบ token ประวัติ และการจองป้ายทั้งหมดของ "${row.displayName}" อย่างถาวร กู้คืนไม่ได้` +
        `\n(รายการบริจาคจะไม่ถูกลบ ใช้ปุ่มล้างข้อมูลที่หน้าโครงการแทน)` +
        `\n\nพิมพ์ชื่อบัญชีเพื่อยืนยัน`,
      'ล้าง Token ของบัญชีนี้',
      {
        type: 'warning',
        confirmButtonText: 'ล้างข้อมูล',
        cancelButtonText: 'ยกเลิก',
        inputPlaceholder: row.displayName,
        inputValidator: (value: string) => value?.trim() === row.displayName || 'ชื่อบัญชีไม่ตรง',
      },
    );
  } catch {
    return;
  }

  clearing.value = row.id;
  try {
    const { data } = await http.post<ApiResponse<any>>(`/tokens/accounts/${row.id}/clear`);
    ElMessage.success(data.message ?? 'ล้างข้อมูลแล้ว');
    // The drawer may be showing the account that just lost its history.
    if (detail.value?.id === row.id) drawer.value = false;
    await crud.fetchList();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'ล้างข้อมูลไม่สำเร็จ');
  } finally {
    clearing.value = null;
  }
}

/**
 * The ledger is the source of truth; `spendableTokens` is a mutable cache. If they
 * ever disagree, something wrote a balance without recording history — surface it
 * loudly rather than hiding it.
 */
const reconciles = computed(
  () => !detail.value || detail.value.spendableTokens === detail.value.ledgerSum,
);

/**
 * Manual adjustment. One dialog rather than a chain of MessageBox prompts: the
 * operation needs three related inputs, and a prompt chain both looks broken and
 * gives no way to pick the project.
 */
const adjustDialog = ref(false);
const adjusting = ref(false);
const adjustForm = reactive({ projectId: null as number | null, delta: 0, reason: '' });

const adjustValid = computed(
  () => adjustForm.projectId !== null && adjustForm.delta !== 0 && adjustForm.reason.trim().length >= 3,
);

function openAdjust(): void {
  if (projects.value.length === 0) {
    ElMessage.warning('ยังไม่มีโครงการบริจาคในระบบ');
    return;
  }
  adjustForm.projectId =
    // Default to a project this account already holds tokens in, so a deduction
    // targets the right pool without the admin having to look it up.
    detail.value?.grants?.[0]?.projectId ?? projects.value[0].id;
  adjustForm.delta = 0;
  adjustForm.reason = '';
  adjustDialog.value = true;
}

async function submitAdjust(): Promise<void> {
  if (!adjustValid.value) return;
  adjusting.value = true;
  try {
    const { data } = await http.post<ApiResponse<any>>(
      `/tokens/accounts/${detail.value.account.id}/adjust`,
      { projectId: adjustForm.projectId, delta: adjustForm.delta, reason: adjustForm.reason.trim() },
    );
    ElMessage.success(data.message ?? 'ปรับ token แล้ว');
    adjustDialog.value = false;
    await openDetail(detail.value.account);
    await crud.fetchList();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message ?? 'ปรับ token ไม่สำเร็จ');
  } finally {
    adjusting.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>บัญชีผู้เล่นและ Token</h1>
    </div>

    <ElAlert
      type="info" show-icon :closable="false" class="mb"
      title="บัญชีผู้เล่นไม่ใช่ระบบ Login"
      description="ระบบระบุตัวตนจากชื่อบัญชีที่กรอกในฟอร์มบริจาค ชื่อที่ต่างกันแค่ตัวพิมพ์หรือช่องว่างจะถือเป็นบัญชีเดียวกัน"
    />

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อบัญชี…" clearable style="width: 280px" />
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="ชื่อบัญชี" min-width="200">
          <template #default="{ row }">
            <b>{{ row.displayName }}</b>
            <div class="text-muted mono">{{ row.normalizedName }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Token คงเหลือ" width="150" align="center">
          <template #default="{ row }">
            <ElTag :type="row.spendableTokens > 0 ? 'success' : 'info'" size="large">
              {{ row.spendableTokens }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="บริจาค" width="100" align="center" prop="donationCount" />
        <ElTableColumn label="ป้ายที่จอง" width="110" align="center" prop="reservationCount" />
        <ElTableColumn label="" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" @click="openDetail(row)">ดูประวัติ</ElButton>
            <ElButton
              v-permission="PERMISSIONS.TOKENS_ADJUST"
              size="small" type="danger" plain
              :loading="clearing === row.id"
              @click="clearAccount(row)"
            >ล้าง</ElButton>
          </template>
        </ElTableColumn>
        <template #empty><div class="empty">ยังไม่มีบัญชีผู้เล่น — บัญชีจะถูกสร้างเมื่อมีการบริจาคครั้งแรก</div></template>
      </ElTable>

      <ElPagination
        v-model:current-page="crud.query.page"
        class="mt" layout="prev, pager, next, total"
        :total="crud.meta.value.total" :page-size="crud.query.limit"
      />
    </ElCard>

    <ElDrawer v-model="drawer" title="ประวัติ Token" size="720px">
      <div v-if="detailLoading" v-loading="true" class="loading-block" />
      <template v-else-if="detail">
        <ElDescriptions :column="2" border>
          <ElDescriptionsItem label="ชื่อที่แสดง">{{ detail.account.displayName }}</ElDescriptionsItem>
          <ElDescriptionsItem label="คีย์เปรียบเทียบ"><span class="mono">{{ detail.account.normalizedName }}</span></ElDescriptionsItem>
          <ElDescriptionsItem label="Token คงเหลือ"><b>{{ detail.spendableTokens }}</b></ElDescriptionsItem>
          <ElDescriptionsItem label="ผลรวม Ledger">
            {{ detail.ledgerSum }}
            <ElTag v-if="reconciles" size="small" type="success">✓ ตรงกัน</ElTag>
            <ElTag v-else size="small" type="danger">⚠ ไม่ตรงกัน</ElTag>
          </ElDescriptionsItem>
        </ElDescriptions>

        <ElAlert
          v-if="!reconciles"
          type="error" show-icon :closable="false" class="mt"
          title="ยอดคงเหลือไม่ตรงกับ ledger"
          description="อาจมีการเขียนยอดโดยไม่บันทึกประวัติ กรุณาแจ้งผู้พัฒนา"
        />

        <div class="actions mt">
          <ElButton v-permission="PERMISSIONS.TOKENS_ADJUST" size="small" @click="openAdjust">ปรับ Token ด้วยตนเอง</ElButton>
        </div>

        <h4 class="mt">Token ที่ได้รับ ({{ detail.grants.length }})</h4>
        <ElTable :data="detail.grants" size="small" max-height="220">
          <ElTableColumn label="โครงการ" min-width="140">
            <template #default="{ row }">{{ row.project.name }}</template>
          </ElTableColumn>
          <ElTableColumn label="รายการบริจาค" width="140">
            <template #default="{ row }"><span class="mono">{{ row.donation.donationCode }}</span></template>
          </ElTableColumn>
          <ElTableColumn label="ยอด" width="110" align="right">
            <template #default="{ row }">{{ Number(row.donationAmount).toLocaleString() }}</template>
          </ElTableColumn>
          <ElTableColumn label="ได้/เหลือ" width="100" align="center">
            <template #default="{ row }">{{ row.tokensRemaining }} / {{ row.tokensGranted }}</template>
          </ElTableColumn>
          <ElTableColumn label="เศษ" width="90" align="right">
            <template #default="{ row }">
              <ElTooltip content="เศษเงินที่ไม่ถึง 1 token — ไม่ถูกยกไปรวมกับรายการอื่น" placement="top">
                <span class="text-muted">{{ Number(row.remainderAmount).toLocaleString() }}</span>
              </ElTooltip>
            </template>
          </ElTableColumn>
        </ElTable>

        <h4 class="mt">ประวัติ Ledger ({{ detail.ledger.length }})</h4>
        <ElTable :data="detail.ledger" size="small" max-height="280">
          <ElTableColumn label="เวลา" width="150">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </ElTableColumn>
          <ElTableColumn label="ประเภท" width="130">
            <template #default="{ row }">
              <ElTag size="small" :type="reasonTag(row.reason)">{{ reasonLabel[row.reason] ?? row.reason }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="จำนวน" width="90" align="right">
            <template #default="{ row }">
              <b :class="row.delta > 0 ? 'pos' : 'neg'">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</b>
            </template>
          </ElTableColumn>
          <ElTableColumn label="รายละเอียด" min-width="200">
            <template #default="{ row }">
              {{ row.description ?? '—' }}
              <span v-if="row.actor" class="text-muted"> · โดย {{ row.actor.name }}</span>
            </template>
          </ElTableColumn>
        </ElTable>

        <h4 class="mt">ป้ายที่จอง ({{ detail.reservations.length }})</h4>
        <ElTable :data="detail.reservations" size="small" max-height="220">
          <ElTableColumn label="เกม" min-width="160">
            <template #default="{ row }">{{ row.game.name }}</template>
          </ElTableColumn>
          <ElTableColumn label="ป้าย" width="80" align="center">
            <template #default="{ row }">#{{ row.tile.boardNumber }}</template>
          </ElTableColumn>
          <ElTableColumn label="ชื่อขณะจอง" min-width="140" prop="accountNameSnapshot" />
          <ElTableColumn label="เวลา" width="150">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </ElTableColumn>
          <template #empty><div class="empty">ยังไม่เคยจองป้าย</div></template>
        </ElTable>
      </template>
    </ElDrawer>

    <!-- Manual token adjustment -->
    <ElDialog v-model="adjustDialog" title="ปรับ Token ด้วยตนเอง" width="480px" align-center append-to-body>
      <ElAlert
        type="warning" show-icon :closable="false"
        title="ทุกการปรับถูกบันทึกถาวรใน ledger"
        description="พร้อมชื่อผู้ดำเนินการและเหตุผล และลบออกไม่ได้"
      />

      <ElForm label-position="top" class="mt">
        <ElFormItem label="บัญชี">
          <ElInput :model-value="detail?.account?.displayName" disabled />
        </ElFormItem>

        <ElFormItem label="โครงการ" required>
          <ElSelect v-model="adjustForm.projectId" filterable style="width: 100%">
            <ElOption v-for="p in projects" :key="p.id" :value="p.id" :label="p.name" />
          </ElSelect>
        </ElFormItem>

        <ElFormItem label="จำนวน Token" required>
          <ElInputNumber v-model="adjustForm.delta" :step="1" style="width: 100%" />
          <div class="text-muted hint">
            ค่าบวก = เพิ่มให้ · ค่าลบ = หักออก (หักได้ไม่เกินยอดคงเหลือของโครงการนั้น)
          </div>
        </ElFormItem>

        <ElFormItem label="เหตุผล" required>
          <ElInput
            v-model="adjustForm.reason"
            type="textarea"
            :rows="2"
            maxlength="255"
            show-word-limit
            placeholder="เช่น ชดเชยกรณีโอนซ้ำ"
          />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <ElButton @click="adjustDialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :disabled="!adjustValid" :loading="adjusting" @click="submitAdjust">
          บันทึกการปรับ
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 12px; }
.mt { margin-top: 16px; }
.mono { font-family: monospace; font-size: 12px; }
.pos { color: var(--el-color-success); }
.neg { color: var(--el-color-danger); }
.loading-block { min-height: 240px; }
.empty { padding: 24px; text-align: center; color: var(--el-text-color-secondary); }
.actions { display: flex; gap: 8px; }
.hint { font-size: 12px; line-height: 1.4; margin-top: 4px; }
</style>
