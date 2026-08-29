<script setup lang="ts">
/**
 * Projects — the edit page: the cover, the gallery, the write-up and the SEO.
 *
 * The gallery borrows the page builder's repeating-row editor rather than growing another
 * copy of the same add/remove/pick-an-image UI.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import BlockPropsEditor from '@/components/BlockPropsEditor.vue';
import type { BlockField } from '@/blocks/definitions';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const canManage = auth.can(PERMISSIONS.PROJECTS_MANAGE);

const id = Number(route.params.id);
const loading = ref(true);
const saving = ref(false);

const project = reactive<Record<string, any>>({
  title: '',
  slug: '',
  summary: '',
  description: '',
  coverImage: '',
  images: [],
  eventDate: null,
  isActive: true,
  sortOrder: 0,
  metaTitle: '',
  metaDescription: '',
});

/** The gallery's rows, described the way `BlockPropsEditor` expects them. */
const galleryFields: BlockField[] = [
  {
    key: 'images',
    label: 'รูปในแกลเลอรี',
    type: 'items',
    itemFields: [
      { key: 'url', label: 'รูป', type: 'image' },
      { key: 'caption', label: 'คำบรรยาย', type: 'text' },
    ],
  },
];

const siteUrl = computed(() => import.meta.env.VITE_SITE_URL || window.location.origin);
const publicUrl = computed(() => `${siteUrl.value}/projects/${project.slug}`);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<any>>(`/projects/${id}`);
    Object.assign(project, data.data, {
      // Null from the API, but the controls below want values they can bind to.
      images: Array.isArray(data.data.images) ? data.data.images : [],
      summary: data.data.summary ?? '',
      description: data.data.description ?? '',
      coverImage: data.data.coverImage ?? '',
      metaTitle: data.data.metaTitle ?? '',
      metaDescription: data.data.metaDescription ?? '',
    });
  } finally {
    loading.value = false;
  }
}
void load();

async function save(): Promise<void> {
  saving.value = true;
  try {
    await http.put(`/projects/${id}`, {
      title: project.title,
      slug: project.slug,
      summary: project.summary || null,
      description: project.description || null,
      coverImage: project.coverImage || null,
      // Rows the editor added but nobody filled in never reach the site.
      images: (project.images ?? []).filter((i: any) => i?.url),
      eventDate: project.eventDate || null,
      isActive: project.isActive,
      sortOrder: Number(project.sortOrder) || 0,
      metaTitle: project.metaTitle || null,
      metaDescription: project.metaDescription || null,
    });
    ElMessage.success('บันทึกแล้ว');
  } finally {
    saving.value = false;
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('คัดลอกลิงก์แล้ว');
  } catch {
    ElMessage.warning('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยตัวเอง');
  }
}
</script>

<template>
  <div v-loading="loading" class="page-container">
    <div class="page-header">
      <h1>ตั้งค่าโปรเจกต์</h1>
      <div>
        <ElButton @click="router.push({ name: 'projects' })">กลับ</ElButton>
        <ElButton v-if="canManage" type="primary" :loading="saving" @click="save">บันทึก</ElButton>
      </div>
    </div>

    <ElCard class="mb">
      <template #header><b>ลิงก์หน้าโปรเจกต์</b></template>
      <div class="link-row">
        <span class="link-label">หน้ารายละเอียด</span>
        <ElInput :model-value="publicUrl" readonly />
        <ElButton @click="copy(publicUrl)">คัดลอก</ElButton>
      </div>
      <div class="hint text-muted">
        หน้ารวมโปรเจกต์ไม่ใช่ลิงก์ตายตัว — สร้างเป็นหน้าเพจแล้วใส่ block "Projects" เข้าไป
        จะได้ใส่ปุ่มหรือเนื้อหาอื่นในหน้าเดียวกันได้
      </div>
    </ElCard>

    <ElCard class="mb">
      <template #header><b>รายละเอียด</b></template>
      <ElForm label-position="top" :disabled="!canManage">
        <ElRow :gutter="16">
          <ElCol :span="12">
            <ElFormItem label="ชื่อโปรเจกต์"><ElInput v-model="project.title" /></ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label="Slug (ใช้ใน URL)"><ElInput v-model="project.slug" /></ElFormItem>
          </ElCol>
        </ElRow>

        <ElFormItem label="คำโปรย (แสดงใต้ชื่อในหน้ารวม)">
          <ElInput v-model="project.summary" type="textarea" :rows="2" />
        </ElFormItem>

        <ElFormItem label="รายละเอียด (รองรับ HTML)">
          <ElInput v-model="project.description" type="textarea" :rows="10" class="mono" />
        </ElFormItem>

        <ElRow :gutter="16">
          <ElCol :span="8">
            <ElFormItem label="วันที่">
              <ElDatePicker
                v-model="project.eventDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </ElFormItem>
          </ElCol>
          <ElCol :span="8">
            <ElFormItem label="ลำดับการแสดง">
              <ElInputNumber v-model="project.sortOrder" :min="0" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="8">
            <ElFormItem label="สถานะ">
              <ElSwitch v-model="project.isActive" active-text="แสดงบนเว็บไซต์" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </ElCard>

    <ElCard class="mb">
      <template #header>
        <b>รูปปก</b>
        <span class="text-muted"> — รูปที่ใช้ในหน้ารวมโปรเจกต์</span>
      </template>
      <ElForm label-position="top" :disabled="!canManage">
        <MediaPicker v-model="project.coverImage" />
      </ElForm>
    </ElCard>

    <ElCard class="mb">
      <template #header>
        <b>แกลเลอรี</b>
        <span class="text-muted"> — รูปทั้งหมดในหน้ารายละเอียด ใส่ได้มากกว่าหนึ่งรูป</span>
      </template>
      <ElForm label-position="top" :disabled="!canManage">
        <BlockPropsEditor
          :fields="galleryFields"
          :model-value="project"
          @update:model-value="Object.assign(project, $event)"
        />
      </ElForm>
    </ElCard>

    <ElCard>
      <template #header><b>SEO</b></template>
      <ElForm label-position="top" :disabled="!canManage">
        <ElFormItem label="Meta title"><ElInput v-model="project.metaTitle" /></ElFormItem>
        <ElFormItem label="Meta description">
          <ElInput v-model="project.metaDescription" type="textarea" :rows="2" />
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 16px; }
.link-row { display: flex; align-items: center; gap: 8px; }
.link-label { width: 130px; flex: none; font-size: 13px; }
.hint { font-size: 12px; margin-top: 8px; line-height: 1.6; }
.mono :deep(textarea) { font-family: ui-monospace, monospace; font-size: 12px; }
</style>
