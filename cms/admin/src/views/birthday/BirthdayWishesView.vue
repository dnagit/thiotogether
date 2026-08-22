<script setup lang="ts">
/**
 * Moderation for one event's wishes.
 *
 * Each row shows what the public would see — the photo as uploaded, the message in full,
 * and the gift — because that is what the decision is about. Approving and rejecting are
 * both reversible, so neither is confirmed; deleting is not, so it is.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { tagMapper } from '@/utils/elementTypes';
import { confirmDelete } from '@/utils/confirm';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const event = ref<any>(null);
const crud = useCrud<any>({ endpoint: `/birthday/${id}/wishes` });
const busy = ref<number | null>(null);

void http
  .get<ApiResponse<any>>(`/birthday/${id}`)
  .then(({ data }) => (event.value = data.data))
  .catch(() => void router.push({ name: 'birthday' }));

const statusTag = tagMapper({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'info' });
const statusLabel: Record<string, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'ขึ้นกำแพงแล้ว',
  REJECTED: 'ไม่อนุมัติ',
};

/** Only worth saying when the event actually holds wishes back. */
const approvalNote = computed(() =>
  event.value?.requiresApproval
    ? 'งานนี้ตั้งค่าให้ตรวจก่อน — คำอวยพรใหม่จะอยู่ในสถานะ "รออนุมัติ" จนกว่าจะกดอนุมัติ'
    : 'งานนี้ไม่ได้ตั้งค่าให้ตรวจก่อน — คำอวยพรใหม่จะขึ้นกำแพงทันที',
);

async function setStatus(row: any, status: 'APPROVED' | 'REJECTED'): Promise<void> {
  busy.value = row.id;
  try {
    await http.patch(`/birthday/wishes/${row.id}`, { status });
    ElMessage.success(status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ซ่อนจากกำแพงแล้ว');
    await crud.fetchList();
  } finally {
    busy.value = null;
  }
}

const purging = ref(false);

/**
 * Clears the whole wall for this event.
 *
 * The confirm spells out that the toolbar filters do not narrow it: the request always takes every
 * wish in the event, including the ones the current search or status filter is hiding, which is not
 * what the table in front of the editor implies.
 */
async function removeAll(): Promise<void> {
  const confirmed = await confirmDelete('คำอวยพรทั้งหมด', {
    title: 'ลบคำอวยพรทั้งหมด',
    note:
      'ต้องการลบคำอวยพร "ทั้งหมด" ของงานนี้ใช่หรือไม่? ตัวกรองในหน้านี้ไม่มีผล — ระบบจะลบทุกรายการในงาน ' +
      'รวมทั้งที่รออนุมัติและที่ซ่อนไว้ ผู้ดูแลระบบสามารถกู้คืนได้ภายหลัง',
    confirmText: 'ลบทั้งหมด',
  });
  if (!confirmed) return;
  purging.value = true;
  try {
    const { data } = await http.delete<ApiResponse<{ count: number }>>(`/birthday/${id}/wishes`);
    ElMessage.success(`ลบแล้ว ${data.data?.count ?? 0} รายการ`);
    await crud.fetchList();
  } finally {
    purging.value = false;
  }
}

async function remove(row: any): Promise<void> {
  const confirmed = await confirmDelete(`คำอวยพรจาก ${row.name}`, {
    note: `ต้องการลบคำอวยพรจาก "${row.name}" ใช่หรือไม่? ผู้ดูแลระบบสามารถกู้คืนได้ภายหลัง`,
  });
  if (!confirmed) return;
  await http.delete(`/birthday/wishes/${row.id}`);
  ElMessage.success('ลบแล้ว');
  await crud.fetchList();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>คำอวยพร — {{ event?.title ?? '' }}</h1>
      <div>
        <ElButton @click="router.push({ name: 'birthday' })">กลับ</ElButton>
        <ElButton plain @click="router.push({ name: 'birthday-edit', params: { id } })">ตั้งค่างาน</ElButton>
      </div>
    </div>

    <ElAlert v-if="event" class="mb" type="info" :closable="false" :title="approvalNote" />

    <ElCard>
      <div class="toolbar">
        <ElInput v-model="crud.query.search" placeholder="ค้นหาชื่อผู้ส่ง…" clearable style="width: 240px" />
        <ElSelect v-model="crud.query.filters.status" placeholder="สถานะ" clearable style="width: 180px">
          <ElOption v-for="s in ['PENDING', 'APPROVED', 'REJECTED']" :key="s" :value="s" :label="statusLabel[s]" />
        </ElSelect>
        <ElButton
          v-permission="PERMISSIONS.BIRTHDAY_MODERATE"
          class="purge"
          type="danger"
          plain
          :loading="purging"
          @click="removeAll"
        >
          ลบคำอวยพรทั้งหมด
        </ElButton>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="รูป" width="90" align="center">
          <template #default="{ row }">
            <ElImage
              v-if="row.photoUrl"
              :src="row.photoUrl"
              :preview-src-list="[row.photoUrl]"
              preview-teleported
              fit="cover"
              class="thumb"
            />
            <span v-else class="text-muted">—</span>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ผู้ส่ง" width="160">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <div class="text-muted">{{ new Date(row.createdAt).toLocaleString('th-TH') }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="คำอวยพร" min-width="260">
          <template #default="{ row }"><div class="message">{{ row.message }}</div></template>
        </ElTableColumn>

        <ElTableColumn label="ลูกโป่ง" width="120" align="center">
          <template #default="{ row }">
            <span class="swatch" :style="{ background: row.balloonColor }" aria-hidden="true" />
            <div class="text-muted">{{ row.balloonShape }}</div>
          </template>
        </ElTableColumn>

        <ElTableColumn label="ของขวัญ" width="150">
          <template #default="{ row }">{{ row.gift?.name ?? '—' }}</template>
        </ElTableColumn>

        <ElTableColumn label="สถานะ" width="130" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="statusTag(row.status)">{{ statusLabel[row.status] ?? row.status }}</ElTag>
          </template>
        </ElTableColumn>

        <ElTableColumn label="จัดการ" width="240" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="row.status !== 'APPROVED'"
              v-permission="PERMISSIONS.BIRTHDAY_MODERATE"
              size="small"
              type="success"
              plain
              :loading="busy === row.id"
              @click="setStatus(row, 'APPROVED')"
            >
              อนุมัติ
            </ElButton>
            <ElButton
              v-if="row.status !== 'REJECTED'"
              v-permission="PERMISSIONS.BIRTHDAY_MODERATE"
              size="small"
              plain
              :loading="busy === row.id"
              @click="setStatus(row, 'REJECTED')"
            >
              ซ่อน
            </ElButton>
            <ElButton
              v-permission="PERMISSIONS.BIRTHDAY_MODERATE"
              size="small"
              type="danger"
              text
              @click="remove(row)"
            >
              ลบ
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div v-if="!crud.loading.value && !crud.items.value.length" class="empty">
        <div class="empty-icon">🎈</div>
        <p>ยังไม่มีคำอวยพรในงานนี้</p>
      </div>

      <ElPagination
        v-if="crud.meta.value.total > crud.meta.value.limit"
        class="mt"
        layout="total, prev, pager, next"
        :total="crud.meta.value.total"
        :page-size="crud.meta.value.limit"
        :current-page="crud.query.page"
        @current-change="crud.query.page = $event"
      />
    </ElCard>
  </div>
</template>

<style scoped>
/* Pushed away from the filters: it acts on the whole event, not on what they narrowed to. */
.purge { margin-left: auto; }
.mb { margin-bottom: 16px; }
.mt { margin-top: 12px; }
.thumb { width: 56px; height: 56px; border-radius: 8px; }
.message { white-space: pre-line; line-height: 1.5; }
.swatch {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
}
.empty { padding: 32px 0; text-align: center; }
.empty-icon { font-size: 40px; margin-bottom: 8px; }
</style>
