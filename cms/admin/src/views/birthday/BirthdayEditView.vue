<script setup lang="ts">
/**
 * Event settings and the two catalogues: presents to tie under a balloon, and artwork for
 * the card a wish becomes.
 *
 * Each is saved as a whole list, matching the API: rows carry their id so an existing entry
 * keeps its identity (and the wishes attached to it) through a reorder or a rename, while a
 * new row has none and is created.
 *
 * Retiring an entry is offered as "ปิดใช้งาน" as well as delete, because a deleted one
 * disappears from the picker but the wishes that already chose it keep showing it — the
 * toggle makes that the obvious move rather than a surprise.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

/** Both catalogues are the same row; only a background insists on having a picture. */
interface CatalogueRow {
  id?: number;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
}

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const event = ref<any>(null);
const gifts = ref<CatalogueRow[]>([]);
const backgrounds = ref<CatalogueRow[]>([]);

const toRows = (list: any[]): CatalogueRow[] =>
  list.map((row) => ({ id: row.id, name: row.name, imageUrl: row.imageUrl, isActive: row.isActive }));
const loading = ref(true);
const saving = ref(false);

const websiteUrl = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';
const wallUrl = computed(() => `${websiteUrl}/birthday/${event.value?.slug ?? ''}`);
const formUrl = computed(() => `${websiteUrl}/birthday/wish/${event.value?.slug ?? ''}`);

void http
  .get<ApiResponse<any>>(`/birthday/${id}`)
  .then(({ data }) => {
    event.value = data.data;
    gifts.value = toRows(data.data.gifts);
    backgrounds.value = toRows(data.data.backgrounds ?? []);
  })
  .catch(() => void router.push({ name: 'birthday' }))
  .finally(() => (loading.value = false));

async function saveEvent(): Promise<void> {
  saving.value = true;
  try {
    const { title, slug, celebrantName, description, coverImage, themeColor, isOpen, isActive, requiresApproval } =
      event.value;
    await http.put(`/birthday/${id}`, {
      title, slug, celebrantName, description, coverImage, themeColor, isOpen, isActive, requiresApproval,
    });
    ElMessage.success('บันทึกแล้ว');
  } finally {
    saving.value = false;
  }
}

async function saveGifts(): Promise<void> {
  if (gifts.value.some((g) => !g.name.trim())) {
    ElMessage.warning('กรุณาใส่ชื่อของขวัญให้ครบทุกช่อง');
    return;
  }
  saving.value = true;
  try {
    const { data } = await http.put<ApiResponse<any>>(`/birthday/${id}/gifts`, { gifts: gifts.value });
    // Re-read so newly created rows come back with their ids; without this a second
    // save would create duplicates instead of updating what was just added.
    gifts.value = toRows(data.data.gifts);
    ElMessage.success('บันทึกของขวัญแล้ว');
  } finally {
    saving.value = false;
  }
}

async function saveBackgrounds(): Promise<void> {
  if (backgrounds.value.some((b) => !b.name.trim())) {
    ElMessage.warning('กรุณาใส่ชื่อพื้นหลังให้ครบทุกช่อง');
    return;
  }
  // The API rejects a background with no picture, so it is caught here where the empty
  // row is still on screen and obvious.
  if (backgrounds.value.some((b) => !b.imageUrl)) {
    ElMessage.warning('กรุณาเลือกรูปพื้นหลังให้ครบทุกแถว');
    return;
  }
  saving.value = true;
  try {
    const { data } = await http.put<ApiResponse<any>>(`/birthday/${id}/backgrounds`, {
      backgrounds: backgrounds.value,
    });
    backgrounds.value = toRows(data.data.backgrounds);
    ElMessage.success('บันทึกพื้นหลังการ์ดแล้ว');
  } finally {
    saving.value = false;
  }
}

function addRow(list: CatalogueRow[]): void {
  list.push({ name: '', imageUrl: null, isActive: true });
}
function removeRow(list: CatalogueRow[], index: number): void {
  list.splice(index, 1);
}
function move(list: CatalogueRow[], index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [row] = list.splice(index, 1);
  list.splice(target, 0, row);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('คัดลอกลิงก์แล้ว');
  } catch {
    ElMessage.warning('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง');
  }
}
</script>

<template>
  <div v-loading="loading" class="page-container">
    <div class="page-header">
      <h1>{{ event?.title ?? 'กำลังโหลด…' }}</h1>
      <div>
        <ElButton @click="router.push({ name: 'birthday' })">กลับ</ElButton>
        <ElButton plain @click="router.push({ name: 'birthday-wishes', params: { id } })">ดูคำอวยพร</ElButton>
      </div>
    </div>

    <template v-if="event">
      <ElCard class="mb">
        <template #header><b>ลิงก์สำหรับผู้ร่วมงาน</b></template>
        <div class="link-row">
          <span class="link-label">หน้าเขียนคำอวยพร</span>
          <ElInput :model-value="formUrl" readonly />
          <ElButton @click="copy(formUrl)">คัดลอก</ElButton>
        </div>
        <div class="link-row">
          <span class="link-label">หน้ากำแพงลูกโป่ง</span>
          <ElInput :model-value="wallUrl" readonly />
          <ElButton @click="copy(wallUrl)">คัดลอก</ElButton>
        </div>
      </ElCard>

      <ElCard class="mb">
        <template #header><b>รายละเอียดงาน</b></template>
        <ElForm label-position="top">
          <ElRow :gutter="16">
            <ElCol :span="12">
              <ElFormItem label="ชื่องาน"><ElInput v-model="event.title" /></ElFormItem>
            </ElCol>
            <ElCol :span="12">
              <ElFormItem label="Slug (ใช้ใน URL)"><ElInput v-model="event.slug" /></ElFormItem>
            </ElCol>
            <ElCol :span="12">
              <ElFormItem label="ชื่อเจ้าของวันเกิด"><ElInput v-model="event.celebrantName" /></ElFormItem>
            </ElCol>
            <ElCol :span="12">
              <ElFormItem label="สีหลักของงาน"><ElColorPicker v-model="event.themeColor" /></ElFormItem>
            </ElCol>
            <ElCol :span="24">
              <ElFormItem label="คำอธิบาย">
                <ElInput v-model="event.description" type="textarea" :rows="3" />
              </ElFormItem>
            </ElCol>
            <ElCol :span="12">
              <ElFormItem label="ภาพหน้าปก (ใช้ตอนแชร์ลิงก์)">
                <MediaPicker v-model="event.coverImage" />
              </ElFormItem>
            </ElCol>
          </ElRow>

          <ElFormItem label="การเปิดรับ">
            <div class="switches">
              <ElSwitch v-model="event.isActive" active-text="เปิดใช้งานหน้านี้บนเว็บไซต์" />
              <ElSwitch v-model="event.isOpen" active-text="เปิดรับคำอวยพรใหม่" />
              <ElSwitch v-model="event.requiresApproval" active-text="ต้องให้ผู้ดูแลอนุมัติก่อนขึ้นกำแพง" />
            </div>
            <div class="hint text-muted">
              ปิด "เปิดรับคำอวยพรใหม่" จะปิดเฉพาะฟอร์ม กำแพงลูกโป่งยังดูได้ตามปกติ
            </div>
          </ElFormItem>
        </ElForm>

        <ElButton v-permission="PERMISSIONS.BIRTHDAY_MANAGE" type="primary" :loading="saving" @click="saveEvent">
          บันทึกรายละเอียด
        </ElButton>
      </ElCard>

      <ElCard class="mb">
        <template #header>
          <div class="card-header">
            <b>ของขวัญให้เลือก</b>
            <span class="text-muted">ผู้ร่วมงานจะเลือกหนึ่งชิ้นมาผูกใต้ลูกโป่ง</span>
          </div>
        </template>

        <ElTable :data="gifts" size="small">
          <ElTableColumn label="ลำดับ" width="110" align="center">
            <template #default="{ $index }">
              <ElButton size="small" text :disabled="$index === 0" @click="move(gifts, $index, -1)">↑</ElButton>
              <ElButton size="small" text :disabled="$index === gifts.length - 1" @click="move(gifts, $index, 1)">↓</ElButton>
            </template>
          </ElTableColumn>
          <ElTableColumn label="ชื่อของขวัญ" min-width="200">
            <template #default="{ row }"><ElInput v-model="row.name" placeholder="เช่น เค้กวันเกิด" /></template>
          </ElTableColumn>
          <ElTableColumn label="รูป" width="220">
            <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
          </ElTableColumn>
          <ElTableColumn label="เปิดใช้" width="100" align="center">
            <template #default="{ row }"><ElSwitch v-model="row.isActive" /></template>
          </ElTableColumn>
          <ElTableColumn label="" width="80" align="center">
            <template #default="{ $index }">
              <ElButton size="small" type="danger" text @click="removeRow(gifts, $index)">ลบ</ElButton>
            </template>
          </ElTableColumn>
        </ElTable>

        <div v-if="!gifts.length" class="empty">
          <div class="empty-icon">🎁</div>
          <p>ยังไม่มีของขวัญ — เพิ่มอย่างน้อยหนึ่งชิ้นก่อนเปิดให้คนเขียนคำอวยพร</p>
        </div>

        <div class="mt">
          <ElButton @click="addRow(gifts)">+ เพิ่มของขวัญ</ElButton>
          <ElButton v-permission="PERMISSIONS.BIRTHDAY_MANAGE" type="primary" :loading="saving" @click="saveGifts">
            บันทึกของขวัญ
          </ElButton>
        </div>
        <div class="hint text-muted mt">
          ของขวัญที่ถูกลบจะหายจากตัวเลือก แต่คำอวยพรที่เลือกไว้แล้วยังแสดงของขวัญเดิมต่อไป
        </div>
      </ElCard>

      <ElCard>
        <template #header>
          <div class="card-header">
            <b>พื้นหลังการ์ด</b>
            <span class="text-muted">ผู้ร่วมงานจะเลือกหนึ่งแบบเป็นพื้นหลังการ์ดอวยพรของตัวเอง</span>
          </div>
        </template>

        <ElTable :data="backgrounds" size="small">
          <ElTableColumn label="ลำดับ" width="110" align="center">
            <template #default="{ $index }">
              <ElButton size="small" text :disabled="$index === 0" @click="move(backgrounds, $index, -1)">↑</ElButton>
              <ElButton size="small" text :disabled="$index === backgrounds.length - 1" @click="move(backgrounds, $index, 1)">↓</ElButton>
            </template>
          </ElTableColumn>
          <ElTableColumn label="ชื่อแบบ" min-width="200">
            <template #default="{ row }"><ElInput v-model="row.name" placeholder="เช่น ลายคอนเฟตติ" /></template>
          </ElTableColumn>
          <ElTableColumn label="รูปพื้นหลัง" width="220">
            <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
          </ElTableColumn>
          <ElTableColumn label="เปิดใช้" width="100" align="center">
            <template #default="{ row }"><ElSwitch v-model="row.isActive" /></template>
          </ElTableColumn>
          <ElTableColumn label="" width="80" align="center">
            <template #default="{ $index }">
              <ElButton size="small" type="danger" text @click="removeRow(backgrounds, $index)">ลบ</ElButton>
            </template>
          </ElTableColumn>
        </ElTable>

        <div v-if="!backgrounds.length" class="empty">
          <div class="empty-icon">🖼️</div>
          <p>ยังไม่มีพื้นหลัง — ถ้าไม่เพิ่ม ทุกคนจะได้การ์ดพื้นสีเรียบตามสีลูกโป่ง</p>
        </div>

        <div class="mt">
          <ElButton @click="addRow(backgrounds)">+ เพิ่มพื้นหลัง</ElButton>
          <ElButton v-permission="PERMISSIONS.BIRTHDAY_MANAGE" type="primary" :loading="saving" @click="saveBackgrounds">
            บันทึกพื้นหลัง
          </ElButton>
        </div>
        <div class="hint text-muted mt">
          แนะนำรูปแนวตั้งอัตราส่วนราว 4:5 (เช่น 1440×1800) — การ์ดจะครอบรูปให้เต็มและเคลือบสีขาวบาง ๆ
          ทับไว้เพื่อให้อ่านข้อความออก
        </div>
      </ElCard>

    </template>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 16px; }
.mt { margin-top: 12px; }
.hint { font-size: 12px; }
.card-header { display: flex; align-items: baseline; gap: 12px; }
.switches { display: flex; flex-direction: column; gap: 8px; }
.link-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.link-label { width: 150px; flex: none; font-size: 13px; }
.empty { padding: 24px 0; text-align: center; }
.empty-icon { font-size: 36px; margin-bottom: 8px; }
</style>
