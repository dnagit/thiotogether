<script setup lang="ts">
/**
 * The DJ schedule: a month calendar of air time, and the list of DJs it is drawn from.
 *
 * Clicking a day adds a slot starting that day; clicking a slot on the calendar edits it.
 * A slot may run past midnight — it then shows on both days, as it does on the website.
 *
 * On a phone the month grid is too narrow to read, so the calendar becomes a list of the
 * month's days that have DJs, the DJs a list of cards, and the date fields the phone's own
 * date-and-time pickers.
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useIsMobile } from '@/composables/useIsMobile';
import { http } from '@/api/http';
import { useCrud } from '@/composables/useCrud';
import { useAuthStore } from '@/stores/auth';
import { confirmDelete } from '@/utils/confirm';
import MediaPicker from '@/components/MediaPicker.vue';
import SocialImagePanel from './SocialImagePanel.vue';
import {
  PERMISSIONS,
  type ApiResponse,
  type DjScheduleAppearance,
  type DjScheduleSettings,
} from '@cms/shared';

interface Dj {
  id: number;
  name: string;
  image: string | null;
  note: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface Slot {
  id: number;
  djId: number;
  startsAt: string;
  endsAt: string;
  note: string | null;
  dj: { id: number; name: string; image: string | null };
}

const auth = useAuthStore();
const canManage = computed(() => auth.can(PERMISSIONS.DJ_SCHEDULE_MANAGE));

const tab = ref<'calendar' | 'djs' | 'settings' | 'social'>('calendar');
const isMobile = useIsMobile();

// ── DJs ─────────────────────────────────────────────────────

const djCrud = useCrud<Dj>({ endpoint: '/dj-schedule/djs' });

/** Every DJ, for the slot form's picker — the table above is paginated. */
const allDjs = ref<Dj[]>([]);
async function loadAllDjs(): Promise<void> {
  const { data } = await http.get<ApiResponse<Dj[]>>('/dj-schedule/djs', {
    params: { limit: 100 },
  });
  allDjs.value = data.data;
}
void loadAllDjs();

const djDialog = ref(false);
const djBlank = {
  id: null as number | null,
  name: '',
  image: null as string | null,
  note: '',
  isActive: true,
  sortOrder: 0,
};
const djForm = reactive({ ...djBlank });

function openDj(row?: Dj): void {
  Object.assign(djForm, djBlank, row ?? {});
  djDialog.value = true;
}

async function saveDj(): Promise<void> {
  const payload = {
    name: djForm.name,
    image: djForm.image || null,
    note: djForm.note || null,
    isActive: djForm.isActive,
    sortOrder: Number(djForm.sortOrder) || 0,
  };
  if (djForm.id) await djCrud.updateItem(djForm.id, payload);
  else await djCrud.createItem(payload);
  djDialog.value = false;
  await Promise.all([loadAllDjs(), loadSlots()]);
}

async function deleteDj(row: Dj): Promise<void> {
  await djCrud.deleteItem(row.id, row.name);
  await Promise.all([loadAllDjs(), loadSlots()]);
}

// ── Settings ────────────────────────────────────────────────

/** The block's look. The social-post template is saved from its own tab. */
const settings = reactive<DjScheduleAppearance>({
  backgroundImage: null,
  backgroundColor: null,
  textColor: null,
});
const savingSettings = ref(false);

void (async () => {
  const { data } = await http.get<ApiResponse<DjScheduleSettings>>('/dj-schedule/settings');
  Object.assign(settings, data.data);
})();

async function saveSettings(): Promise<void> {
  savingSettings.value = true;
  try {
    const { data } = await http.put<ApiResponse<DjScheduleSettings>>('/dj-schedule/settings', {
      backgroundImage: settings.backgroundImage,
      backgroundColor: settings.backgroundColor,
      textColor: settings.textColor,
    });
    Object.assign(settings, {
      backgroundImage: data.data.backgroundImage,
      backgroundColor: data.data.backgroundColor,
      textColor: data.data.textColor,
    });
    ElMessage.success(data.message ?? 'บันทึกแล้ว');
  } finally {
    savingSettings.value = false;
  }
}

// ── Calendar ────────────────────────────────────────────────

const month = ref(new Date());
const slots = ref<Slot[]>([]);
const loadingSlots = ref(false);

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeText = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The calendar shows parts of the months either side, so ask for a week beyond each end. */
const range = computed(() => {
  const m = month.value;
  return {
    from: new Date(m.getFullYear(), m.getMonth(), 1 - 7),
    to: new Date(m.getFullYear(), m.getMonth() + 1, 1 + 14),
  };
});
const rangeKey = computed(() => range.value.from.getTime());

async function loadSlots(): Promise<void> {
  loadingSlots.value = true;
  try {
    const { data } = await http.get<ApiResponse<Slot[]>>('/dj-schedule/slots', {
      params: { from: range.value.from.toISOString(), to: range.value.to.toISOString() },
    });
    slots.value = data.data;
  } finally {
    loadingSlots.value = false;
  }
}
watch(rangeKey, loadSlots, { immediate: true });

/** Slots touching each local day, keyed `YYYY-MM-DD`. A slot past midnight lands on both. */
const slotsByDay = computed(() => {
  const map = new Map<string, Slot[]>();
  for (const s of slots.value) {
    const start = new Date(s.startsAt);
    const end = new Date(s.endsAt);
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (day < end) {
      const key = dayKey(day);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
      day.setDate(day.getDate() + 1);
    }
  }
  return map;
});

// ── Phone: the month as a list ──────────────────────────────

const monthLabel = computed(() =>
  month.value.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
);
function shiftMonth(by: number): void {
  const m = month.value;
  month.value = new Date(m.getFullYear(), m.getMonth() + by, 1);
}

/** This month's days that have DJs, in order, each with its slots sorted by start. */
const agenda = computed(() => {
  const m = month.value;
  const days: Array<{ key: string; label: string; isToday: boolean; slots: Slot[] }> = [];
  const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const todayKey = dayKey(new Date());
  for (let d = 1; d <= last; d++) {
    const date = new Date(m.getFullYear(), m.getMonth(), d);
    const key = dayKey(date);
    const list = slotsByDay.value.get(key);
    if (!list?.length) continue;
    days.push({
      key,
      label: date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }),
      isToday: key === todayKey,
      slots: [...list].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    });
  }
  return days;
});

/** "09:00–12:00", with the end's day when it runs past midnight. */
function slotRange(s: Slot): string {
  const a = new Date(s.startsAt);
  const b = new Date(s.endsAt);
  const sameDay = dayKey(a) === dayKey(b);
  const end = sameDay
    ? timeText(s.endsAt)
    : `${b.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${timeText(s.endsAt)}`;
  return `${timeText(s.startsAt)}–${end}`;
}

/** New slot from the list: today when looking at this month, else the 1st. */
function openNewSlotFromList(): void {
  const now = new Date();
  const m = month.value;
  const sameMonth = now.getFullYear() === m.getFullYear() && now.getMonth() === m.getMonth();
  openNewSlot(dayKey(sameMonth ? now : new Date(m.getFullYear(), m.getMonth(), 1)));
}

// ── Slot form ───────────────────────────────────────────────

const slotDialog = ref(false);
const slotForm = reactive({
  id: null as number | null,
  djId: null as number | null,
  startsAt: null as Date | null,
  endsAt: null as Date | null,
  note: '',
  repeatEvery: '' as '' | 'day' | 'week',
  repeatCount: 1,
});
const savingSlot = ref(false);

/** A Date as `<input type="datetime-local">` wants it: local time, to the minute. */
const toLocalInput = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    : '';
const fromLocalInput = (v: string) => (v ? new Date(v) : null);
const startsAtInput = computed({
  get: () => toLocalInput(slotForm.startsAt),
  set: (v: string) => (slotForm.startsAt = fromLocalInput(v)),
});
const endsAtInput = computed({
  get: () => toLocalInput(slotForm.endsAt),
  set: (v: string) => (slotForm.endsAt = fromLocalInput(v)),
});

function openNewSlot(day: string): void {
  if (!canManage.value) return;
  const [y, m, d] = day.split('-').map(Number);
  Object.assign(slotForm, {
    id: null,
    djId: null,
    startsAt: new Date(y, m - 1, d, 18, 0),
    endsAt: new Date(y, m - 1, d, 20, 0),
    note: '',
    repeatEvery: '',
    repeatCount: 1,
  });
  slotDialog.value = true;
}

function openSlot(s: Slot): void {
  if (!canManage.value) return;
  Object.assign(slotForm, {
    id: s.id,
    djId: s.djId,
    startsAt: new Date(s.startsAt),
    endsAt: new Date(s.endsAt),
    note: s.note ?? '',
    repeatEvery: '',
    repeatCount: 1,
  });
  slotDialog.value = true;
}

async function saveSlot(): Promise<void> {
  if (!slotForm.djId || !slotForm.startsAt || !slotForm.endsAt) return;
  if (slotForm.endsAt <= slotForm.startsAt) {
    ElMessage.warning('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
    return;
  }
  const body = {
    djId: slotForm.djId,
    startsAt: slotForm.startsAt.toISOString(),
    endsAt: slotForm.endsAt.toISOString(),
    note: slotForm.note || null,
  };
  savingSlot.value = true;
  try {
    const { data } = slotForm.id
      ? await http.put<ApiResponse<Slot>>(`/dj-schedule/slots/${slotForm.id}`, body)
      : await http.post<ApiResponse<Slot[]>>('/dj-schedule/slots', {
          ...body,
          repeatEvery: slotForm.repeatEvery || null,
          repeatCount: slotForm.repeatEvery ? slotForm.repeatCount : 1,
        });
    ElMessage.success(data.message ?? 'บันทึกแล้ว');
    slotDialog.value = false;
    await loadSlots();
  } finally {
    savingSlot.value = false;
  }
}

async function deleteSlot(): Promise<void> {
  if (!slotForm.id) return;
  const dj = allDjs.value.find((d) => d.id === slotForm.djId);
  if (
    !(await confirmDelete(
      `${dj?.name ?? 'DJ'} ${slotForm.startsAt?.toLocaleString('th-TH') ?? ''}`,
    ))
  )
    return;
  await http.delete(`/dj-schedule/slots/${slotForm.id}`);
  ElMessage.success('ลบแล้ว');
  slotDialog.value = false;
  await loadSlots();
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>ตาราง DJ</h1>
      <ElButton
        v-if="tab === 'djs'"
        v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
        type="primary"
        @click="openDj()"
      >
        + เพิ่ม DJ
      </ElButton>
    </div>

    <ElTabs v-model="tab">
      <ElTabPane label="ปฏิทิน" name="calendar">
        <!-- Phone: the month as a list of days with DJs -->
        <ElCard v-if="isMobile" v-loading="loadingSlots">
          <div class="agenda-head">
            <ElButton circle aria-label="เดือนก่อนหน้า" @click="shiftMonth(-1)">‹</ElButton>
            <strong>{{ monthLabel }}</strong>
            <ElButton circle aria-label="เดือนถัดไป" @click="shiftMonth(1)">›</ElButton>
          </div>
          <ElButton v-if="canManage" type="primary" class="agenda-add" @click="openNewSlotFromList">
            + เพิ่มช่วงเวลา
          </ElButton>
          <p v-if="!agenda.length && !loadingSlots" class="hint agenda-empty">
            เดือนนี้ยังไม่มีคิว DJ · วันที่ไม่มี DJ จะแสดงเป็น Closed บนเว็บ
          </p>
          <section v-for="d in agenda" :key="d.key" class="agenda-day">
            <div class="agenda-date" :class="{ today: d.isToday }">
              <span>{{ d.label }}</span>
              <ElButton
                v-if="canManage"
                size="small"
                text
                type="primary"
                @click="openNewSlot(d.key)"
              >
                + เพิ่ม
              </ElButton>
            </div>
            <button
              v-for="s in d.slots"
              :key="s.id"
              type="button"
              class="agenda-slot"
              @click="openSlot(s)"
            >
              <img v-if="s.dj.image" :src="s.dj.image" alt="" class="agenda-avatar" />
              <span v-else class="agenda-avatar blank">🎙️</span>
              <span class="agenda-body">
                <span class="agenda-name">{{ s.dj.name }}</span>
                <span class="agenda-time">{{ slotRange(s) }}</span>
                <span v-if="s.note" class="agenda-note">{{ s.note }}</span>
              </span>
              <span v-if="canManage" class="agenda-chevron" aria-hidden="true">›</span>
            </button>
          </section>
        </ElCard>

        <ElCard v-else v-loading="loadingSlots">
          <p class="hint">
            คลิกที่วันเพื่อเพิ่มช่วงเวลา · คลิกที่ชื่อ DJ เพื่อแก้ไขหรือลบ · วันที่ไม่มี DJ
            จะแสดงเป็น Closed บนเว็บ
          </p>
          <ElCalendar v-model="month">
            <template #date-cell="{ data }">
              <div class="cell" @click="openNewSlot(data.day)">
                <span class="cell-day">{{ Number(data.day.slice(-2)) }}</span>
                <button
                  v-for="s in slotsByDay.get(data.day) ?? []"
                  :key="s.id"
                  type="button"
                  class="chip"
                  :title="`${s.dj.name} ${timeText(s.startsAt)}–${timeText(s.endsAt)}`"
                  @click.stop="openSlot(s)"
                >
                  <b>{{ timeText(s.startsAt) }}–{{ timeText(s.endsAt) }}</b> {{ s.dj.name }}
                </button>
              </div>
            </template>
          </ElCalendar>
        </ElCard>
      </ElTabPane>

      <ElTabPane label="รายชื่อ DJ" name="djs">
        <ElCard>
          <div class="toolbar">
            <ElInput
              v-model="djCrud.query.search"
              placeholder="ค้นหา…"
              clearable
              style="width: 240px"
            />
          </div>
          <!-- Phone: one card per DJ instead of a table too wide to read -->
          <div v-if="isMobile" v-loading="djCrud.loading.value" class="dj-cards">
            <div v-for="row in djCrud.items.value" :key="row.id" class="dj-card">
              <img v-if="row.image" :src="row.image" alt="" class="agenda-avatar" />
              <span v-else class="agenda-avatar blank">🎙️</span>
              <span class="agenda-body">
                <span class="agenda-name">{{ row.name }}</span>
                <span v-if="row.note" class="agenda-note">{{ row.note }}</span>
                <ElTag size="small" :type="row.isActive ? 'success' : 'info'" class="dj-card-tag">
                  {{ row.isActive ? 'แสดง' : 'ซ่อน' }}
                </ElTag>
              </span>
              <span v-if="canManage" class="dj-card-actions">
                <ElButton size="small" @click="openDj(row)">แก้ไข</ElButton>
                <ElButton size="small" type="danger" text @click="deleteDj(row)">ลบ</ElButton>
              </span>
            </div>
            <p v-if="!djCrud.items.value.length" class="hint">ยังไม่มี DJ</p>
          </div>
          <ElTable v-else v-loading="djCrud.loading.value" :data="djCrud.items.value">
            <ElTableColumn label="รูป" width="80" align="center">
              <template #default="{ row }">
                <ElImage
                  v-if="row.image"
                  :src="row.image"
                  fit="cover"
                  style="width: 44px; height: 44px; border-radius: 50%"
                  :preview-src-list="[row.image]"
                  preview-teleported
                />
                <span v-else class="text-muted">—</span>
              </template>
            </ElTableColumn>
            <ElTableColumn prop="name" label="ชื่อ DJ" min-width="180" />
            <ElTableColumn prop="note" label="หมายเหตุ" min-width="180" />
            <ElTableColumn label="แสดงบนเว็บ" width="110" align="center">
              <template #default="{ row }">
                <ElTag size="small" :type="row.isActive ? 'success' : 'info'">{{
                  row.isActive ? 'แสดง' : 'ซ่อน'
                }}</ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn label="" width="160" fixed="right">
              <template #default="{ row }">
                <ElButton
                  v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
                  size="small"
                  @click="openDj(row as Dj)"
                  >แก้ไข</ElButton
                >
                <ElButton
                  v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
                  size="small"
                  type="danger"
                  text
                  @click="deleteDj(row as Dj)"
                  >ลบ</ElButton
                >
              </template>
            </ElTableColumn>
          </ElTable>
          <ElPagination
            v-model:current-page="djCrud.query.page"
            class="mt"
            layout="prev, pager, next, total"
            :total="djCrud.meta.value.total"
            :page-size="djCrud.query.limit"
          />
        </ElCard>
      </ElTabPane>
      <ElTabPane label="ตั้งค่า" name="settings">
        <ElCard>
          <ElForm label-position="top" class="settings-form">
            <h3 class="section-title">พื้นหลังของปฏิทิน</h3>
            <p class="hint">
              แสดงเต็มความกว้างด้านหลัง block ปฏิทิน DJ บนเว็บ · เว้นว่างไว้ = ใช้พื้นหลังของเว็บ
            </p>
            <ElFormItem label="รูปพื้นหลัง"
              ><MediaPicker v-model="settings.backgroundImage"
            /></ElFormItem>
            <div class="two">
              <ElFormItem label="สีพื้นหลัง (ใต้รูป หรือใช้แทนรูป)">
                <ElColorPicker v-model="settings.backgroundColor" show-alpha />
              </ElFormItem>
              <ElFormItem label="สีหัวข้อ (ตัวอักษรที่อยู่บนพื้นหลัง)">
                <ElColorPicker v-model="settings.textColor" />
              </ElFormItem>
            </div>

            <ElButton
              v-permission="PERMISSIONS.DJ_SCHEDULE_MANAGE"
              type="primary"
              :loading="savingSettings"
              @click="saveSettings"
            >
              บันทึกการตั้งค่า
            </ElButton>
          </ElForm>
        </ElCard>
      </ElTabPane>
      <ElTabPane label="รูปโพสต์" name="social">
        <!-- Mounted afresh each time the tab opens, so DJ pictures changed meanwhile show. -->
        <ElCard v-if="tab === 'social'">
          <SocialImagePanel />
        </ElCard>
      </ElTabPane>
    </ElTabs>

    <ElDialog v-model="djDialog" :title="djForm.id ? 'แก้ไข DJ' : 'เพิ่ม DJ'" width="480px">
      <ElForm label-position="top">
        <ElFormItem label="ชื่อ DJ" required
          ><ElInput v-model="djForm.name" placeholder="เช่น ฟันขาว"
        /></ElFormItem>
        <ElFormItem label="รูป (แสดงตอน ON AIR)"><MediaPicker v-model="djForm.image" /></ElFormItem>
        <ElFormItem label="หมายเหตุ"
          ><ElInput v-model="djForm.note" type="textarea" :rows="2"
        /></ElFormItem>
        <ElFormItem label="ลำดับ"
          ><ElInputNumber v-model="djForm.sortOrder" :step="1"
        /></ElFormItem>
        <ElFormItem
          ><ElCheckbox v-model="djForm.isActive"
            >แสดงบนเว็บ (ถ้าซ่อน ช่วงเวลาของ DJ นี้จะไม่แสดงด้วย)</ElCheckbox
          ></ElFormItem
        >
      </ElForm>
      <template #footer>
        <ElButton @click="djDialog = false">ยกเลิก</ElButton>
        <ElButton
          type="primary"
          :loading="djCrud.saving.value"
          :disabled="!djForm.name.trim()"
          @click="saveDj"
          >บันทึก</ElButton
        >
      </template>
    </ElDialog>

    <ElDialog
      v-model="slotDialog"
      :title="slotForm.id ? 'แก้ไขช่วงเวลา' : 'เพิ่มช่วงเวลา'"
      width="520px"
    >
      <ElForm label-position="top">
        <ElFormItem label="DJ" required>
          <ElSelect
            v-model="slotForm.djId"
            :filterable="!isMobile"
            placeholder="เลือก DJ"
            style="width: 100%"
          >
            <ElOption
              v-for="d in allDjs"
              :key="d.id"
              :label="d.isActive ? d.name : `${d.name} (ซ่อน)`"
              :value="d.id"
            >
              <span class="dj-option">
                <img v-if="d.image" :src="d.image" alt="" />
                {{ d.name }}<span v-if="!d.isActive" class="text-muted"> (ซ่อน)</span>
              </span>
            </ElOption>
          </ElSelect>
          <small v-if="!allDjs.length" class="text-muted"
            >ยังไม่มี DJ — เพิ่มที่แท็บ "รายชื่อ DJ" ก่อน</small
          >
        </ElFormItem>
        <div class="two">
          <ElFormItem label="เริ่ม" required>
            <input
              v-if="isMobile"
              v-model="startsAtInput"
              type="datetime-local"
              class="native-dt"
            />
            <ElDatePicker
              v-else
              v-model="slotForm.startsAt"
              type="datetime"
              format="DD/MM/YYYY HH:mm"
              style="width: 100%"
            />
          </ElFormItem>
          <ElFormItem label="ถึง" required>
            <input v-if="isMobile" v-model="endsAtInput" type="datetime-local" class="native-dt" />
            <ElDatePicker
              v-else
              v-model="slotForm.endsAt"
              type="datetime"
              format="DD/MM/YYYY HH:mm"
              style="width: 100%"
            />
          </ElFormItem>
        </div>
        <ElFormItem label="หมายเหตุ (แสดงใน popup)">
          <ElInput v-model="slotForm.note" maxlength="300" placeholder="เช่น ชื่อรายการ" />
        </ElFormItem>
        <ElFormItem v-if="!slotForm.id" label="ทำซ้ำ">
          <div class="repeat">
            <ElSelect v-model="slotForm.repeatEvery" style="width: 160px">
              <ElOption label="ไม่ทำซ้ำ" value="" />
              <ElOption label="ทุกวัน" value="day" />
              <ElOption label="ทุกสัปดาห์" value="week" />
            </ElSelect>
            <template v-if="slotForm.repeatEvery">
              <ElInputNumber v-model="slotForm.repeatCount" :min="1" :max="60" />
              <span>ครั้ง (รวมครั้งแรก)</span>
            </template>
          </div>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton v-if="slotForm.id" type="danger" text style="float: left" @click="deleteSlot"
          >ลบช่วงเวลานี้</ElButton
        >
        <ElButton @click="slotDialog = false">ยกเลิก</ElButton>
        <ElButton
          type="primary"
          :loading="savingSlot"
          :disabled="!slotForm.djId || !slotForm.startsAt || !slotForm.endsAt"
          @click="saveSlot"
        >
          บันทึก
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.mt {
  margin-top: 12px;
}
.hint {
  margin: 0 0 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

/* Element's own cell padding and fixed height, loosened for a list of chips. */
:deep(.el-calendar-table .el-calendar-day) {
  height: auto;
  min-height: 92px;
  padding: 0;
}
.cell {
  min-height: 92px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cell-day {
  font-size: 13px;
}
.chip {
  all: unset;
  display: block;
  font-size: 12px;
  line-height: 1.3;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger-dark-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.chip:hover,
.chip:focus-visible {
  background: var(--el-color-danger-light-7);
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.repeat {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.settings-form {
  max-width: 640px;
}
.section-title {
  margin: 8px 0 4px;
  font-size: 16px;
}
.section-title + .hint {
  margin-bottom: 12px;
}
.settings-form .section-title:not(:first-child) {
  margin-top: 24px;
}
/* ── Phone ── */
.agenda-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.agenda-add {
  width: 100%;
  margin-bottom: 8px;
}
.agenda-empty {
  text-align: center;
  padding: 16px 0;
}
.agenda-day {
  margin-top: 14px;
}
.agenda-date {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 700;
  font-size: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.agenda-date.today {
  color: var(--el-color-primary);
}
.agenda-slot,
.dj-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}
.agenda-slot {
  cursor: pointer;
  min-height: 56px;
}
.agenda-slot:active {
  background: var(--el-fill-color-light);
}
.agenda-avatar {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--el-fill-color);
}
.agenda-avatar.blank {
  display: grid;
  place-items: center;
}
.agenda-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.agenda-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.agenda-time {
  font-size: 13px;
  color: var(--el-color-danger);
  font-weight: 600;
}
.agenda-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.agenda-chevron {
  font-size: 20px;
  color: var(--el-text-color-placeholder);
}
.dj-card-tag {
  align-self: flex-start;
  margin-top: 4px;
}
.dj-card-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.dj-card-actions .el-button + .el-button {
  margin-left: 0;
}
.native-dt {
  width: 100%;
  box-sizing: border-box;
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 16px;
}
@media (max-width: 768px) {
  .two {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
.dj-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dj-option img {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}
</style>
