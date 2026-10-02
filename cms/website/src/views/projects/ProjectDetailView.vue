<script setup lang="ts">
/**
 * One project: a gallery on top, the write-up, a second gallery under it, and its text.
 *
 * The list is a block that can sit on any page; this is a route, because a project is one
 * thing at one address — which is also what makes it shareable and indexable.
 *
 * The gallery and its lightbox live in {@link GallerySlider}, shared with the journey block.
 * Both texts keep the line breaks the editor typed — see {@link textToHtml}.
 */
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import GallerySlider from '@/components/GallerySlider.vue';
import type { SlideImage } from '@/components/gallery';
import { textToHtml } from '@/utils/richText';

interface Project {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverImage: string | null;
  images: SlideImage[] | null;
  bottomImages: SlideImage[] | null;
  galleryText: string | null;
  eventDate: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaColor: string | null;
  ctaTextColor: string | null;
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
 * The top gallery: one picture at a time. With no gallery the cover stands in, since an empty
 * page is worse than a single frame.
 */
const gallery = computed<SlideImage[]>(() => {
  const p = project.value;
  if (!p) return [];
  const own = (p.images ?? []).filter((i) => i?.url);
  if (own.length) return own;
  return p.coverImage ? [{ url: p.coverImage }] : [];
});

/** The gallery under the write-up: two at a time on a tablet or wider, one on a phone. */
const bottomGallery = computed<SlideImage[]>(() =>
  (project.value?.bottomImages ?? []).filter((i) => i?.url),
);

const descriptionHtml = computed(() => textToHtml(project.value?.description));
const galleryTextHtml = computed(() => textToHtml(project.value?.galleryText));

/**
 * The button under the write-up — the way on to the activity this project is about.
 *
 * Both halves are the editor's, and both are needed: a label with nowhere to go is not a
 * button, and a link with nothing written on it has nothing for anyone to click.
 */
const cta = computed(() => {
  const p = project.value;
  return p?.ctaLabel && p?.ctaUrl ? { label: p.ctaLabel, url: p.ctaUrl } : null;
});

/** Only what the editor overrode; the stylesheet keeps the site's colours for the rest. */
const ctaStyle = computed(() => ({
  background: project.value?.ctaColor || undefined,
  color: project.value?.ctaTextColor || undefined,
}));

/** Router links keep in-app navigation; anything absolute has to leave through a plain anchor. */
const ctaInternal = computed(() => !cta.value?.url.startsWith('http'));
const ctaTag = computed<typeof RouterLink | 'a'>(() => (ctaInternal.value ? RouterLink : 'a'));
const ctaProps = computed<Record<string, unknown>>(() =>
  ctaInternal.value
    ? { to: cta.value?.url }
    : { href: cta.value?.url, target: '_blank', rel: 'noopener noreferrer' },
);

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
       <!--<p v-if="project.summary" class="summary">{{ project.summary }}</p>--> 
      </header>

      <GallerySlider
        v-if="gallery.length"
        class="gallery-top"
        :images="gallery"
        :per-view="1"
        ratio="4 / 3"
        :label="project.title"
      />

      <!-- Written in the admin's editor, so it is rendered as written: sizes, alignment, line breaks. -->
      <div v-if="descriptionHtml" class="prose-cms body" v-html="descriptionHtml"></div>

      <GallerySlider
        v-if="bottomGallery.length"
        class="gallery-bottom"
        :images="bottomGallery"
        :per-view="2"
        ratio="4 / 3"
        :label="project.title"
      />

      <div v-if="galleryTextHtml" class="prose-cms body gallery-text" v-html="galleryTextHtml"></div>

      <p v-if="cta" class="cta-row">
        <component :is="ctaTag" v-bind="ctaProps" class="cta" :style="ctaStyle">{{ cta.label }}</component>
      </p>
    </article>
  </div>
</template>

<style scoped>
/* Width is `container-site`'s, the same as every other page; only the spacing is set here. */
.page {
  padding-top: clamp(1.5rem, 4vw, 3.5rem);
  padding-bottom: clamp(3rem, 8vw, 6rem);
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

.gallery-top {
  max-width: 36rem;
  margin: 0 auto clamp(1.5rem, 4vw, 2.5rem);
}
.gallery-bottom {
  margin-top: clamp(1.5rem, 4vw, 2.5rem);
}

.body {
  line-height: 1.85;
}
/*
 * Spaced the way the admin's editor shows it: Enter is a new line, not a new paragraph with a
 * gap, and an empty line is a blank line. Without a height an empty paragraph would vanish.
 */
.body :deep(p) {
  margin: 0;
}
.body :deep(p:empty) {
  min-height: 1.85em;
}
.body :deep(ul),
.body :deep(ol) {
  margin: 0;
}
.gallery-text {
  margin-top: 1rem;
}

.cta-row {
  margin: clamp(1.75rem, 4vw, 2.75rem) 0 0;
  text-align: center;
}
.cta {
  display: inline-block;
  padding: 0.8rem 2.25rem;
  border-radius: 999px;
  background: var(--color-primary, #2563eb);
  color: #fff;
  font-weight: 700;
  text-decoration: none;
  transition: opacity 0.2s ease;
}
.cta:hover,
.cta:focus-visible {
  opacity: 0.9;
}
@media (prefers-reduced-motion: reduce) {
  .cta {
    transition: none;
  }
}
</style>
