<script setup lang="ts">
/**
 * One project: the cover, the write-up, and however many pictures it has.
 *
 * The list is a block that can sit on any page; this is a route, because a project is one
 * thing at one address — which is also what makes it shareable and indexable.
 *
 * The gallery and its lightbox live in {@link GallerySlider}, shared with the journey block.
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import GallerySlider from '@/components/GallerySlider.vue';
import type { SlideImage } from '@/components/gallery';

interface Project {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverImage: string | null;
  images: SlideImage[] | null;
  eventDate: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const route = useRoute();
const slug = String(route.params.slug ?? '');

const project = ref<Project | null>(null);
const loading = ref(true);
const notFound = ref(false);

void (async () => {
  try {
    const p = await get<Project>(`/projects/${encodeURIComponent(slug)}`);
    project.value = p;
    applySeo({
      title: p.metaTitle || p.title,
      metaDescription: p.metaDescription || p.summary || undefined,
      ogImage: p.coverImage ?? undefined,
    });
  } catch (err: any) {
    notFound.value = err?.response?.status === 404;
  } finally {
    loading.value = false;
  }
})();

/**
 * The pictures to show, cover first.
 *
 * The cover is part of the gallery here even though the API keeps them apart: on the list it
 * is the one picture that stands for the project, but on this page it is simply the first
 * one — and repeating it lower down, or leaving it out of the sequence, both read as a slip.
 */
const gallery = computed<SlideImage[]>(() => {
  const p = project.value;
  if (!p) return [];
  const rest = (p.images ?? []).filter((i) => i?.url);
  const coverAlready = rest.some((i) => i.url === p.coverImage);
  return p.coverImage && !coverAlready ? [{ url: p.coverImage }, ...rest] : rest;
});

const dateText = computed(() =>
  project.value?.eventDate
    ? new Date(project.value.eventDate).toLocaleDateString('th-TH', { dateStyle: 'long' })
    : '',
);
</script>

<template>
  <div class="container-site page">
    <p v-if="loading" class="note" aria-live="polite">กำลังโหลด…</p>

    <div v-else-if="!project" class="note center">
      <h1 class="missing">{{ notFound ? 'ไม่พบโปรเจกต์นี้' : 'โหลดข้อมูลไม่สำเร็จ' }}</h1>
      <p>{{ notFound ? 'ลิงก์อาจไม่ถูกต้อง หรือโปรเจกต์นี้ถูกซ่อนไปแล้ว' : 'กรุณาลองใหม่อีกครั้ง' }}</p>
      <RouterLink to="/" class="back">← กลับหน้าแรก</RouterLink>
    </div>

    <article v-else>
      <header class="head">
        <h1>{{ project.title }}</h1>
        <p v-if="dateText" class="date">{{ dateText }}</p>
        <p v-if="project.summary" class="summary">{{ project.summary }}</p>
      </header>

      <!-- One picture at a time here: this page is about the project, not about the row. -->
      <GallerySlider
        v-if="gallery.length"
        class="gallery"
        :images="gallery"
        :per-view="1"
        ratio="4 / 3"
        :label="project.title"
      />

      <!-- Authored in the admin, so it is rendered as written. -->
      <div v-if="project.description" class="prose-cms body" v-html="project.description"></div>
    </article>
  </div>
</template>

<style scoped>
.page {
  padding: clamp(1.5rem, 4vw, 3.5rem) 1rem clamp(3rem, 8vw, 6rem);
  max-width: 52rem;
}
.note {
  text-align: center;
  color: #6b7280;
  padding: 3rem 0;
}
.center h1 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #111827;
}
.back {
  display: inline-block;
  margin-top: 1rem;
  color: var(--color-primary, #2563eb);
}

.head {
  text-align: center;
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}
.head h1 {
  margin: 0;
  font-weight: 800;
  line-height: 1.25;
  font-size: clamp(1.5rem, 4vw, 2.6rem);
  text-wrap: balance;
}
.date {
  margin: 0.5rem 0 0;
  color: #6b7280;
  font-size: 0.95rem;
}
.summary {
  margin: 0.75rem auto 0;
  max-width: 38rem;
  color: #374151;
  line-height: 1.7;
}

.gallery {
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
}

.body {
  line-height: 1.85;
}
</style>
