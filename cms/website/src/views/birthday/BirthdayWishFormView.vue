<script setup lang="ts">
/**
 * Write a birthday wish.
 *
 * The whole page is one preview with a form beside it: every choice — shape, colour,
 * photo framing, present — redraws the same balloon that will later float on the wall,
 * so nothing about the result is a surprise. On a phone the preview sits on top and
 * sticks, which keeps it in sight while the fields scroll under it.
 *
 * The gift catalogue is admin data, so it is the one thing this screen has to fetch
 * before it can be used.
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import {
  fetchEvent,
  isPlaceholderGift,
  submitWish,
  type BirthdayEvent,
  type Gift,
  type WishDraft,
} from '@/api/birthday';
import { DEFAULT_COLOR, DEFAULT_FRAMING, type BalloonShapeId } from '@/components/birthday/balloon';
import BalloonColorPicker from '@/components/birthday/BalloonColorPicker.vue';
import BalloonShapePicker from '@/components/birthday/BalloonShapePicker.vue';
import GiftPicker from '@/components/birthday/GiftPicker.vue';
import PhotoFramer from '@/components/birthday/PhotoFramer.vue';
import WishBalloon from '@/components/birthday/WishBalloon.vue';

const NAME_MAX = 60;
const MESSAGE_MAX = 300;

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug || 'birthday');

const event = ref<BirthdayEvent | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const result = ref<{ message: string } | null>(null);

const draft = reactive<WishDraft>({
  name: '',
  message: '',
  balloonShape: 'round' as BalloonShapeId,
  balloonColor: DEFAULT_COLOR,
  giftId: null,
  photo: null,
  photoFraming: { ...DEFAULT_FRAMING },
});

const errors = reactive<Record<string, string>>({});

const notFound = ref(false);

void (async () => {
  try {
    const e = await fetchEvent(slug);
    event.value = e;
    applySeo({
      title: e.celebrantName ? `${e.title} — ${e.celebrantName}` : e.title,
      metaDescription: e.description ?? 'ส่งคำอวยพรวันเกิดพร้อมลูกโป่งและของขวัญ',
      ogImage: e.coverImage ?? undefined,
    });
    draft.giftId ??= e.gifts[0]?.id ?? null;
  } catch (err: any) {
    // No event means no gift catalogue and nowhere to post — a dead end, not a form to
    // fill in and have rejected on submit.
    notFound.value = err?.response?.status === 404;
    submitError.value = notFound.value
      ? 'ไม่พบงานวันเกิดนี้ อาจถูกปิดไปแล้วหรือลิงก์ไม่ถูกต้อง'
      : 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  } finally {
    loading.value = false;
  }
})();

/**
 * True while the admin has not added any gift yet: the picker is showing stand-ins the
 * server would reject, so submitting is held rather than failing at the end of the form.
 */
const catalogueMissing = computed(() => isPlaceholderGift(draft.giftId));

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');
const gifts = computed<Gift[]>(() => event.value?.gifts ?? []);
const selectedGift = computed(() => gifts.value.find((g) => g.id === draft.giftId) ?? null);
/** The tag shows the sender's name; a placeholder keeps the preview from collapsing while empty. */
const previewName = computed(() => draft.name.trim() || 'ชื่อของคุณ');

/**
 * The chosen photo's object URL, owned here because both the framer and the whole-wish
 * preview draw from it — minting one apiece would leak the other on every change.
 */
const photoUrl = ref<string | null>(null);
function setPhoto(file: File | null): void {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  photoUrl.value = file ? URL.createObjectURL(file) : null;
  draft.photo = file;
}
onBeforeUnmount(() => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
});

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  if (!draft.name.trim()) errors.name = 'กรุณากรอกชื่อของคุณ';
  else if (draft.name.trim().length > NAME_MAX) errors.name = `ชื่อยาวไม่เกิน ${NAME_MAX} ตัวอักษร`;
  if (!draft.message.trim()) errors.message = 'กรุณาเขียนคำอวยพร';
  else if (draft.message.trim().length > MESSAGE_MAX)
    errors.message = `คำอวยพรยาวไม่เกิน ${MESSAGE_MAX} ตัวอักษร`;
  if (gifts.value.length && draft.giftId === null) errors.gift = 'กรุณาเลือกของขวัญ';
  return Object.keys(errors).length === 0;
}

async function submit(): Promise<void> {
  if (submitting.value || !validate()) {
    // Send focus to what needs fixing rather than leaving the visitor to hunt for it.
    document.querySelector<HTMLElement>('[data-error="true"]')?.focus();
    return;
  }
  submitting.value = true;
  submitError.value = null;
  try {
    const response = await submitWish(slug, draft);
    result.value = { message: response.message || 'ส่งคำอวยพรเรียบร้อยแล้ว' };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err: any) {
    for (const e of err?.response?.data?.errors ?? []) errors[e.field] = e.message;
    submitError.value =
      err?.response?.status === 429
        ? 'ส่งคำอวยพรถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
        : (err?.response?.data?.message ?? 'ส่งคำอวยพรไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  } finally {
    submitting.value = false;
  }
}

function writeAnother(): void {
  result.value = null;
  draft.name = '';
  draft.message = '';
  setPhoto(null);
  draft.photoFraming = { ...DEFAULT_FRAMING };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent';
</script>

<template>
  <div class="page-bg font-sukhumvit">
    <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">กำลังโหลด…</div>

    <!-- No such event: nothing to write on -->
    <div v-else-if="!event" class="container-site max-w-lg py-24 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
      <h1 class="mb-2 text-xl font-bold">{{ notFound ? 'ไม่พบงานวันเกิดนี้' : 'โหลดข้อมูลไม่สำเร็จ' }}</h1>
      <p class="text-gray-600">{{ submitError }}</p>
    </div>

    <!-- Sent -->
    <div v-else-if="result" class="container-site max-w-xl py-16 text-center">
      <div class="mx-auto mb-6 w-fit" style="--balloon-w: 190px">
        <WishBalloon
          :shape="draft.balloonShape"
          :color="draft.balloonColor"
          :photo-url="photoUrl"
          :framing="draft.photoFraming"
          :gift-image="selectedGift?.imageUrl"
          :name="previewName"
        />
      </div>
      <h1 class="mb-2 text-2xl font-extrabold">ส่งคำอวยพรแล้ว 🎉</h1>
      <p class="mb-8 text-gray-600">{{ result.message }}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          class="btn-solid"
          :style="{ background: themeColor }"
          @click="router.push({ name: 'birthday-wall', params: { slug } })"
        >
          ดูลูกโป่งคำอวยพร
        </button>
        <button type="button" class="btn-outline" @click="writeAnother">เขียนอีกใบ</button>
      </div>
    </div>

    <!-- Closed by the admin -->
    <div v-else-if="event && !event.isOpen" class="container-site max-w-xl py-20 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
      <h1 class="mb-2 text-xl font-bold">ปิดรับคำอวยพรแล้ว</h1>
      <p class="mb-6 text-gray-600">ขอบคุณทุกคนที่ร่วมส่งคำอวยพรนะคะ</p>
      <RouterLink :to="{ name: 'birthday-wall', params: { slug } }" class="btn-solid" :style="{ background: themeColor }">
        ดูลูกโป่งคำอวยพร
      </RouterLink>
    </div>

    <div v-else-if="event" class="container-site max-w-5xl py-8 sm:py-12">
      <header class="mb-8 text-center">
        <h1 class="text-2xl font-extrabold sm:text-4xl">{{ event.title }}</h1>
        <p v-if="event.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
          สุขสันต์วันเกิด {{ event.celebrantName }}
        </p>
        <p v-if="event.description" class="mx-auto mt-2 max-w-xl text-gray-600">{{ event.description }}</p>
      </header>

      <div class="layout">
        <!-- Preview: first in the DOM so it lands above the form on a phone. -->
        <aside class="preview">
          <div class="preview-inner">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">ตัวอย่าง</h2>
            <div class="preview-stage">
              <WishBalloon
                :shape="draft.balloonShape"
                :color="draft.balloonColor"
                :photo-url="photoUrl"
                :framing="draft.photoFraming"
                :gift-image="selectedGift?.imageUrl"
                :name="previewName"
              />
            </div>
            <p class="mt-4 text-xs text-gray-500">
              ลูกโป่งใบนี้จะลอยขึ้นบนหน้ารวมคำอวยพร กดที่ลูกโป่งเพื่ออ่านข้อความ
            </p>
          </div>
        </aside>

        <form class="form" novalidate @submit.prevent="submit">
          <div>
            <label for="wish-name" class="mb-2 block font-semibold text-gray-800">ชื่อของคุณ</label>
            <input
              id="wish-name"
              v-model="draft.name"
              type="text"
              :maxlength="NAME_MAX"
              autocomplete="name"
              placeholder="เช่น น้องมิ้นท์"
              :class="inputClass"
              :style="{ '--tw-ring-color': themeColor }"
              :aria-invalid="!!errors.name"
              :data-error="!!errors.name"
              aria-describedby="wish-name-error"
            />
            <p class="mt-1 text-xs text-gray-500">ชื่อนี้จะแสดงบนป้ายที่ผูกกับของขวัญ</p>
            <p v-if="errors.name" id="wish-name-error" class="mt-1 text-sm text-red-600" role="alert">
              {{ errors.name }}
            </p>
          </div>

          <div>
            <label for="wish-message" class="mb-2 block font-semibold text-gray-800">คำอวยพร</label>
            <textarea
              id="wish-message"
              v-model="draft.message"
              rows="4"
              :maxlength="MESSAGE_MAX"
              placeholder="เขียนคำอวยพรวันเกิด…"
              :class="inputClass"
              :style="{ '--tw-ring-color': themeColor }"
              :aria-invalid="!!errors.message"
              :data-error="!!errors.message"
              aria-describedby="wish-message-error"
            />
            <div class="mt-1 flex justify-between text-xs text-gray-500">
              <span>ข้อความจะแสดงเมื่อมีคนกดที่ลูกโป่ง</span>
              <span>{{ draft.message.length }}/{{ MESSAGE_MAX }}</span>
            </div>
            <p v-if="errors.message" id="wish-message-error" class="mt-1 text-sm text-red-600" role="alert">
              {{ errors.message }}
            </p>
          </div>

          <BalloonShapePicker v-model="draft.balloonShape" :color="draft.balloonColor" />
          <BalloonColorPicker v-model="draft.balloonColor" />

          <PhotoFramer
            :photo-url="photoUrl"
            :framing="draft.photoFraming"
            :shape="draft.balloonShape"
            :color="draft.balloonColor"
            @select="setPhoto"
            @clear="setPhoto(null)"
            @update:framing="draft.photoFraming = $event"
          />

          <div>
            <GiftPicker v-model="draft.giftId" :gifts="gifts" />
            <p v-if="catalogueMissing" class="mt-2 text-sm text-amber-700" role="status">
              ผู้จัดงานยังไม่ได้เพิ่มของขวัญ — ตัวเลือกด้านบนเป็นเพียงตัวอย่าง ยังส่งคำอวยพรไม่ได้
            </p>
            <p v-if="errors.gift" class="mt-1 text-sm text-red-600" role="alert">{{ errors.gift }}</p>
          </div>

          <p v-if="submitError" class="text-sm text-red-600" role="alert">{{ submitError }}</p>

          <button
            type="submit"
            class="btn-solid w-full"
            :style="{ background: themeColor }"
            :disabled="submitting || catalogueMissing"
          >
            {{ submitting ? 'กำลังส่ง…' : 'ส่งคำอวยพร 🎈' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 1.75rem;
}
@media (min-width: 900px) {
  .layout {
    /* Preview column first in the DOM, so it is also first in the reading order on a phone. */
    grid-template-columns: 300px minmax(0, 1fr);
    align-items: start;
  }
}

.preview-inner {
  border-radius: 18px;
  background: #fff;
  border: 1px solid #f3f4f6;
  box-shadow: 0 4px 14px rgb(0 0 0 / 6%);
  padding: 1.25rem;
  text-align: center;
}
@media (min-width: 900px) {
  .preview {
    position: sticky;
    /* Clears the floating site header, which grows with the viewport. */
    top: calc(var(--header-h) * 0.5 + 1rem);
  }
}
.preview-stage {
  display: flex;
  justify-content: center;
  --balloon-w: clamp(150px, 42vw, 210px);
}

.form {
  display: grid;
  gap: 1.5rem;
}

.btn-solid {
  @apply inline-block rounded-lg px-6 py-3 text-center font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50;
}
.btn-solid:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-outline {
  @apply rounded-lg border border-gray-300 px-6 py-3 font-medium transition hover:bg-gray-50;
}
</style>
