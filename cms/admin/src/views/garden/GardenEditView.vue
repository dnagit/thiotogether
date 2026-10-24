<script setup lang="ts">
/**
 * One garden's settings, one tab per catalogue. Each tab saves its own list and hands back the
 * event the API returns, so every tab sees the same up-to-date event — the recipes tab needs
 * the bags and the designs as they were just saved, not as they were when the page opened.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import type { ApiResponse } from '@cms/shared';
import GardenSettingsTab from './parts/GardenSettingsTab.vue';
import GardenFertilizersTab from './parts/GardenFertilizersTab.vue';
import GardenDesignsTab from './parts/GardenDesignsTab.vue';
import GardenStagesTab from './parts/GardenStagesTab.vue';
import GardenRecipesTab from './parts/GardenRecipesTab.vue';
import GardenFacesTab from './parts/GardenFacesTab.vue';
import GardenDecorationsTab from './parts/GardenDecorationsTab.vue';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const event = ref<any>(null);
const loading = ref(true);
const tab = ref('settings');

void http
  .get<ApiResponse<any>>(`/garden/${id}`)
  .then(({ data }) => (event.value = data.data))
  .catch(() => void router.push({ name: 'garden' }))
  .finally(() => (loading.value = false));

const websiteUrl = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';
const links = computed(() => {
  const slug = event.value?.slug ?? '';
  return [
    { label: 'หน้าปลูก', url: `${websiteUrl}/garden/plant/${slug}` },
    { label: 'แปลงรวม', url: `${websiteUrl}/garden/${slug}` },
    { label: 'สวนของฉัน', url: `${websiteUrl}/garden/mine/${slug}` },
  ];
});

/** What still stops sowing. Mirrors the API's own check, so an empty list means open. */
const blockers = computed(() => {
  const e = event.value;
  if (!e) return [];
  const list: string[] = [];
  const bags = e.fertilizers.filter((f: any) => f.isActive).length;
  if (bags < 2) list.push(`มีปุ๋ยที่เปิดใช้ ${bags} ถุง ต้องมีอย่างน้อย 2 ถุง (แนะนำ 6 ถุง)`);
  const fallback = e.designs.find((d: any) => d.id === e.defaultDesignId);
  if (!fallback || !fallback.isActive) list.push('ยังไม่ได้เลือกแบบดอกตั้งต้น (แท็บ "ตั้งค่างาน")');
  if (!e.growthStages.length)
    list.push('ยังไม่มีรูปช่วงเติบโต แปลงจะแสดงเป็นรูปตั้งต้นของเว็บไซต์');
  if (!e.isActive) list.push('หน้านี้ปิดใช้งานอยู่');
  if (!e.isOpen) list.push('ปิดรับการปลูกอยู่');
  return list;
});

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
        <ElButton @click="router.push({ name: 'garden' })">กลับ</ElButton>
        <ElButton plain @click="router.push({ name: 'garden-plants', params: { id } })"
          >ต้นทานตะวัน</ElButton
        >
      </div>
    </div>

    <template v-if="event">
      <ElCard class="mb">
        <template #header><b>ลิงก์สำหรับผู้ร่วมงาน</b></template>
        <div v-for="link in links" :key="link.label" class="link-row">
          <span class="link-label">{{ link.label }}</span>
          <ElInput :model-value="link.url" readonly />
          <ElButton @click="copy(link.url)">คัดลอก</ElButton>
        </div>
        <ElAlert
          v-if="blockers.length"
          class="mt"
          type="warning"
          :closable="false"
          title="ยังเปิดรับปลูกไม่ได้หรือยังไม่ครบ"
        >
          <ul class="blockers">
            <li v-for="b in blockers" :key="b">{{ b }}</li>
          </ul>
        </ElAlert>
        <ElAlert v-else class="mt" type="success" :closable="false" title="พร้อมเปิดรับปลูก" />
      </ElCard>

      <ElCard>
        <ElTabs v-model="tab">
          <ElTabPane label="ตั้งค่างาน" name="settings">
            <GardenSettingsTab :event="event" @update="event = $event" />
          </ElTabPane>
          <ElTabPane label="ปุ๋ย" name="fertilizers">
            <GardenFertilizersTab :event="event" @update="event = $event" />
          </ElTabPane>
          <ElTabPane label="แบบดอกทานตะวัน" name="designs">
            <GardenDesignsTab :event="event" @update="event = $event" />
          </ElTabPane>
          <ElTabPane label="สูตร" name="recipes" lazy>
            <GardenRecipesTab :event="event" />
          </ElTabPane>
          <ElTabPane label="ช่วงเติบโต" name="stages">
            <GardenStagesTab :event="event" @update="event = $event" />
          </ElTabPane>
          <ElTabPane label="คลังรูปหน้า" name="faces">
            <GardenFacesTab :event="event" @update="event = $event" />
          </ElTabPane>
          <ElTabPane label="ของตกแต่ง" name="decorations">
            <GardenDecorationsTab :event="event" @update="event = $event" />
          </ElTabPane>
        </ElTabs>
      </ElCard>
    </template>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.mt {
  margin-top: 12px;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.link-label {
  width: 110px;
  flex: none;
  font-size: 13px;
}
.blockers {
  margin: 4px 0 0;
  padding-left: 18px;
}
</style>
