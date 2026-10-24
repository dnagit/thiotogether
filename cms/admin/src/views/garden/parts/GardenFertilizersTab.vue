<script setup lang="ts">
/**
 * The bags on the potting bench. A visitor picks two and splits 100% between them, so the
 * number of bags sets how many pairs the recipes have to cover: six bags, fifteen pairs.
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';
import { moveRow, pick, saveCatalogue } from './catalogue';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const KEYS = ['id', 'name', 'description', 'imageUrl', 'color', 'isActive'] as const;
const rows = ref<any[]>([]);
watch(
  () => props.event.fertilizers,
  (list) => (rows.value = list.map((r: any) => pick(r, KEYS))),
  { immediate: true },
);

const activeCount = computed(() => rows.value.filter((r) => r.isActive).length);
const pairs = computed(() => (activeCount.value * (activeCount.value - 1)) / 2);

function add(): void {
  rows.value.push({
    name: '',
    description: null,
    imageUrl: null,
    color: '#a16207',
    isActive: true,
  });
}

const saving = ref(false);
async function save(): Promise<void> {
  if (rows.value.some((r) => !r.name?.trim())) {
    ElMessage.warning('กรุณาใส่ชื่อปุ๋ยให้ครบทุกถุง');
    return;
  }
  saving.value = true;
  try {
    emit('update', await saveCatalogue(props.event.id, 'fertilizers', rows.value));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <p class="text-muted intro">
    เปิดใช้อยู่ {{ activeCount }} ถุง · จับคู่ได้ {{ pairs }} คู่ (แนะนำ 6 ถุง = 15 คู่)
  </p>

  <ElTable :data="rows" size="small">
    <ElTableColumn label="ลำดับ" width="100" align="center">
      <template #default="{ $index }">
        <ElButton size="small" text :disabled="$index === 0" @click="moveRow(rows, $index, -1)"
          >↑</ElButton
        >
        <ElButton
          size="small"
          text
          :disabled="$index === rows.length - 1"
          @click="moveRow(rows, $index, 1)"
          >↓</ElButton
        >
      </template>
    </ElTableColumn>
    <ElTableColumn label="ชื่อปุ๋ย" min-width="160">
      <template #default="{ row }"
        ><ElInput v-model="row.name" placeholder="เช่น ปุ๋ยแสงแดด"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="คำอธิบายสั้น" min-width="200">
      <template #default="{ row }"
        ><ElInput v-model="row.description" placeholder="ไม่บังคับ"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="สี" width="80" align="center">
      <template #default="{ row }"><ElColorPicker v-model="row.color" /></template>
    </ElTableColumn>
    <ElTableColumn label="รูปถุง" width="220">
      <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
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
    <ElButton @click="add">+ เพิ่มปุ๋ย</ElButton>
    <ElButton
      v-permission="PERMISSIONS.GARDEN_MANAGE"
      type="primary"
      :loading="saving"
      @click="save"
    >
      บันทึกปุ๋ย
    </ElButton>
  </div>
  <div class="hint text-muted mt">
    ปุ๋ยที่ถูกลบหรือปิดใช้จะหายจากหน้าปลูก ต้นที่ใช้ไปแล้วยังแสดงปุ๋ยเดิม
    สีของปุ๋ยใช้ระบายถุงเมื่อไม่มีรูป และใช้ในแถบสัดส่วน
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
</style>
