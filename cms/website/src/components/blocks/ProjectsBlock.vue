<script setup lang="ts">
/**
 * The projects grid, as a block rather than a page of its own.
 *
 * That is the whole point of it being a block: a projects page is then an ordinary page and
 * can carry a heading, a call to action or anything else above and below the grid, arranged
 * in the page builder rather than in this file.
 *
 * The projects are fetched here rather than passed in — a block has only the props an editor
 * typed, and what belongs on this grid is every published project, which only the API knows.
 */
import { computed, ref } from 'vue';
import { get } from '@/api/client';

interface Project {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  coverImage: string | null;
  eventDate: string | null;
}

const props = withDefaults(
  defineProps<{
    heading?: string;
    /** Columns on a desktop. Phones always get one, tablets two. */
    columns?: number | string;
    /** 0 shows everything. */
    limit?: number | string;
    /** The line under each title. Off for a grid that is only pictures and names. */
    showSummary?: boolean;
    showDate?: boolean;
  }>(),
  { heading: '', columns: 3, limit: 0, showSummary: true, showDate: false },
);

const projects = ref<Project[]>([]);
const loading = ref(true);
const failed = ref(false);

void (async () => {
  try {
    projects.value = await get<Project[]>('/projects');
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
})();

const columns = computed(() => {
  const n = Math.round(Number(props.columns));
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
});

const shown = computed(() => {
  const n = Math.round(Number(props.limit));
  const cap = Number.isFinite(n) && n > 0 ? n : projects.value.length;
  return projects.value.slice(0, cap);
});

const gridStyle = computed(() => ({ '--cols': String(columns.value) }));

const dateText = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '';
</script>

<template>
  <div class="wrap container-site">
    <h2 v-if="heading" class="heading">{{ heading }}</h2>

    <p v-if="loading" class="note" aria-live="polite">กำลังโหลด…</p>
    <p v-else-if="failed" class="note" role="alert">โหลดโปรเจกต์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>
    <p v-else-if="!shown.length" class="note">ยังไม่มีโปรเจกต์</p>

    <ul v-else class="grid" :style="gridStyle" role="list">
      <li v-for="p in shown" :key="p.id">
        <!--
          The whole card is the link, so the picture and the title are one target rather than
          two things a visitor has to aim between.
        -->
        <RouterLink :to="{ name: 'project-detail', params: { slug: p.slug } }" class="card">
          <span class="frame">
            <img v-if="p.coverImage" :src="p.coverImage" :alt="p.title" loading="lazy" />
            <span v-else class="blank" aria-hidden="true"></span>
          </span>
          <span class="title">{{ p.title }}</span>
          <span v-if="showDate && p.eventDate" class="meta">{{ dateText(p.eventDate) }}</span>
          <span v-if="showSummary && p.summary" class="summary">{{ p.summary }}</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wrap {
  padding: clamp(1.5rem, 4vw, 3rem) 1rem;
}
.heading {
  margin: 0 0 clamp(1rem, 3vw, 2rem);
  text-align: center;
  font-weight: 800;
  font-size: clamp(1.4rem, 3.2vw, 2.4rem);
}
.note {
  text-align: center;
  color: #6b7280;
}

/*
 * One column on a phone, two from 640px, and the author's number from 1024px. The middle
 * step is not a compromise — a grid that goes straight from one to four leaves cards a
 * thumbnail wide on the tablet sizes in between.
 */
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: clamp(1rem, 2.5vw, 2rem);
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  }
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  color: inherit;
  text-decoration: none;
}

/*
 * A fixed frame, with the picture cropped into it. Covers arrive at whatever shape they were
 * exported at, and a grid of cards each its own height reads as a mistake rather than as a
 * set — which is what these are.
 *
 * Square: it is the one frame that treats a landscape and a portrait cover alike, cropping
 * each by the same amount rather than flattering one and cutting the head off the other.
 */
.frame {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 1rem;
  overflow: hidden;
  background: #eef2f7;
}
.frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.card:hover .frame img,
.card:focus-visible .frame img {
  transform: scale(1.04);
}
.blank {
  display: block;
  width: 100%;
  height: 100%;
}

.card:focus-visible {
  outline: 3px solid var(--color-primary, #2563eb);
  outline-offset: 4px;
  border-radius: 1rem;
}

.title {
  text-align: center;
  font-weight: 700;
  line-height: 1.35;
  font-size: clamp(0.95rem, 1.5vw, 1.15rem);
  overflow-wrap: anywhere;
}
.meta {
  font-size: 0.85rem;
  color: #6b7280;
}
.summary {
  text-align: center;
  font-size: 0.9rem;
  color: #4b5563;
  line-height: 1.6;
}

@media (prefers-reduced-motion: reduce) {
  .frame img,
  .card:hover .frame img {
    transition: none;
    transform: none;
  }
}
</style>
