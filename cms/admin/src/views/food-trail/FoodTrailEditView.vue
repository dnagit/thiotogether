<script setup lang="ts">
/**
 * One food trail: its restaurants, the dishes at each, and the poster made from them.
 *
 * Restaurants and dishes may each have a picture. Those go on the poster only — the website's
 * checklist shows names, never the pictures.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '@/api/http';
import { confirmDelete } from '@/utils/confirm';
import MediaPicker from '@/components/MediaPicker.vue';
import FoodTrailPoster from './FoodTrailPoster.vue';
import {
  PERMISSIONS,
  type ApiResponse,
  type FoodMenu,
  type FoodPlace,
  type FoodTrailTree,
} from '@cms/shared';

const route = useRoute();
const trailId = Number(route.params.id);

const trail = ref<FoodTrailTree | null>(null);
const loading = ref(false);
const tab = ref<'places' | 'poster'>('places');

async function load(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await http.get<ApiResponse<FoodTrailTree>>(`/food-trails/trails/${trailId}/tree`);
    trail.value = data.data;
  } finally {
    loading.value = false;
  }
}
void load();

const menuCount = computed(() => trail.value?.places.reduce((n, p) => n + p.menus.length, 0) ?? 0);

/** One past the last, so something new goes to the end unless the admin says otherwise. */
const nextOrder = (list: Array<{ sortOrder: number }>) =>
  list.length ? Math.max(...list.map((x) => x.sortOrder)) + 1 : 0;

// ── Restaurants ─────────────────────────────────────────────

const placeDialog = ref(false);
const savingPlace = ref(false);
const blankPlace = { id: null as number | null, name: '', note: '', image: null as string | null, sortOrder: 0 };
const placeForm = reactive({ ...blankPlace });

function openPlace(row?: FoodPlace): void {
  Object.assign(
    placeForm,
    blankPlace,
    row
      ? { id: row.id, name: row.name, note: row.note ?? '', image: row.image, sortOrder: row.sortOrder }
      : { sortOrder: nextOrder(trail.value?.places ?? []) },
  );
  placeDialog.value = true;
}

async function savePlace(): Promise<void> {
  const payload = {
    trailId,
    name: placeForm.name.trim(),
    note: placeForm.note.trim() || null,
    image: placeForm.image || null,
    sortOrder: placeForm.sortOrder,
  };
  savingPlace.value = true;
  try {
    if (placeForm.id) await http.put(`/food-trails/places/${placeForm.id}`, payload);
    else await http.post('/food-trails/places', payload);
    ElMessage.success('บันทึกแล้ว');
    placeDialog.value = false;
    await load();
  } finally {
    savingPlace.value = false;
  }
}

async function removePlace(row: FoodPlace): Promise<void> {
  if (!(await confirmDelete(row.name, { note: `ต้องการลบร้าน "${row.name}" และเมนูทั้งหมดของร้านนี้ใช่หรือไม่?` }))) return;
  await http.delete(`/food-trails/places/${row.id}`);
  ElMessage.success('ลบแล้ว');
  await load();
}

// ── Dishes ──────────────────────────────────────────────────

const menuDialog = ref(false);
const savingMenu = ref(false);
const blankMenu = { id: null as number | null, placeId: 0, name: '', image: null as string | null, sortOrder: 0 };
const menuForm = reactive({ ...blankMenu });
const menuPlaceName = computed(() => trail.value?.places.find((p) => p.id === menuForm.placeId)?.name ?? '');

function openMenu(place: FoodPlace, row?: FoodMenu): void {
  Object.assign(
    menuForm,
    blankMenu,
    { placeId: place.id },
    row
      ? { id: row.id, name: row.name, image: row.image, sortOrder: row.sortOrder }
      : { sortOrder: nextOrder(place.menus) },
  );
  menuDialog.value = true;
}

/** Saves; `again` leaves the dialog open, emptied, for the restaurant's next dish. */
async function saveMenu(again = false): Promise<void> {
  const payload = {
    placeId: menuForm.placeId,
    name: menuForm.name.trim(),
    image: menuForm.image || null,
    sortOrder: menuForm.sortOrder,
  };
  savingMenu.value = true;
  try {
    if (menuForm.id) await http.put(`/food-trails/menus/${menuForm.id}`, payload);
    else await http.post('/food-trails/menus', payload);
    ElMessage.success('บันทึกแล้ว');
    await load();
    const place = trail.value?.places.find((p) => p.id === payload.placeId);
    if (again && place) openMenu(place);
    else menuDialog.value = false;
  } finally {
    savingMenu.value = false;
  }
}

async function removeMenu(row: FoodMenu): Promise<void> {
  if (!(await confirmDelete(row.name))) return;
  await http.delete(`/food-trails/menus/${row.id}`);
  ElMessage.success('ลบแล้ว');
  await load();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <ElButton text @click="$router.push({ name: 'food-trails' })">← ตามรอยร้านอาหาร</ElButton>
        <h1>{{ trail?.name ?? '…' }}</h1>
        <p v-if="trail" class="hint">
          ID {{ trail.id }} · {{ trail.places.length }} ร้าน · {{ menuCount }} เมนู ·
          {{ trail.isActive ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ' }}
        </p>
      </div>
    </div>

    <ElTabs v-model="tab">
      <ElTabPane label="ร้าน & เมนู" name="places">
        <div class="toolbar">
          <ElButton v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE" type="primary" @click="openPlace()">
            + เพิ่มร้าน
          </ElButton>
          <span class="hint">รูปร้านและรูปเมนูใช้ในรูปตามรอยเท่านั้น ไม่แสดงบนหน้าเว็บ</span>
        </div>

        <div v-loading="loading" class="places">
          <ElEmpty v-if="trail && !trail.places.length" description="ยังไม่มีร้าน" />

          <ElCard v-for="(place, i) in trail?.places ?? []" :key="place.id" shadow="never" class="place">
            <div class="place-head">
              <div class="num">{{ i + 1 }}</div>
              <img v-if="place.image" :src="place.image" class="place-img" alt="" />
              <div class="place-text">
                <div class="place-name">{{ place.name }}</div>
                <div v-if="place.note" class="hint pre">{{ place.note }}</div>
              </div>
              <div v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE" class="actions">
                <ElButton size="small" type="primary" plain @click="openMenu(place)">+ เมนู</ElButton>
                <ElButton size="small" @click="openPlace(place)">แก้ไข</ElButton>
                <ElButton size="small" type="danger" text @click="removePlace(place)">ลบ</ElButton>
              </div>
            </div>

            <div v-if="place.menus.length" class="menus">
              <div v-for="menu in place.menus" :key="menu.id" class="menu">
                <img v-if="menu.image" :src="menu.image" class="menu-img" alt="" />
                <div v-else class="menu-img empty">🍽️</div>
                <div class="menu-name">{{ menu.name }}</div>
                <div v-permission="PERMISSIONS.FOOD_TRAILS_MANAGE" class="menu-actions">
                  <ElButton size="small" text @click="openMenu(place, menu)">แก้ไข</ElButton>
                  <ElButton size="small" type="danger" text @click="removeMenu(menu)">ลบ</ElButton>
                </div>
              </div>
            </div>
            <p v-else class="hint">ยังไม่มีเมนู</p>
          </ElCard>
        </div>
      </ElTabPane>

      <ElTabPane label="รูปตามรอย" name="poster" lazy>
        <FoodTrailPoster v-if="trail" :trail="trail" />
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="placeDialog" :title="placeForm.id ? 'แก้ไขร้าน' : 'เพิ่มร้าน'" width="520px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อร้าน" required>
          <ElInput v-model="placeForm.name" maxlength="200" />
        </ElFormItem>
        <ElFormItem label="รายละเอียด">
          <ElInput
            v-model="placeForm.note"
            type="textarea"
            :rows="3"
            maxlength="1000"
            placeholder="เช่น ย่าน / สาขา / เวลาเปิด (แสดงบนเว็บและบนรูป)"
          />
        </ElFormItem>
        <ElFormItem label="รูปร้าน (ใช้ในรูปตามรอยเท่านั้น)">
          <MediaPicker v-model="placeForm.image" />
        </ElFormItem>
        <ElFormItem label="ลำดับ">
          <ElInputNumber v-model="placeForm.sortOrder" :step="1" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="placeDialog = false">ยกเลิก</ElButton>
        <ElButton type="primary" :loading="savingPlace" :disabled="!placeForm.name.trim()" @click="savePlace">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="menuDialog" :title="menuForm.id ? 'แก้ไขเมนู' : `เพิ่มเมนู · ${menuPlaceName}`" width="520px">
      <ElForm label-position="top" @submit.prevent>
        <ElFormItem label="ชื่อเมนู" required>
          <ElInput v-model="menuForm.name" maxlength="200" />
        </ElFormItem>
        <ElFormItem label="รูปเมนู (ใช้ในรูปตามรอยเท่านั้น)">
          <MediaPicker v-model="menuForm.image" />
        </ElFormItem>
        <ElFormItem label="ลำดับ">
          <ElInputNumber v-model="menuForm.sortOrder" :step="1" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="menuDialog = false">ยกเลิก</ElButton>
        <ElButton v-if="!menuForm.id" :loading="savingMenu" :disabled="!menuForm.name.trim()" @click="saveMenu(true)">
          บันทึกแล้วเพิ่มอีก
        </ElButton>
        <ElButton type="primary" :loading="savingMenu" :disabled="!menuForm.name.trim()" @click="saveMenu()">
          บันทึก
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.hint { font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.5; margin: 0; }
.pre { white-space: pre-line; }
.toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.places { display: grid; gap: 12px; min-height: 80px; }
.place-head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.num {
  flex: 0 0 32px; height: 32px; border-radius: 50%;
  background: var(--el-color-primary); color: #fff; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.place-img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; }
.place-text { flex: 1 1 180px; min-width: 0; }
.place-name { font-weight: 700; font-size: 16px; }
.actions { display: flex; gap: 4px; flex-wrap: wrap; }
.menus {
  margin-top: 12px;
  display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
.menu { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 6px; text-align: center; }
.menu-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; display: block; }
.menu-img.empty {
  display: flex; align-items: center; justify-content: center;
  background: var(--el-fill-color-light); font-size: 28px;
}
.menu-name { font-size: 13px; margin-top: 4px; overflow-wrap: anywhere; }
.menu-actions { display: flex; justify-content: center; }
.menu-actions .el-button + .el-button { margin-left: 0; }
</style>
