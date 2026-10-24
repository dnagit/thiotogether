<script setup lang="ts">
/**
 * Faces a secret fertiliser may draw into its flower. The server picks one at random on
 * purchase, so every face here is a face somebody may get — keep only ones you are happy
 * to hand out.
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';
import { pick, saveCatalogue } from './catalogue';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const KEYS = ['id', 'name', 'imageUrl', 'isActive'] as const;
const rows = ref<any[]>([]);
watch(
  () => props.event.faces,
  (list) => (rows.value = list.map((r: any) => pick(r, KEYS))),
  { immediate: true },
);

const saving = ref(false);
async function save(): Promise<void> {
  if (rows.value.some((r) => !r.imageUrl)) {
    ElMessage.warning('ทุกแถวต้องมีรูป');
    return;
  }
  saving.value = true;
  try {
    emit('update', await saveCatalogue(props.event.id, 'faces', rows.value));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <p class="text-muted intro">
    ใช้กับแบบดอกบนชั้นปุ๋ยลับที่เปิด "ใส่รูปหน้า" · ระบบสุ่มให้ตอนซื้อ
    และเจ้าของต้นจะเห็นในวันเปิดผล · แนะนำรูปสี่เหลี่ยมจัตุรัส หน้าอยู่กลางรูป (ระบบครอปเป็นวงกลม)
  </p>

  <ElTable :data="rows" size="small">
    <ElTableColumn label="รูป" width="240">
      <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
    </ElTableColumn>
    <ElTableColumn label="ชื่อ (ไว้ดูเอง)" min-width="160">
      <template #default="{ row }"><ElInput v-model="row.name" placeholder="ไม่บังคับ" /></template>
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
    <ElButton @click="rows.push({ name: null, imageUrl: null, isActive: true })"
      >+ เพิ่มรูปหน้า</ElButton
    >
    <ElButton
      v-permission="PERMISSIONS.GARDEN_MANAGE"
      type="primary"
      :loading="saving"
      @click="save"
    >
      บันทึกคลังรูปหน้า
    </ElButton>
  </div>
  <div class="hint text-muted mt">ปิดใช้หรือลบรูปแล้ว ต้นที่สุ่มได้รูปนั้นไปแล้วยังใช้รูปเดิม</div>
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
