<script setup lang="ts">
/**
 * The event itself: names, the reveal, the donation project behind decorations and secret
 * fertiliser, and the flower a mix gets when no recipe matches it.
 *
 * Opening the garden by hand lives here too, behind a confirm — once people have seen their
 * flowers there is no taking it back.
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { http } from '@/api/http';
import MediaPicker from '@/components/MediaPicker.vue';
import { PERMISSIONS, type ApiResponse } from '@cms/shared';

const props = defineProps<{ event: any }>();
const emit = defineEmits<{ update: [event: any] }>();

const fields = [
  'title',
  'slug',
  'description',
  'coverImage',
  'fieldImage',
  'themeColor',
  'revealAt',
  'isActive',
  'isOpen',
  'donationProjectId',
  'secretTokenPrice',
  'defaultDesignId',
] as const;

const form = reactive<Record<string, any>>({});
function load(): void {
  for (const key of fields) form[key] = props.event[key];
  form.revealAt = new Date(props.event.revealAt);
}
watch(() => props.event, load, { immediate: true });

const projects = ref<any[]>([]);
void http
  .get<ApiResponse<any[]>>('/donation-projects', { params: { limit: 100 } })
  .then(({ data }) => (projects.value = data.data));

const saving = ref(false);
async function save(): Promise<void> {
  saving.value = true;
  try {
    const { data } = await http.put<ApiResponse<any>>(`/garden/${props.event.id}`, {
      ...form,
      donationProjectId: form.donationProjectId || null,
      defaultDesignId: form.defaultDesignId || null,
    });
    emit('update', data.data);
    ElMessage.success('บันทึกแล้ว');
  } finally {
    saving.value = false;
  }
}

const recomputing = ref(false);
async function recompute(): Promise<void> {
  recomputing.value = true;
  try {
    const { data } = await http.post<ApiResponse<{ changed: number }>>(
      `/garden/${props.event.id}/recompute`,
    );
    ElMessage.success(`คำนวณใหม่แล้ว เปลี่ยนแบบดอก ${data.data.changed} ต้น`);
  } finally {
    recomputing.value = false;
  }
}

async function revealNow(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      'ทุกต้นจะบานและทุกคนจะเห็นหน้าตาดอกทันที ปิดรับการปลูกและการใส่ปุ๋ยลับด้วย ย้อนกลับไม่ได้ ต้องการเปิดสวนตอนนี้ใช่หรือไม่?',
      'เปิดสวนก่อนกำหนด',
      {
        type: 'warning',
        confirmButtonText: 'เปิดสวนเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonType: 'danger',
      },
    );
  } catch {
    return;
  }
  const { data } = await http.post<ApiResponse<any>>(`/garden/${props.event.id}/reveal`);
  emit('update', data.data);
  ElMessage.success('เปิดสวนแล้ว');
}

const designsForDefault = () => props.event.designs.filter((d: any) => d.isActive);
</script>

<template>
  <ElForm label-position="top">
    <ElRow :gutter="16">
      <ElCol :span="12">
        <ElFormItem label="ชื่อสวน"><ElInput v-model="form.title" /></ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="Slug (ใช้ใน URL)"><ElInput v-model="form.slug" /></ElFormItem>
      </ElCol>
      <ElCol :span="24">
        <ElFormItem label="คำอธิบาย (แสดงบนหน้าปลูกและแปลงรวม)">
          <ElInput v-model="form.description" type="textarea" :rows="3" />
        </ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="วันและเวลาที่ทุกต้นบาน (เวลาในเครื่องนี้)">
          <ElDatePicker v-model="form.revealAt" type="datetime" style="width: 100%" />
          <div class="hint text-muted">ปิดรับการปลูกและปุ๋ยลับพร้อมกันในเวลานี้</div>
        </ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="สีหลักของสวน"><ElColorPicker v-model="form.themeColor" /></ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="ภาพหน้าปก (ใช้ตอนแชร์ลิงก์)"
          ><MediaPicker v-model="form.coverImage"
        /></ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="ฉากแปลงดิน (พื้นหลังของแปลงรวม)"
          ><MediaPicker v-model="form.fieldImage"
        /></ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="แบบดอกตั้งต้น (เมื่อปุ๋ยไม่เข้าสูตรไหนเลย)">
          <ElSelect
            v-model="form.defaultDesignId"
            placeholder="เลือกแบบดอก"
            clearable
            style="width: 100%"
          >
            <ElOption v-for="d in designsForDefault()" :key="d.id" :label="d.name" :value="d.id" />
          </ElSelect>
          <div class="hint text-muted">
            ต้องเลือกก่อนถึงจะเปิดรับปลูกได้ เพิ่มแบบดอกได้ที่แท็บ "แบบดอกทานตะวัน"
          </div>
        </ElFormItem>
      </ElCol>
    </ElRow>

    <ElDivider content-position="left">โดเนทและปุ๋ยลับ</ElDivider>
    <ElRow :gutter="16">
      <ElCol :span="12">
        <ElFormItem label="โปรเจกต์โดเนท">
          <ElSelect
            v-model="form.donationProjectId"
            placeholder="ไม่ผูก"
            clearable
            style="width: 100%"
          >
            <ElOption v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </ElSelect>
          <div class="hint text-muted">
            ยอดของโปรเจกต์นี้ใช้ปลดล็อคของตกแต่ง และ token ของโปรเจกต์นี้ใช้ซื้อปุ๋ยลับ (อัตรา token
            ตั้งที่โปรเจกต์โดเนท)
          </div>
        </ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="ราคาปุ๋ยลับ (token ต่อแบบ เท่ากันทุกแบบ)">
          <ElInputNumber v-model="form.secretTokenPrice" :min="1" :max="100000" />
        </ElFormItem>
      </ElCol>
    </ElRow>

    <ElFormItem label="การเปิดรับ">
      <div class="switches">
        <ElSwitch v-model="form.isActive" active-text="เปิดใช้งานหน้านี้บนเว็บไซต์" />
        <ElSwitch v-model="form.isOpen" active-text="เปิดรับการปลูก" />
      </div>
      <div class="hint text-muted">ปิด "เปิดรับการปลูก" แล้วแปลงรวมยังดูได้ตามปกติ</div>
    </ElFormItem>
  </ElForm>

  <ElButton v-permission="PERMISSIONS.GARDEN_MANAGE" type="primary" :loading="saving" @click="save">
    บันทึก
  </ElButton>

  <ElDivider content-position="left">เครื่องมือ</ElDivider>
  <div class="tools">
    <div>
      <ElButton
        v-permission="PERMISSIONS.GARDEN_MANAGE"
        :loading="recomputing"
        :disabled="event.revealed"
        @click="recompute"
      >
        คำนวณแบบดอกใหม่ทั้งหมด
      </ElButton>
      <div class="hint text-muted">
        ใช้หลังแก้สูตร เพื่อให้ต้นที่ปลูกไปแล้วได้แบบดอกตามสูตรใหม่ ทำได้เฉพาะก่อนวันเปิดผล
        (ไม่กระทบต้นที่ใส่ปุ๋ยลับ)
      </div>
    </div>
    <div>
      <ElButton
        v-permission="PERMISSIONS.GARDEN_MANAGE"
        type="danger"
        plain
        :disabled="event.revealed"
        @click="revealNow"
      >
        {{ event.revealed ? 'สวนบานแล้ว' : 'เปิดสวนตอนนี้' }}
      </ElButton>
      <div class="hint text-muted">ปกติไม่ต้องกด สวนจะบานเองเมื่อถึงเวลาที่ตั้งไว้</div>
    </div>
  </div>
</template>

<style scoped>
.hint {
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.5;
}
.switches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tools {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
