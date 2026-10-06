<script setup lang="ts">
/**
 * Link pages — the edit page: the cover, the buttons, and the QR code that points at it all.
 *
 * The QR code is drawn here in the browser from the page's public address rather than stored:
 * it is a function of the slug and nothing else, so there is nothing to keep in step.
 *
 * The button list borrows the page builder's repeating-row editor, which already knows how to
 * add, remove and reorder rows.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import QRCode from 'qrcode';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import BlockPropsEditor from '@/components/BlockPropsEditor.vue';
import type { BlockField } from '@/blocks/definitions';
import { LINK_PLATFORMS, PERMISSIONS, type ApiResponse } from '@cms/shared';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const canManage = auth.can(PERMISSIONS.LINK_PAGES_MANAGE);

const id = Number(route.params.id);
const loading = ref(true);
const saving = ref(false);

const page = reactive<Record<string, any>>({
  title: '',
  slug: '',
  subtitle: '',
  coverImage: '',
  links: [],
  backgroundColor: '',
  isActive: true,
  metaTitle: '',
  metaDescription: '',
});

/** The slug as last saved — the QR code has to point at an address that already works. */
const savedSlug = ref('');
/** The page's address on the website, from the API — see `withPublicUrl` there. */
const publicUrl = ref('');

const linkFields: BlockField[] = [
  {
    key: 'links',
    label: 'ลิงก์',
    type: 'items',
    itemFields: [
      {
        key: 'platform',
        label: 'แพลตฟอร์ม',
        type: 'select',
        options: LINK_PLATFORMS.map((p) => ({ label: p.name, value: p.key })),
      },
      { key: 'url', label: 'ลิงก์ (https://…)', type: 'url' },
      { key: 'label', label: 'ชื่อที่แสดง (ว่างไว้ = ชื่อแพลตฟอร์ม)', type: 'text' },
      { key: 'action', label: 'ข้อความบนปุ่ม (ว่างไว้ = Play / Follow / Go To ตามแพลตฟอร์ม)', type: 'text' },
      { key: 'icon', label: 'โลโก้เอง (ไม่บังคับ — ใช้แทนโลโก้ของแพลตฟอร์ม)', type: 'image' },
    ],
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<any>>(`/link-pages/${id}`);
    Object.assign(page, data.data, {
      // Null from the API, but the controls below want values they can bind to.
      subtitle: data.data.subtitle ?? '',
      coverImage: data.data.coverImage ?? '',
      backgroundColor: data.data.backgroundColor ?? '',
      links: Array.isArray(data.data.links) ? data.data.links : [],
      metaTitle: data.data.metaTitle ?? '',
      metaDescription: data.data.metaDescription ?? '',
    });
    savedSlug.value = data.data.slug;
    publicUrl.value = data.data.publicUrl;
  } finally {
    loading.value = false;
  }
}
void load();

async function save(): Promise<void> {
  // A row with nowhere to go would be a dead button on the page.
  const links = (page.links ?? [])
    .filter((l: any) => l?.url?.trim())
    .map((l: any) => ({
      platform: l.platform || 'other',
      url: l.url.trim(),
      label: l.label || null,
      action: l.action || null,
      icon: l.icon || null,
    }));
  saving.value = true;
  try {
    const { data } = await http.put<ApiResponse<any>>(`/link-pages/${id}`, {
      title: page.title,
      slug: page.slug,
      subtitle: page.subtitle || null,
      coverImage: page.coverImage || null,
      backgroundColor: page.backgroundColor || null,
      links,
      isActive: page.isActive,
      metaTitle: page.metaTitle || null,
      metaDescription: page.metaDescription || null,
    });
    page.links = links;
    savedSlug.value = data.data.slug;
    publicUrl.value = data.data.publicUrl;
    ElMessage.success('บันทึกแล้ว');
  } finally {
    saving.value = false;
  }
}

// ── QR code ─────────────────────────────────────────────────

/** 1024px is big enough to print on a poster without the squares going soft. */
const QR_OPTIONS = { margin: 2, errorCorrectionLevel: 'M' as const };
const qrPng = ref('');

watch(
  publicUrl,
  async (url) => {
    if (!url) return;
    qrPng.value = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024 });
  },
  { immediate: true },
);

function download(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

function downloadPng(): void {
  download(qrPng.value, `qr-${savedSlug.value}.png`);
}

/** SVG for print: it scales to any size with no blur. */
async function downloadSvg(): Promise<void> {
  const svg = await QRCode.toString(publicUrl.value, { ...QR_OPTIONS, type: 'svg' });
  const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  download(href, `qr-${savedSlug.value}.svg`);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const slugChanged = computed(() => !!savedSlug.value && page.slug !== savedSlug.value);

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
      <h1>ตั้งค่าลิงก์รวม</h1>
      <div>
        <ElButton @click="router.push({ name: 'link-pages' })">กลับ</ElButton>
        <ElButton v-if="canManage" type="primary" :loading="saving" @click="save">บันทึก</ElButton>
      </div>
    </div>

    <ElCard class="mb">
      <template #header><b>ลิงก์และ QR Code</b></template>
      <div class="qr-row">
        <div class="qr-box">
          <img v-if="qrPng" :src="qrPng" alt="QR code" class="qr-img" />
        </div>
        <div class="qr-side">
          <div class="link-row">
            <ElInput :model-value="publicUrl" readonly />
            <ElButton @click="copy(publicUrl)">คัดลอก</ElButton>
            <ElButton tag="a" :href="publicUrl" target="_blank">เปิดดู</ElButton>
          </div>
          <div class="qr-actions">
            <ElButton type="primary" plain :disabled="!qrPng" @click="downloadPng">ดาวน์โหลด PNG</ElButton>
            <ElButton plain :disabled="!qrPng" @click="downloadSvg">ดาวน์โหลด SVG (สำหรับพิมพ์)</ElButton>
          </div>
          <ElAlert
            v-if="!loading && !publicUrl"
            type="error"
            :closable="false"
            show-icon
            title="API ไม่ได้ส่งลิงก์หน้าเว็บมา — API บนเซิร์ฟเวอร์ยังเป็นเวอร์ชันเก่า ให้ build แล้ว restart API (pm2 reload cms-api)"
            class="mt"
          />
          <ElAlert
            v-if="slugChanged"
            type="warning"
            :closable="false"
            show-icon
            title="Slug เปลี่ยนแล้วแต่ยังไม่ได้บันทึก — QR ด้านซ้ายยังเป็นของ slug เดิม"
            class="mt"
          />
          <div class="hint text-muted">
            QR นี้ชี้ไปที่หน้าลิงก์รวม ไม่ใช่ลิงก์ปลายทางแต่ละอัน — แก้ไข/เพิ่มลิงก์ทีหลังได้โดยไม่ต้องพิมพ์ QR ใหม่
            แต่ถ้าเปลี่ยน slug QR ที่พิมพ์ไปแล้วจะใช้ไม่ได้
          </div>
        </div>
      </div>
    </ElCard>

    <ElCard class="mb">
      <template #header><b>รายละเอียด</b></template>
      <ElForm label-position="top" :disabled="!canManage">
        <ElRow :gutter="16">
          <ElCol :span="12">
            <ElFormItem label="ชื่อหน้า"><ElInput v-model="page.title" /></ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label="Slug (ใช้ใน URL)"><ElInput v-model="page.slug" /></ElFormItem>
          </ElCol>
        </ElRow>
        <ElRow :gutter="16">
          <ElCol :span="16">
            <ElFormItem label="ข้อความใต้ชื่อ">
              <ElInput v-model="page.subtitle" placeholder="เช่น Choose music service" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="8">
            <ElFormItem label="สถานะ">
              <ElSwitch v-model="page.isActive" active-text="แสดงบนเว็บไซต์" />
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </ElCard>

    <ElCard class="mb">
      <template #header>
        <b>รูปปกและพื้นหลัง</b>
        <span class="text-muted"> — แสดงเป็นสี่เหลี่ยมจัตุรัสด้านบน และเบลอเป็นพื้นหลังของหน้า</span>
      </template>
      <ElForm label-position="top" :disabled="!canManage">
        <MediaPicker v-model="page.coverImage" />
        <ElFormItem label="สีพื้นหลังของหน้า (ว่างไว้ = ใช้รูปปกเบลอเป็นพื้นหลัง)" class="mt">
          <ElColorPicker v-model="page.backgroundColor" />
        </ElFormItem>
      </ElForm>
    </ElCard>

    <ElCard class="mb">
      <template #header>
        <b>ลิงก์</b>
        <span class="text-muted"> — เรียงตามลำดับที่แสดงบนหน้า ลากหรือกดลูกศรเพื่อสลับลำดับ</span>
      </template>
      <ElForm label-position="top" :disabled="!canManage">
        <BlockPropsEditor
          :fields="linkFields"
          :model-value="page"
          @update:model-value="Object.assign(page, $event)"
        />
      </ElForm>
    </ElCard>

    <ElCard>
      <template #header><b>SEO / การแชร์</b></template>
      <ElForm label-position="top" :disabled="!canManage">
        <ElFormItem label="Meta title"><ElInput v-model="page.metaTitle" /></ElFormItem>
        <ElFormItem label="Meta description">
          <ElInput v-model="page.metaDescription" type="textarea" :rows="2" />
        </ElFormItem>
      </ElForm>
    </ElCard>
  </div>
</template>

<style scoped>
.mb { margin-bottom: 16px; }
.mt { margin-top: 12px; }
.qr-row { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
.qr-box {
  width: 180px;
  height: 180px;
  flex: none;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: #fff;
}
.qr-img { width: 100%; height: 100%; display: block; }
.qr-side { flex: 1; min-width: 280px; }
.link-row { display: flex; align-items: center; gap: 8px; }
.qr-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.hint { font-size: 12px; margin-top: 12px; line-height: 1.6; }
</style>
