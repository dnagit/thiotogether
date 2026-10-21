<script setup lang="ts">
/**
 * QR code generator — turns any external URL into a QR code to download.
 *
 * Everything happens in the browser and nothing is saved: the QR is a function of the URL
 * and the colours, so there is nothing to keep. Unlike a link page's QR, this one points
 * straight at the destination, so if that address changes the printed QR has to be redone.
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import QRCode from 'qrcode';

const input = ref('');
const darkColor = ref('#000000');
const lightColor = ref('#ffffff');
const errorLevel = ref<'L' | 'M' | 'Q' | 'H'>('M');

/** People paste "example.com" as often as "https://example.com" — add the scheme for them. */
const url = computed(() => {
  const raw = input.value.trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return '';
    return withScheme;
  } catch {
    return '';
  }
});
const invalid = computed(() => !!input.value.trim() && !url.value);

/** 1024px is big enough to print on a poster without the squares going soft. */
const qrOptions = computed(() => ({
  margin: 2,
  errorCorrectionLevel: errorLevel.value,
  color: { dark: darkColor.value || '#000000', light: lightColor.value || '#ffffff' },
}));
const qrPng = ref('');

watch(
  [url, qrOptions],
  async ([value, options]) => {
    qrPng.value = value ? await QRCode.toDataURL(value, { ...options, width: 1024 }) : '';
  },
  { immediate: true },
);

/** e.g. https://www.youtube.com/watch?v=x → qr-youtube.com */
const filename = computed(() => {
  try {
    return `qr-${new URL(url.value).hostname.replace(/^www\./, '')}`;
  } catch {
    return 'qr-code';
  }
});

function download(href: string, name: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

function downloadPng(): void {
  download(qrPng.value, `${filename.value}.png`);
}

/** SVG for print: it scales to any size with no blur. */
async function downloadSvg(): Promise<void> {
  const svg = await QRCode.toString(url.value, { ...qrOptions.value, type: 'svg' });
  const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  download(href, `${filename.value}.svg`);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function copyImage(): Promise<void> {
  try {
    const blob = await (await fetch(qrPng.value)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    ElMessage.success('คัดลอกรูป QR แล้ว');
  } catch {
    ElMessage.warning('คัดลอกไม่สำเร็จ กรุณาดาวน์โหลดแทน');
  }
}

function resetColors(): void {
  darkColor.value = '#000000';
  lightColor.value = '#ffffff';
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>สร้าง QR Code</h1>
    </div>

    <ElCard>
      <template #header>
        <b>ลิงก์ปลายทาง</b>
        <span class="text-muted"> — ใส่ลิงก์ภายนอกใดก็ได้ เช่น YouTube, Google Form, Facebook</span>
      </template>
      <div class="qr-row">
        <div class="qr-box" :style="{ background: lightColor || '#fff' }">
          <img v-if="qrPng" :src="qrPng" alt="QR code" class="qr-img" />
          <span v-else class="qr-empty text-muted">ใส่ลิงก์เพื่อสร้าง QR</span>
        </div>
        <div class="qr-side">
          <ElForm label-position="top" @submit.prevent>
            <ElFormItem label="URL" :error="invalid ? 'ลิงก์ไม่ถูกต้อง — ต้องเป็น http:// หรือ https://' : ''">
              <div class="link-row">
                <ElInput v-model="input" placeholder="https://…" clearable />
                <ElButton tag="a" :href="url || undefined" target="_blank" :disabled="!url">เปิดดู</ElButton>
              </div>
            </ElFormItem>
            <div class="option-row">
              <ElFormItem label="สี QR">
                <ElColorPicker v-model="darkColor" />
              </ElFormItem>
              <ElFormItem label="สีพื้นหลัง">
                <ElColorPicker v-model="lightColor" />
              </ElFormItem>
              <ElFormItem label="ทนความเสียหาย">
                <ElSelect v-model="errorLevel" style="width: 180px">
                  <ElOption label="ต่ำ (L) — QR โปร่งที่สุด" value="L" />
                  <ElOption label="ปกติ (M)" value="M" />
                  <ElOption label="สูง (Q)" value="Q" />
                  <ElOption label="สูงสุด (H)" value="H" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem label="&nbsp;">
                <ElButton text @click="resetColors">คืนค่าสี</ElButton>
              </ElFormItem>
            </div>
          </ElForm>
          <div class="qr-actions">
            <ElButton type="primary" plain :disabled="!qrPng" @click="downloadPng">ดาวน์โหลด PNG</ElButton>
            <ElButton plain :disabled="!qrPng" @click="downloadSvg">ดาวน์โหลด SVG (สำหรับพิมพ์)</ElButton>
            <ElButton plain :disabled="!qrPng" @click="copyImage">คัดลอกรูป</ElButton>
          </div>
          <div class="hint text-muted">
            QR นี้ชี้ไปที่ลิงก์ปลายทางโดยตรงและไม่ได้บันทึกไว้ในระบบ — ถ้าลิงก์ปลายทางเปลี่ยน ต้องสร้างและพิมพ์ QR ใหม่
            ถ้าต้องการเปลี่ยนลิงก์ทีหลังโดยไม่ต้องพิมพ์ใหม่ ให้ใช้เมนู "ลิงก์รวม / QR" แทน
            <br />
            สี QR ควรเข้มกว่าพื้นหลังมาก ๆ ไม่อย่างนั้นมือถือบางรุ่นจะสแกนไม่ติด
          </div>
        </div>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.qr-row { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
.qr-box {
  width: 240px;
  height: 240px;
  flex: none;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr-img { width: 100%; height: 100%; display: block; }
.qr-empty { font-size: 13px; }
.qr-side { flex: 1; min-width: 280px; }
.link-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.option-row { display: flex; gap: 24px; flex-wrap: wrap; }
.qr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 12px; margin-top: 12px; line-height: 1.6; }
</style>
