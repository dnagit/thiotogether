<script setup lang="ts">
/**
 * Every sunflower the garden can grow, as uploaded pictures. A design is a recipe's result,
 * a flower on the secret shelf, or both.
 *
 * A flower that may carry a face needs to know where the face goes, so each design has a
 * circle placed on its picture — centre and diameter as percentages of the picture's width,
 * which is what the website draws from whatever size it shows the flower at.
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS } from '@cms/shared';
import { moveRow, pick, saveCatalogue } from './catalogue';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const KEYS = [
  'id',
  'name',
  'imageUrl',
  'rarity',
  'faceX',
  'faceY',
  'faceSize',
  'onShelf',
  'allowFace',
  'isActive',
] as const;
const rows = ref<any[]>([]);
watch(
  () => props.event.designs,
  (list) => (rows.value = list.map((r: any) => pick(r, KEYS))),
  { immediate: true },
);

const rarities = [
  { value: 'common', label: 'ธรรมดา' },
  { value: 'rare', label: 'หายาก' },
  { value: 'legendary', label: 'ตำนาน' },
];

const shelfCount = computed(() => rows.value.filter((r) => r.onShelf && r.isActive).length);

function add(): void {
  rows.value.push({
    name: '',
    imageUrl: null,
    rarity: 'common',
    faceX: null,
    faceY: null,
    faceSize: null,
    onShelf: false,
    allowFace: false,
    isActive: true,
  });
}

const saving = ref(false);
async function save(): Promise<void> {
  if (rows.value.some((r) => !r.name?.trim() || !r.imageUrl)) {
    ElMessage.warning('ทุกแบบต้องมีชื่อและรูป');
    return;
  }
  if (rows.value.some((r) => r.allowFace && r.faceX === null)) {
    ElMessage.warning('แบบที่ใส่รูปหน้าได้ ต้องกำหนดตำแหน่งรูปหน้าก่อน');
    return;
  }
  saving.value = true;
  try {
    // The shelf follows the same order as this table.
    const payload = rows.value.map((r, index) => ({ ...r, shelfOrder: index }));
    emit('update', await saveCatalogue(props.event.id, 'designs', payload));
  } finally {
    saving.value = false;
  }
}

// ── Face position editor ──

const editing = ref<any | null>(null);
const draft = reactive({ x: 50, y: 40, size: 30 });
const sampleFace = computed(() => props.event.faces.find((f: any) => f.isActive)?.imageUrl ?? null);

function openFace(row: any): void {
  editing.value = row;
  draft.x = row.faceX ?? 50;
  draft.y = row.faceY ?? 40;
  draft.size = row.faceSize ?? 30;
}

/** Centre the circle where the admin clicked. `y` is a share of the width too, see above. */
function place(e: MouseEvent): void {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  draft.x = Math.round(((e.clientX - box.left) / box.width) * 1000) / 10;
  draft.y = Math.round(((e.clientY - box.top) / box.width) * 1000) / 10;
}

function applyFace(): void {
  if (!editing.value) return;
  Object.assign(editing.value, { faceX: draft.x, faceY: draft.y, faceSize: draft.size });
  editing.value = null;
}

function clearFace(): void {
  if (!editing.value) return;
  Object.assign(editing.value, { faceX: null, faceY: null, faceSize: null, allowFace: false });
  editing.value = null;
}
</script>

<template>
  <p class="text-muted intro">
    ขึ้นชั้นปุ๋ยลับอยู่ {{ shelfCount }} แบบ · ลำดับในตารางนี้คือลำดับบนชั้นวาง · แนะนำ PNG พื้นใส
    ขนาดและมุมมองเดียวกันทุกแบบ (เช่น 1024×1536 โคนต้นอยู่กึ่งกลางล่าง)
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
    <ElTableColumn label="รูปดอก" width="220">
      <template #default="{ row }"><MediaPicker v-model="row.imageUrl" /></template>
    </ElTableColumn>
    <ElTableColumn label="ชื่อแบบ" min-width="150">
      <template #default="{ row }"
        ><ElInput v-model="row.name" placeholder="เช่น ทานตะวันทอง"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="ความหายาก" width="120">
      <template #default="{ row }">
        <ElSelect v-model="row.rarity" size="small">
          <ElOption v-for="r in rarities" :key="r.value" :label="r.label" :value="r.value" />
        </ElSelect>
      </template>
    </ElTableColumn>
    <ElTableColumn label="ชั้นปุ๋ยลับ" width="90" align="center">
      <template #default="{ row }"><ElSwitch v-model="row.onShelf" /></template>
    </ElTableColumn>
    <ElTableColumn label="ใส่รูปหน้า" width="90" align="center">
      <template #default="{ row }"
        ><ElSwitch v-model="row.allowFace" :disabled="!row.onShelf"
      /></template>
    </ElTableColumn>
    <ElTableColumn label="ตำแหน่งหน้า" width="120" align="center">
      <template #default="{ row }">
        <ElButton size="small" :disabled="!row.imageUrl" @click="openFace(row)">
          {{ row.faceX === null || row.faceX === undefined ? 'กำหนด' : 'แก้ไข ✓' }}
        </ElButton>
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
    <ElButton @click="add">+ เพิ่มแบบดอก</ElButton>
    <ElButton
      v-permission="PERMISSIONS.GARDEN_MANAGE"
      type="primary"
      :loading="saving"
      @click="save"
    >
      บันทึกแบบดอก
    </ElButton>
  </div>
  <div class="hint text-muted mt">
    รูปแบบดอกจะไม่ถูกส่งไปหน้าเว็บก่อนวันเปิดผล ยกเว้นแบบที่ขึ้นชั้นปุ๋ยลับ
    ซึ่งต้องให้คนเห็นเพื่อเลือก แบบที่ถูกลบแล้ว ต้นที่ได้แบบนั้นไปจะใช้แบบดอกตั้งต้นแทน
  </div>

  <ElDialog
    :model-value="!!editing"
    title="ตำแหน่งรูปหน้าบนดอก"
    width="460px"
    @close="editing = null"
  >
    <template v-if="editing">
      <p class="text-muted hint">คลิกบนรูปเพื่อวางกึ่งกลางวงกลม แล้วปรับขนาดด้วยแถบด้านล่าง</p>
      <div class="face-stage" @click="place">
        <img :src="editing.imageUrl" alt="" class="face-flower" />
        <div
          class="face-ring"
          :style="{
            left: `${draft.x}%`,
            top: `${draft.y}cqw`,
            width: `${draft.size}%`,
          }"
        >
          <img v-if="sampleFace" :src="sampleFace" alt="" />
        </div>
      </div>
      <ElFormItem label="ขนาดวงกลม (% ของความกว้างรูป)" class="mt">
        <ElSlider v-model="draft.size" :min="5" :max="80" show-input />
      </ElFormItem>
      <div v-if="!sampleFace" class="hint text-muted">
        เพิ่มรูปในแท็บ "คลังรูปหน้า" เพื่อดูตัวอย่างจริงในวงกลม
      </div>
    </template>
    <template #footer>
      <ElButton type="danger" text @click="clearFace">ล้างตำแหน่ง</ElButton>
      <ElButton @click="editing = null">ยกเลิก</ElButton>
      <ElButton type="primary" @click="applyFace">ใช้ตำแหน่งนี้</ElButton>
    </template>
  </ElDialog>
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
  line-height: 1.5;
}
/* A size container, so the ring's `top` can be a share of the width like the API's `faceY`. */
.face-stage {
  position: relative;
  width: min(100%, 280px);
  margin: 0 auto;
  container-type: inline-size;
  cursor: crosshair;
  background: repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 50% / 20px 20px;
  border-radius: 8px;
  overflow: hidden;
}
.face-flower {
  display: block;
  width: 100%;
  user-select: none;
  pointer-events: none;
}
.face-ring {
  position: absolute;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border: 2px dashed #ef4444;
  border-radius: 50%;
  overflow: hidden;
  pointer-events: none;
}
.face-ring img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.85;
}
</style>
