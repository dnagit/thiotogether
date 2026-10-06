<script setup lang="ts">
/**
 * A link page: the cover, a title, and one row per service — the address a QR code points at.
 *
 * Laid out after the music "smart links" fans already know: the artwork square on top, a
 * white card under it with a logo, a name and a button on every row, and the same artwork
 * blurred out to fill the screen behind. Nothing of the site's own chrome — see BareLayout.
 *
 * Each row's name and button text are the editor's if they wrote any, else the platform's
 * own from `LINK_PLATFORMS`, so a row can be just a platform and a URL.
 */
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { findLinkPlatform } from '@cms/shared';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import { useSiteStore } from '@/stores/site';
import { FALLBACK_ICON_PATH, PLATFORM_ICONS } from '@/components/links/platformIcons';

interface LinkRow {
  platform: string;
  url: string;
  label?: string | null;
  action?: string | null;
  icon?: string | null;
}

interface LinkPage {
  title: string;
  slug: string;
  subtitle: string | null;
  coverImage: string | null;
  links: LinkRow[] | null;
  backgroundColor: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

const route = useRoute();
const site = useSiteStore();
const slug = String(route.params.slug ?? '');

const page = ref<LinkPage | null>(null);
const loading = ref(true);
const notFound = ref(false);

void (async () => {
  try {
    const p = await get<LinkPage>(`/link-pages/${encodeURIComponent(slug)}`);
    page.value = p;
    applySeo({
      title: p.metaTitle || p.title,
      metaDescription: p.metaDescription || p.subtitle || undefined,
      ogImage: p.coverImage ?? undefined,
    });
  } catch (err: any) {
    notFound.value = err?.response?.status === 404;
  } finally {
    loading.value = false;
  }
})();

const rows = computed(() =>
  (page.value?.links ?? [])
    .filter((l) => l?.url)
    .map((l, i) => {
      const platform = findLinkPlatform(l.platform);
      return {
        key: `${i}-${l.platform}`,
        url: l.url,
        name: l.label || platform?.name || l.url,
        action: l.action || platform?.action || 'Go To',
        image: l.icon || null,
        icon: PLATFORM_ICONS[l.platform] ?? null,
      };
    }),
);

/**
 * A colour the editor picked replaces the blurred cover. The writing under the card sits on
 * it directly, so it turns dark on a light colour — white on yellow cannot be read.
 */
const background = computed(() => page.value?.backgroundColor || null);

function isLight(color: string): boolean {
  const hex = color.match(/^#([0-9a-f]{6}|[0-9a-f]{3})/i)?.[1];
  const rgb = hex
    ? (hex.length === 3 ? [...hex].map((c) => c + c) : hex.match(/../g)!).map((c) => parseInt(c, 16))
    : (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  if (rgb.length < 3) return false;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

const screenStyle = computed(() => (background.value ? { background: background.value } : undefined));
const lightGround = computed(() => !!background.value && isLight(background.value));

/** Same-site paths stay in the tab; anything else opens beside it so the list is kept. */
const isExternal = (url: string): boolean => /^https?:\/\//i.test(url);
</script>

<template>
  <div class="lp-screen" :class="{ 'lp-light': lightGround }" :style="screenStyle">
    <div
      v-if="page?.coverImage && !background"
      class="lp-backdrop"
      :style="{ backgroundImage: `url(${page.coverImage})` }"
      aria-hidden="true"
    ></div>

    <div v-if="loading" class="lp-state">Loading…</div>

    <div v-else-if="!page" class="lp-state">
      <p>{{ notFound ? 'ไม่พบหน้านี้' : 'โหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }}</p>
      <RouterLink to="/" class="lp-home">กลับหน้าแรก</RouterLink>
    </div>

    <main v-else class="lp-card">
      <img v-if="page.coverImage" :src="page.coverImage" :alt="page.title" class="lp-cover" />

      <div class="lp-body">
        <header class="lp-head">
          <h1 class="lp-title">{{ page.title }}</h1>
          <p v-if="page.subtitle" class="lp-subtitle">{{ page.subtitle }}</p>
        </header>

        <ul class="lp-list">
          <li v-for="row in rows" :key="row.key">
            <a
              :href="row.url"
              :target="isExternal(row.url) ? '_blank' : undefined"
              :rel="isExternal(row.url) ? 'noopener' : undefined"
              class="lp-row"
            >
              <span class="lp-logo">
                <img v-if="row.image" :src="row.image" alt="" />
                <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                  <path :d="row.icon?.path ?? FALLBACK_ICON_PATH" :fill="row.icon?.color ?? 'currentColor'" />
                </svg>
              </span>
              <span class="lp-name">{{ row.name }}</span>
              <span class="lp-action">{{ row.action }}</span>
            </a>
          </li>
        </ul>

        <p v-if="!rows.length" class="lp-empty">ยังไม่มีลิงก์</p>
      </div>
    </main>

    <footer v-if="page" class="lp-foot">
      <RouterLink to="/">{{ site.siteName }}</RouterLink>
    </footer>
  </div>
</template>

<style scoped>
/* Class names carry an `lp-` prefix: Tailwind is global here, and `.block`/`.table` would clash. */
.lp-screen {
  position: relative;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px 24px;
  background: #1c1c1e;
  overflow-x: clip;
}

/* The cover again, blown up and blurred to be the room the card sits in. */
.lp-backdrop {
  position: fixed;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(40px) brightness(0.6);
  transform: scale(1.1);
  z-index: 0;
}

.lp-card,
.lp-state,
.lp-foot {
  position: relative;
  z-index: 1;
}

.lp-card {
  width: 100%;
  max-width: 440px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.35);
}

.lp-cover {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.lp-head {
  padding: 20px 20px 16px;
  text-align: center;
  border-bottom: 1px solid #ececec;
}
.lp-title {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  color: #111;
}
.lp-subtitle {
  margin-top: 4px;
  font-size: 0.875rem;
  color: #777;
}

.lp-list > li + li {
  border-top: 1px solid #ececec;
}
.lp-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  color: #111;
  transition: background-color 0.15s;
}
.lp-row:hover,
.lp-row:focus-visible {
  background: #f6f6f6;
}

.lp-logo {
  width: 32px;
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
}
.lp-logo svg,
.lp-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.lp-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lp-action {
  flex: none;
  min-width: 84px;
  padding: 7px 14px;
  border: 1px solid #d4d4d4;
  border-radius: 999px;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #333;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.lp-row:hover .lp-action {
  background: #111;
  border-color: #111;
  color: #fff;
}

.lp-empty {
  padding: 24px;
  text-align: center;
  color: #999;
}

.lp-state {
  margin-top: 30vh;
  text-align: center;
  color: #eee;
}
.lp-home {
  display: inline-block;
  margin-top: 12px;
  text-decoration: underline;
}

.lp-foot {
  margin-top: 20px;
  font-size: 0.75rem;
  color: rgb(255 255 255 / 0.7);
}
.lp-foot a:hover {
  color: #fff;
}

/* The heavy shadow is for a dark room; on a light colour it reads as a smudge. */
.lp-light .lp-card {
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.1);
}
.lp-light .lp-state,
.lp-light .lp-foot,
.lp-light .lp-foot a:hover {
  color: rgb(0 0 0 / 0.7);
}

@media (prefers-reduced-motion: reduce) {
  .lp-row,
  .lp-action {
    transition: none;
  }
}
</style>
