<script setup lang="ts">
/**
 * Every plant in one garden, with what the public cannot see yet: the flower its mix grew,
 * the secret fertiliser it was given, and the face drawn for it.
 *
 * Plants go up without approval, so hiding is the moderation tool — reversible, and the plot
 * stays where it is. Deleting is not reversible from here, so it is confirmed.
 */
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { confirmDelete } from '@/utils/confirm';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const event = ref<any>(null);
const crud = useCrud<any>({ endpoint: `/garden/${id}/plants` });
const busy = ref<number | null>(null);

void http
  .get<ApiResponse<any>>(`/garden/${id}`)
  .then(({ data }) => (event.value = data.data))
  .catch(() => void router.push({ name: 'garden' }));

const websiteUrl = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';

async function setStatus(row: any, status: 'VISIBLE' | 'HIDDEN'): Promise<void> {
  busy.value = row.id;
  try {
    await http.patch(`/garden/plants/${row.id}`, { status });
    ElMessage.success(status === 'VISIBLE' ? 'แสดงในแปลงแล้ว' : 'ซ่อนจากแปลงแล้ว');
    await crud.fetchList();
  } finally {
    busy.value = null;
  }
}

async function remove(row: any): Promise<void> {
  if (!(await confirmDelete(`ต้นที่ ${row.plotIndex} ของ ${row.name}`))) return;
  await http.delete(`/garden/plants/${row.id}`);
  ElMessage.success('ลบแล้ว');
  await crud.fetchList();
}

const purging = ref(false);
async function removeAll(): Promise<void> {
  const confirmed = await confirmDelete('ต้นทั้งหมด', {
    title: 'ลบต้นทั้งหมด',
    note:
      'ต้องการลบต้นทานตะวัน "ทั้งหมด" ของสวนนี้ใช่หรือไม่? ใช้ล้างต้นทดลองก่อนเปิดจริง ' +
      'หมายเลขต้นที่ใช้ไปแล้วจะไม่ถูกนำกลับมาใช้ ถ้ามีต้นที่ซื้อปุ๋ยลับแล้วจะลบทั้งหมดไม่ได้',
    confirmText: 'ลบทั้งหมด',
  });
  if (!confirmed) return;
  purging.value = true;
  try {
    const { data } = await http.delete<ApiResponse<{ count: number }>>(`/garden/${id}/plants`);
    ElMessage.success(`ลบแล้ว ${data.data?.count ?? 0} ต้น`);
    await crud.fetchList();
  } finally {
    purging.value = false;
  }
}

// ── Recovery link ──

const recovery = ref<{ url: string; name: string } | null>(null);
async function makeRecoveryLink(row: any): Promise<void> {
  const ok = await confirmDelete('', {
    title: 'สร้างลิงก์สวนของฉันใหม่',
    note:
      `ลิงก์เดิมของคนปลูกต้นนี้ (${row.name}) จะใช้ไม่ได้ทันที รวมถึงในเครื่องที่ใช้ปลูก ` +
      'ใช้เมื่อเจ้าของแจ้งว่าเปิดสวนของตัวเองไม่ได้เท่านั้น',
    confirmText: 'สร้างลิงก์ใหม่',
  });
  if (!ok) return;
  const { data } = await http.post<ApiResponse<{ slug: string; key: string }>>(
    `/garden/plants/${row.id}/recovery-link`,
  );
  recovery.value = {
    name: row.name,
    url: `${websiteUrl}/garden/mine/${data.data.slug}#key=${data.data.key}`,
  };
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('คัดลอกแล้ว');
  } catch {
    ElMessage.warning('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
  }
}

// ── Secret fix ──

const fixing = ref<any | null>(null);
const fixDesignId = ref<number | null>(null);
function openFix(row: any): void {
  fixing.value = row;
  fixDesignId.value = row.secretDesignId;
}
async function saveFix(): Promise<void> {
  await http.patch(`/garden/plants/${fixing.value.id}/secret`, {
    secretDesignId: fixDesignId.value,
  });
  ElMessage.success('แก้แบบดอกปุ๋ยลับแล้ว');
  fixing.value = null;
  await crud.fetchList();
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>ต้นทานตะวัน{{ event ? ` — ${event.title}` : '' }}</h1>
      <div>
        <ElButton @click="router.push({ name: 'garden' })">กลับ</ElButton>
        <ElButton plain @click="router.push({ name: 'garden-edit', params: { id } })"
          >ตั้งค่าสวน</ElButton
        >
      </div>
    </div>

    <ElCard>
      <div class="toolbar">
        <ElInput
          v-model="crud.query.search"
          placeholder="ค้นหาชื่อคนปลูก…"
          clearable
          style="width: 220px"
        />
        <ElSelect
          v-model="crud.query.filters.status"
          placeholder="ทุกสถานะ"
          clearable
          style="width: 160px"
        >
          <ElOption label="แสดงในแปลง" value="VISIBLE" />
          <ElOption label="ซ่อนอยู่" value="HIDDEN" />
        </ElSelect>
        <span class="spacer" />
        <ElButton
          v-permission="PERMISSIONS.GARDEN_MANAGE"
          type="danger"
          plain
          :loading="purging"
          @click="removeAll"
        >
          ลบต้นทั้งหมด
        </ElButton>
      </div>

      <ElTable v-loading="crud.loading.value" :data="crud.items.value">
        <ElTableColumn label="ต้นที่" width="70" align="center" prop="plotIndex" />
        <ElTableColumn label="คนปลูก / คำอธิษฐาน" min-width="260">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <div class="message">{{ row.message }}</div>
            <div class="text-muted small">{{ formatDate(row.createdAt) }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="ปุ๋ย" width="170">
          <template #default="{ row }">
            <div v-for="f in row.fertilizers" :key="f.id" class="mix">
              <span class="dot" :style="{ background: f.fertilizer.color }" />{{
                f.fertilizer.name
              }}
              {{ f.pct }}%
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="ดอกจากสูตร" width="150">
          <template #default="{ row }">
            <div class="flower">
              <img v-if="row.design?.imageUrl" :src="row.design.imageUrl" alt="" />
              <div>
                <div>{{ row.design?.name ?? 'แบบตั้งต้น' }}</div>
                <div class="text-muted small">
                  {{ row.recipe ? row.recipe.name || `สูตร #${row.recipe.id}` : 'ไม่เข้าสูตร' }}
                </div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="ปุ๋ยลับ" width="190">
          <template #default="{ row }">
            <div v-if="row.secretDesign" class="flower">
              <img :src="row.secretDesign.imageUrl" alt="" />
              <div>
                <div>{{ row.secretDesign.name }}</div>
                <div v-if="row.purchase" class="text-muted small">
                  {{ row.purchase.accountNameSnapshot }} · {{ row.purchase.tokensSpent }} token
                </div>
              </div>
              <img v-if="row.face" :src="row.face.imageUrl" alt="" class="face" />
            </div>
            <span v-else class="text-muted">—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="สถานะ" width="110" align="center">
          <template #default="{ row }">
            <ElTag size="small" :type="row.status === 'VISIBLE' ? 'success' : 'info'">
              {{ row.status === 'VISIBLE' ? 'แสดง' : 'ซ่อน' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="จัดการ" width="230" fixed="right">
          <template #default="{ row }">
            <div v-permission="PERMISSIONS.GARDEN_MANAGE" class="actions">
              <ElButton
                v-if="row.status === 'VISIBLE'"
                size="small"
                :loading="busy === row.id"
                @click="setStatus(row, 'HIDDEN')"
              >
                ซ่อน
              </ElButton>
              <ElButton
                v-else
                size="small"
                :loading="busy === row.id"
                @click="setStatus(row, 'VISIBLE')"
              >
                แสดง
              </ElButton>
              <ElButton size="small" type="danger" plain @click="remove(row)">ลบ</ElButton>
              <ElDropdown trigger="click">
                <ElButton size="small" text>เพิ่มเติม ▾</ElButton>
                <template #dropdown>
                  <ElDropdownMenu>
                    <ElDropdownItem @click="makeRecoveryLink(row)"
                      >สร้างลิงก์สวนของฉันใหม่</ElDropdownItem
                    >
                    <ElDropdownItem v-if="row.purchase" @click="openFix(row)"
                      >แก้แบบดอกปุ๋ยลับ</ElDropdownItem
                    >
                  </ElDropdownMenu>
                </template>
              </ElDropdown>
            </div>
          </template>
        </ElTableColumn>
      </ElTable>

      <div v-if="!crud.loading.value && !crud.items.value.length" class="empty">
        <div class="empty-icon">🌱</div>
        <p>ยังไม่มีใครปลูก</p>
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

    <ElDialog
      :model-value="!!recovery"
      title="ลิงก์สวนของฉันใหม่"
      width="520px"
      @close="recovery = null"
    >
      <template v-if="recovery">
        <p>
          ส่งลิงก์นี้ให้ {{ recovery.name }} เปิดในเครื่องที่ต้องการ ลิงก์นี้เปิดสวนของเขาได้ทุกต้น
          อย่าโพสต์สาธารณะ
        </p>
        <ElInput :model-value="recovery.url" readonly />
      </template>
      <template #footer>
        <ElButton @click="recovery = null">ปิด</ElButton>
        <ElButton type="primary" @click="copy(recovery!.url)">คัดลอก</ElButton>
      </template>
    </ElDialog>

    <ElDialog :model-value="!!fixing" title="แก้แบบดอกปุ๋ยลับ" width="420px" @close="fixing = null">
      <p class="text-muted small">
        ใช้ในกรณีพิเศษเท่านั้น token ที่จ่ายไปไม่เปลี่ยน และการแก้จะถูกบันทึกใน Audit Logs
      </p>
      <ElSelect v-model="fixDesignId" style="width: 100%">
        <ElOption
          v-for="d in event?.designs.filter((x: any) => x.onShelf) ?? []"
          :key="d.id"
          :label="d.name"
          :value="d.id"
        />
      </ElSelect>
      <template #footer>
        <ElButton @click="fixing = null">ยกเลิก</ElButton>
        <ElButton type="primary" @click="saveFix">บันทึก</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt {
  margin-top: 12px;
}
.small {
  font-size: 12px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.spacer {
  flex: 1;
}
.message {
  white-space: pre-wrap;
  margin: 4px 0;
  font-size: 13px;
}
.mix {
  font-size: 12px;
  white-space: nowrap;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}
.flower {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.flower img {
  width: 32px;
  height: 42px;
  object-fit: contain;
}
.flower .face {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}
.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.empty {
  padding: 32px 0;
  text-align: center;
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}
</style>
