<script setup lang="ts">
/**
 * Every wish as a postcard, laid out in a grid.
 *
 * The wall is the party — balloons drifting past, one card at a time behind whichever is
 * tapped. This is the same wishes read the other way: all of them, in order, as the card
 * each sender made. Nothing new is drawn here; it is `WishCard` at column width.
 *
 * Nine at a time, and no polling. Both are for the same reason: a card is a whole SVG with
 * the party artwork, the sender's picture and their photo in it, so a page of them is heavy
 * enough that they have to be asked for rather than poured out — and a list that quietly
 * grew a row at the top while someone was reading would move the card under their eyes.
 */
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import { useBirthdayWall } from '@/composables/useBirthdayWall';
import WishCard from '@/components/birthday/WishCard.vue';

/** How many more cards each press of the button is worth. */
const PAGE = 9;

const route = useRoute();
const slug = String(route.params.slug || 'birthday');

const { event, wishes, loading, loadError, notFound } = useBirthdayWall(slug, { pollMs: 0 });

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');

const shown = ref(PAGE);
const cards = computed(() => wishes.value.slice(0, shown.value));
const remaining = computed(() => Math.max(0, wishes.value.length - shown.value));

watch(event, (e) => {
  if (!e) return;
  applySeo({
    title: e.celebrantName ? `คำอวยพรทั้งหมด — ${e.celebrantName}` : `คำอวยพรทั้งหมด — ${e.title}`,
    metaDescription: e.description ?? 'รวมคำอวยพรวันเกิดจากทุกคน',
    ogImage: e.coverImage ?? undefined,
  });
});
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-gray-500 animate-pulse">กำลังโหลดคำอวยพร…</div>

  <div v-else-if="notFound" class="container-site max-w-lg py-24 text-center">
    <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
    <h1 class="mb-2 text-xl font-bold">ไม่พบงานวันเกิดนี้</h1>
    <p class="text-gray-600">{{ loadError }}</p>
  </div>

  <div v-else class="container-site max-w-6xl py-8 sm:py-12">
    <header class="mb-8 text-center">
      <h1 class="text-2xl font-extrabold sm:text-4xl">คำอวยพรทั้งหมด</h1>
      <p v-if="event?.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
        ถึง {{ event.celebrantName }}
      </p>
      <p v-if="wishes.length" class="mt-2 text-gray-700">ทั้งหมด {{ wishes.length }} ใบ</p>

      <RouterLink :to="{ name: 'birthday-wall', params: { slug } }" class="back-link mt-4">
        <span aria-hidden="true">←</span> กลับไปหน้าลูกโป่งลอย
      </RouterLink>
    </header>

    <p v-if="loadError" class="mb-6 text-center text-sm text-red-600" role="alert">{{ loadError }}</p>

    <div v-if="!wishes.length" class="mx-auto max-w-lg py-16 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
      <h2 class="mb-2 text-xl font-bold">ยังไม่มีคำอวยพร</h2>
      <p class="mb-6 text-gray-600">มาเป็นคนแรกที่ปล่อยลูกโป่งอวยพรกันเถอะ</p>
      <RouterLink
        :to="{ name: 'birthday-wish', params: { slug } }"
        class="btn-3d write-btn"
        :style="{ '--cta': themeColor }"
      >
        เขียนคำอวยพร
      </RouterLink>
    </div>

    <template v-else>
      <!--
        One column on a phone, two on a large phone, three from a tablet up — the third
        column arrives at 768px rather than Tailwind's `lg`, or a laptop window narrower than
        1024 would show a two-up grid with a card's width of margin either side of it.
      -->
      <ul class="grid list-none grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3" role="list">
        <li v-for="wish in cards" :key="wish.id">
          <WishCard
            :name="wish.name"
            :message="wish.message"
            :balloon-shape="wish.balloonShape"
            :balloon-color="wish.balloonColor"
            :photo-url="wish.photoUrl"
            :framing="wish.photoFraming"
            :background-url="wish.background?.imageUrl"
            :gift-image="wish.gift?.imageUrl"
          />
        </li>
      </ul>

      <div v-if="remaining" class="mt-10 text-center">
        <button
          type="button"
          class="btn-3d write-btn"
          :style="{ '--cta': themeColor }"
          @click="shown += PAGE"
        >
          ดูเพิ่มอีก {{ Math.min(PAGE, remaining) }} ใบ
        </button>
        <p class="mt-2 text-sm text-gray-600">เหลืออีก {{ remaining }} ใบ</p>
      </div>

      <div class="mt-12 text-center">
        <RouterLink :to="{ name: 'birthday-wall', params: { slug } }" class="back-link">
          <span aria-hidden="true">←</span> กลับไปหน้าลูกโป่งลอย
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * The same moulded button as everywhere else on these pages — see `.btn-3d` in `main.css`,
 * which paints it. This only gives it a shape.
 */
.write-btn {
  @apply inline-block rounded-full px-7 py-3 text-center font-semibold text-white transition;
}

/* Text, not a button: this is a way back, not the thing to do on the page. */
.back-link {
  @apply inline-block rounded-full px-4 py-2 text-sm font-semibold text-gray-700 transition;
  background: rgb(255 255 255 / 82%);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgb(0 0 0 / 12%);
}
.back-link:hover {
  background: rgb(255 255 255 / 95%);
}
</style>
