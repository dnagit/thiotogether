<script setup lang="ts">
/**
 * What the whole field looks like before the reveal. Every plant shows the same stage on a
 * given day; a stage shows from its day count onwards until the next one takes over, and a
 * seed sown that very day shows the first stage whatever the date.
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';
import { pick, saveCatalogue } from './catalogue';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const KEYS = ['id', 'name', 'imageUrl', 'startsDaysBeforeReveal'] as const;
const rows = ref<any[]>([]);
watch(
  () => props.event.growthStages,
  (list) => (rows.value = list.map((r: any) => pick(r, KEYS))),
  { immediate: true },
);

function add(): void {
  const last = rows.value[rows.value.length - 1];
  rows.value.push({
    name: '',
    imageUrl: null,
    startsDaysBeforeReveal: last ? Math.max(0, last.startsDaysBeforeReveal - 30) : 365,
  });
}

const saving = ref(false);
async function save(): Promise<void> {
  if (rows.value.some((r) => !r.name?.trim() || !r.imageUrl)) {
    ElMessage.warning('ทุกช่วงต้องมีชื่อและรูป');
    return;
  }
  saving.value = true;
  try {
    // Kept in the order they happen, which is what the API sorts by anyway.
    const sorted = [...rows.value].sort(
      (a, b) => b.startsDaysBeforeReveal - a.startsDaysBeforeReveal,
    );
    emit('update', await saveCatalogue(props.event.id, 'stages', sorted));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <p class="text-muted intro">
    เช่น เมล็ดในดิน (365 วัน) → ต้นอ่อน (180) → ต้นสูง (60) → ดอกตูม (14) ·
    ช่วงแรกสุดใช้กับต้นที่เพิ่งปลูกวันนั้นด้วย
  </p>

  <ElTable :data="rows" size="small">
    <ElTableColumn label="ชื่อช่วง" min-width="160">
      <template #default="{ row }"
        ><ElInput v-model="row.name" placeholder="เช่น ต้นอ่อน"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="รูป (PNG พื้นใส)" width="220">
      <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
    </ElTableColumn>
    <ElTableColumn label="เริ่มแสดงกี่วันก่อนวันเปิดผล" width="220">
      <template #default="{ row }"
        ><ElInputNumber v-model="row.startsDaysBeforeReveal" :min="0" :max="3650"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="" width="70" align="center">
      <template #default="{ $index }">
        <ElButton size="small" type="danger" text @click="rows.splice($index, 1)">ลบ</ElButton>
      </template>
    </ElTableColumn>
  </ElTable>

  <div class="mt">
    <ElButton @click="add">+ เพิ่มช่วง</ElButton>
    <ElButton
      v-permission="PERMISSIONS.GARDEN_MANAGE"
      type="primary"
      :loading="saving"
      @click="save"
    >
      บันทึกช่วงเติบโต
    </ElButton>
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 12px;
}
.mt {
  margin-top: 12px;
}
</style>
