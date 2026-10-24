<script setup lang="ts">
/**
 * Decorations the donation total unlocks, one by one. Each is placed on the field by
 * position (percent across and down) and size (percent of the field's width).
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';
import { pick, saveCatalogue } from './catalogue';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const KEYS = [
  'id',
  'name',
  'imageUrl',
  'unlockAmount',
  'posX',
  'posY',
  'size',
  'isActive',
] as const;
const rows = ref<any[]>([]);
watch(
  () => props.event.decorations,
  (list) =>
    (rows.value = list.map((r: any) => ({
      ...pick(r, KEYS),
      unlockAmount: Number(r.unlockAmount),
    }))),
  { immediate: true },
);

const raised = computed(() => Number(props.event.donationProject?.currentAmount ?? 0));
const money = (n: number) => n.toLocaleString('th-TH');

const saving = ref(false);
async function save(): Promise<void> {
  if (rows.value.some((r) => !r.name?.trim() || !r.imageUrl)) {
    ElMessage.warning('ทุกชิ้นต้องมีชื่อและรูป');
    return;
  }
  saving.value = true;
  try {
    emit('update', await saveCatalogue(props.event.id, 'decorations', rows.value));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <p v-if="event.donationProject" class="text-muted intro">
    ยอดของ "{{ event.donationProject.name }}" ตอนนี้ {{ money(raised) }} บาท
    (นับเฉพาะรายการที่ตรวจแล้ว)
  </p>
  <ElAlert
    v-else
    class="intro"
    type="warning"
    :closable="false"
    title="ยังไม่ได้ผูกโปรเจกต์โดเนท ของตกแต่งจะยังไม่ปลดล็อค (ตั้งค่าที่แท็บ ตั้งค่างาน)"
  />

  <ElTable :data="rows" size="small">
    <ElTableColumn label="ชื่อ" min-width="140">
      <template #default="{ row }"
        ><ElInput v-model="row.name" placeholder="เช่น รั้วไม้"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="รูป (PNG พื้นใส)" width="220">
      <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
    </ElTableColumn>
    <ElTableColumn label="ปลดล็อคที่ยอด (บาท)" width="170">
      <template #default="{ row }">
        <ElInputNumber
          v-model="row.unlockAmount"
          :min="0"
          :step="1000"
          controls-position="right"
          style="width: 140px"
        />
        <div class="hint" :class="row.unlockAmount <= raised ? 'ok' : 'text-muted'">
          {{ row.unlockAmount <= raised ? '✓ ปลดล็อคแล้ว' : 'ยังล็อค' }}
        </div>
      </template>
    </ElTableColumn>
    <ElTableColumn label="ตำแหน่ง X / Y (%)" width="200">
      <template #default="{ row }">
        <ElInputNumber
          v-model="row.posX"
          :min="0"
          :max="100"
          size="small"
          controls-position="right"
          style="width: 80px"
        />
        <ElInputNumber
          v-model="row.posY"
          :min="0"
          :max="100"
          size="small"
          controls-position="right"
          style="width: 80px; margin-left: 6px"
        />
      </template>
    </ElTableColumn>
    <ElTableColumn label="ขนาด (%)" width="110">
      <template #default="{ row }">
        <ElInputNumber
          v-model="row.size"
          :min="1"
          :max="100"
          size="small"
          controls-position="right"
          style="width: 90px"
        />
      </template>
    </ElTableColumn>
    <ElTableColumn label="เปิดใช้" width="80" align="center">
      <template #default="{ row }"><ElSwitch v-model="row.isActive" /></template>
    </ElTableColumn>
    <ElTableColumn label="" width="70" align="center">
      <template #default="{ $index }">
        <ElButton size="small" type="danger" text @click="rows.splice($index, 1)">ลบ</ElButton>
      </template>
    </ElTableColumn>
  </ElTable>

  <div class="mt">
    <ElButton
      @click="
        rows.push({
          name: '',
          imageUrl: null,
          unlockAmount: 0,
          posX: 50,
          posY: 50,
          size: 12,
          isActive: true,
        })
      "
    >
      + เพิ่มของตกแต่ง
    </ElButton>
    <ElButton
      v-permission="PERMISSIONS.GARDEN_MANAGE"
      type="primary"
      :loading="saving"
      @click="save"
    >
      บันทึกของตกแต่ง
    </ElButton>
  </div>
  <div class="hint text-muted mt">
    X = 0 คือขอบซ้ายของแปลง, Y = 0 คือขอบบน ตำแหน่งคือกึ่งกลางล่างของรูป
  </div>
</template>

<style scoped>
.intro {
  margin: 0 0 12px;
}
.mt {
  margin-top: 12px;
}
.hint {
  font-size: 12px;
}
.ok {
  color: var(--el-color-success);
  font-weight: 600;
}
</style>
