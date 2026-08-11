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
/** Set by the sky once there are more balloons than fit on screen at once. */
const crowded = ref(false);
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
  <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">กำลังโหลดคำอวยพร…</div>

  <!-- Wrong slug, or an event the admin switched off: a dead end, not a retry. -->
  <div v-else-if="notFound" class="container-site max-w-lg py-24 text-center">
    <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
    <h1 class="mb-2 text-xl font-bold">ไม่พบงานวันเกิดนี้</h1>
    <p class="text-gray-600">{{ loadError }}</p>
  </div>

  <!--
    A column the height of whatever the layout hands over: heading and call to action take
    what they need, the sky takes the rest. The sky used to measure itself against the
    viewport, which only worked while it was the only thing on the screen.
  -->
  <div v-else class="wall">
    <!-- <header class="container-site pt-4 text-center">
      <h1 class="text-2xl font-extrabold sm:text-4xl">{{ event?.title }}</h1>
      <p v-if="event?.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
        สุขสันต์วันเกิด {{ event.celebrantName }}
      </p>
      <p v-if="wishes.length" class="mt-2 text-sm text-gray-600">
        คำอวยพรทั้งหมด {{ wishes.length }} ใบ · กดที่ลูกโป่งเพื่ออ่าน
      </p>
    
      <p v-if="crowded" class="mt-1 text-xs text-gray-500">
        ลูกโป่งจะทยอยลอยขึ้นเรื่อย ๆ รอสักครู่เพื่อดูใบอื่น ๆ
      </p>
    </header> -->

    <p v-if="loadError" class="container-site mt-8 text-center text-sm text-red-600" role="alert">
      {{ loadError }}
    </p>

    <div v-else-if="!wishes.length" class="container-site max-w-lg py-20 text-center">
      <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
      <h2 class="mb-2 text-xl font-bold">ยังไม่มีคำอวยพร</h2>
      <p class="mb-6 text-gray-600">มาเป็นคนแรกที่ปล่อยลูกโป่งอวยพรกันเถอะ</p>
      <RouterLink
        :to="{ name: 'birthday-wish', params: { slug } }"
        class="btn-3d cta-btn"
        :style="{ '--cta': themeColor }"
      >
        เขียนคำอวยพร
      </RouterLink>
    </div>

    <BalloonSky
      v-else
      class="sky-fill"
      height="auto"
      :wishes="wishes"
      :slug="slug"
      :theme-color="themeColor"
      @update:reading="reading = $event"
      @update:crowded="crowded = $event"
    />

    <div v-if="wishes.length" class="cta">
      <RouterLink
        :to="{ name: 'birthday-wish', params: { slug } }"
        class="btn-3d cta-btn"
        :style="{ '--cta': themeColor }"
      >
        เขียนคำอวยพร 🎈
      </RouterLink>

      <!-- Underneath, as a pair: how many there are, and the way to read them as cards. -->
      <div class="cta-row">
        <p class="cta-count">ลูกโป่งอวยพรทั้งหมด  {{ wishes.length }} ใบ</p>
        <RouterLink
          :to="{ name: 'birthday-cards', params: { slug } }"
          class="cta-link"
          :style="{ '--cta': themeColor }"
        >
          ดูคำอวยพรทั้งหมด <span aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wall {
  height: 100%;
  display: flex;
  flex-direction: column;
}
/*
 * The give in the column: nothing sits below the sky, so it runs right down to where the
 * flowers begin.
 *
 * Stretched by flex rather than asked for `height: 100%` — a percentage needs a containing
 * block whose height is already settled, which a flex item sized by its own flexing is not,
 * and the sky quietly fell back to its 420px minimum. The class lands on `BalloonSky`'s
 * root, which wraps the sky rather than being it, so both need saying.
 *
 * The 420px minimum is lifted too: this column lives in a shell pinned to one screen, so a
 * short window has to be shared out rather than overflowed.
 */
.sky-fill {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sky-fill :deep(.sky) {
  flex: 1 1 auto;
  min-height: 0;
}

/*
 * Standing in the flowers rather than in the page.
 *
 * `fixed`, not the last row of the column: the middle band is a scroll container, so
 * anything left in the flow there is clipped at its edge and could never reach the footer.
 * Fixed takes it out of the flow entirely — which is also what lets the sky end flush
 * against the artwork instead of stopping short to make room for a button.
 *
 * `--foot-h` is the layout's, and is how far up the artwork reaches.
 */
.cta {
  position: fixed;
  inset-inline: 0;
  /*
   * Low in the flowers rather than among them. `env()` keeps it off the iPhone's home
   * indicator, which is otherwise exactly where a button this near the edge would land.
   */
  bottom: calc(max(0.85rem, var(--foot-h) * 0.12) + env(safe-area-inset-bottom, 0px));
  /* Two rows: the button, and the tally beside the card list under it. */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.4rem, 1.2vw, 0.9rem);
  padding-inline: 0.75rem;
  /* Above the balloons, which climb to z-index 16. */
  z-index: 30;
  pointer-events: none;
}
/* The pair under the button; on a phone too narrow for both, they take a line each. */
.cta-row {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: clamp(0.35rem, 1vw, 0.7rem);
}
.cta > *,
.cta-row > * {
  pointer-events: auto;
}
/*
 * Shape and size only — the moulding comes from `.btn-3d` in `main.css`, which the form
 * shares.
 *
 * Sized off the viewport like everything else down here, so it keeps its place among the
 * flowers instead of turning into a postage stamp on a projector or a slab on a phone.
 */
.cta-btn {
  @apply inline-block rounded-full text-center font-semibold text-white transition;
  padding: clamp(0.55rem, 1.1vw, 1.1rem) clamp(1.35rem, 2.8vw, 2.75rem);
  font-size: clamp(0.9rem, 1.35vw, 1.35rem);
}

/*
 * The tally, sized off the viewport like the button so the pair keeps its proportions, and
 * one step down from it in weight — the button is what the visitor is here to press.
 *
 * Its own backing: this sits over the flower artwork, which is busy enough to swallow plain
 * text. `pointer-events` stays off, so a balloon drifting behind it can still be tapped.
 */
.cta-count {
  @apply rounded-full font-semibold text-gray-700;
  /* Cut to the card link's size, now that the two stand side by side. */
  padding: 0.3rem 0.85rem;
  font-size: clamp(0.7rem, 0.85vw, 0.9rem);
  white-space: nowrap;
  background: rgb(255 255 255 / 82%);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 10px rgb(0 0 0 / 12%);
  pointer-events: none;
}

/*
 * A button, but the quietest thing down here: writing a wish is what this screen is for,
 * reading the rest is the second thing.
 *
 * It is a pill like the tally beside the main button, and deliberately a smaller and fainter
 * one than either — less padding, less white behind it, barely a shadow. That ranking is the
 * whole design of this corner: the moulded colour first, the tally next, this last.
 */
.cta-link {
  @apply rounded-full font-semibold transition;
  /* Smaller than the tally above it, being the quietest thing in the corner. */
  padding: 0.3rem 0.85rem;
  font-size: clamp(0.7rem, 0.85vw, 0.9rem);
  white-space: nowrap;
  backdrop-filter: blur(6px);
  box-shadow: 0 1px 5px rgb(0 0 0 / 10%);
  /*
   * Tinted from the party's own colour rather than white, so it is not mistaken for a second
   * tally: the pill beside the button is plain white with grey type, this one is a wash of
   * `--cta` with the same colour taken down for the type. Still far short of the button
   * itself, which wears the colour at full strength and moulded.
   *
   * The flat pair first, as the fallback that survives where `color-mix` is not understood.
   */
  color: #374151;
  background: rgb(255 255 255 / 72%);
  color: color-mix(in srgb, var(--cta) 72%, black);
  background: color-mix(in srgb, var(--cta) 18%, rgb(255 255 255 / 88%));
}
.cta-link:hover {
  background: color-mix(in srgb, var(--cta) 28%, rgb(255 255 255 / 95%));
}
</style>
