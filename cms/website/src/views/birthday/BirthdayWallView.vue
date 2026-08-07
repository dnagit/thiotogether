<script setup lang="ts">
/**
 * The wish wall as a full page: heading, the sky of balloons, and a standing invitation to
 * add one. The motion and the popup live in `BalloonSky`, which the CMS block reuses — this
 * view is the chrome and the data around it.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import { useBirthdayWall } from '@/composables/useBirthdayWall';
import BalloonSky from '@/components/birthday/BalloonSky.vue';

const route = useRoute();
const slug = String(route.params.slug || 'birthday');

/** Reading a message freezes the poll, so the list cannot change under the reader. */
const reading = ref(false);
const { event, wishes, loading, loadError, notFound } = useBirthdayWall(slug, {
  paused: () => reading.value,
});

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');

watch(event, (e) => {
  if (!e) return;
  applySeo({
    title: e.celebrantName ? `${e.title} — ${e.celebrantName}` : e.title,
    metaDescription: e.description ?? 'รวมคำอวยพรวันเกิดจากทุกคน',
    ogImage: e.coverImage ?? undefined,
  });
});
</script>

<template>
  <div class="page-bg font-sukhumvit">
    <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">กำลังโหลดคำอวยพร…</div>

    <!-- Wrong slug, or an event the admin switched off: a dead end, not a retry. -->
    <div v-else-if="notFound" class="container-site max-w-lg py-24 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
      <h1 class="mb-2 text-xl font-bold">ไม่พบงานวันเกิดนี้</h1>
      <p class="text-gray-600">{{ loadError }}</p>
    </div>

    <template v-else>
      <header class="container-site pt-6 text-center">
        <h1 class="text-2xl font-extrabold sm:text-4xl">{{ event?.title }}</h1>
        <p v-if="event?.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
          สุขสันต์วันเกิด {{ event.celebrantName }}
        </p>
        <p v-if="wishes.length" class="mt-2 text-sm text-gray-600">
          คำอวยพรทั้งหมด {{ wishes.length }} ใบ · กดที่ลูกโป่งเพื่ออ่าน
        </p>
      </header>

      <p v-if="loadError" class="container-site mt-8 text-center text-sm text-red-600" role="alert">
        {{ loadError }}
      </p>

      <div v-else-if="!wishes.length" class="container-site max-w-lg py-20 text-center">
        <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
        <h2 class="mb-2 text-xl font-bold">ยังไม่มีคำอวยพร</h2>
        <p class="mb-6 text-gray-600">มาเป็นคนแรกที่ปล่อยลูกโป่งอวยพรกันเถอะ</p>
        <RouterLink
          :to="{ name: 'birthday-wish', params: { slug } }"
          class="cta-btn"
          :style="{ background: themeColor }"
        >
          เขียนคำอวยพร
        </RouterLink>
      </div>

      <BalloonSky
        v-else
        :wishes="wishes"
        :slug="slug"
        :event-title="event?.title"
        :celebrant-name="event?.celebrantName"
        @update:reading="reading = $event"
      />

      <div v-if="wishes.length" class="cta">
        <RouterLink
          :to="{ name: 'birthday-wish', params: { slug } }"
          class="cta-btn shadow-lg"
          :style="{ background: themeColor }"
        >
          เขียนคำอวยพร 🎈
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cta {
  position: sticky;
  bottom: 1rem;
  display: flex;
  justify-content: center;
  padding: 1rem;
  /* Above the balloons, which climb to z-index 16. */
  z-index: 30;
}
.cta-btn {
  @apply inline-block rounded-full px-7 py-3 text-center font-semibold text-white transition;
}
.cta-btn:hover {
  opacity: 0.9;
}
</style>
