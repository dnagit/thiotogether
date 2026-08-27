<script setup lang="ts">
/**
 * The announcement popup: one banner picture, optionally a link, closed by the visitor.
 *
 * Everything about it is CMS data — the picture, whether it runs at all, where it goes when
 * clicked, which pages it appears on and how soon someone who closed it sees it again — so
 * the whole feature is one component here and one tab in the admin's Settings.
 *
 * It is not built on {@link AppModal}: that panel is padded and always draws a heading,
 * which is right for a prompt and wrong for a picture that has to reach its own edges. The
 * behaviour it does share — Escape, backdrop, focus moved in and restored, Tab kept inside,
 * the page behind held still — is repeated below rather than inherited.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSiteStore } from '@/stores/site';

/** The `popup` group of the site settings, as the admin writes it. */
interface PopupSettings {
  popupEnabled?: boolean;
  popupImage?: string;
  popupTitle?: string;
  popupLink?: string;
  popupLinkNewTab?: boolean;
  popupPages?: 'home' | 'all';
  popupFrequency?: 'session' | 'day' | 'always';
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Long enough that the popup arrives over a drawn page rather than a half-painted one. */
const OPEN_DELAY_MS = 700;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Closed at least once since the tab was opened.
 *
 * Module scope, not component state: this survives the route changes that remount nothing
 * but re-run the check, so closing the popup on one page does not hand it back on the next.
 * Storage does the same job across visits, and would do this one too — except where the
 * browser refuses to store anything, which is exactly where a popup would otherwise return
 * on every click.
 */
let closedThisVisit = false;

const site = useSiteStore();
const route = useRoute();
const router = useRouter();

const cfg = computed<PopupSettings>(() => (site.settings?.popup ?? {}) as PopupSettings);
const image = computed(() => (cfg.value.popupImage ?? '').trim());
const link = computed(() => (cfg.value.popupLink ?? '').trim());
const frequency = computed(() => cfg.value.popupFrequency || 'session');
/** An internal path is handed to the router; anything else is a plain link out. */
const internal = computed(() => link.value.startsWith('/') && !cfg.value.popupLinkNewTab);
const newTab = computed(() => !!cfg.value.popupLinkNewTab && !!link.value);
const label = computed(() => cfg.value.popupTitle?.trim() || 'Announcement');

/**
 * Keyed by the picture, so replacing the banner shows it again to everyone — including the
 * visitors who closed the one before it, who are the people the new one is for.
 */
const storageKey = computed(() => `site-popup:${image.value}`);

const shows = computed(
  () =>
    !!cfg.value.popupEnabled &&
    !!image.value &&
    !broken.value &&
    (cfg.value.popupPages === 'all' || route.path === '/'),
);

const open = ref(false);
const panel = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
/**
 * Set when the banner will not load — a URL the admin saved that this visitor cannot reach,
 * most often an upload addressed by a host only the office machine knows.
 *
 * A popup then has nothing in it: the anchor shrinks to the broken-image box, so most of
 * the panel is not the link and does not even take the pointer. Better to show nothing at
 * all than a dialog the visitor has to close to get at a page that looks broken.
 */
const broken = ref(false);
let lastFocused: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Storage is unavailable in some private windows, and throws rather than returning null. */
function dismissed(): boolean {
  if (frequency.value === 'always') return false;
  if (closedThisVisit) return true;
  try {
    if (frequency.value === 'session') return sessionStorage.getItem(storageKey.value) !== null;
    const at = Number(localStorage.getItem(storageKey.value));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DAY_MS;
  } catch {
    // Nothing remembered anywhere: better one more popup than a broken page.
    return false;
  }
}

function remember(): void {
  closedThisVisit = true;
  try {
    if (frequency.value === 'session') sessionStorage.setItem(storageKey.value, '1');
    else if (frequency.value === 'day') localStorage.setItem(storageKey.value, String(Date.now()));
  } catch {
    // Ignored: `closedThisVisit` still holds it shut for the rest of this visit.
  }
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  remember();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab' || !panel.value) return;

  const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];
  // Wrap focus, so it cannot wander off into the page behind.
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function onImageError(): void {
  broken.value = true;
  open.value = false;
}

/** A click on the banner: follow the link, and treat it as having been seen. */
function follow(e: MouseEvent): void {
  if (!link.value) return;
  remember();
  if (!internal.value) {
    // A new tab or an outside address: let the browser have the click, but close behind it
    // so the visitor is not left with the popup over the page they came back to.
    open.value = false;
    return;
  }
  e.preventDefault();
  open.value = false;
  void router.push(link.value);
}

watch(
  [shows, () => route.path],
  () => {
    clearTimeout(timer);
    if (!shows.value || dismissed()) {
      open.value = false;
      return;
    }
    if (open.value) return;
    timer = setTimeout(() => (open.value = true), OPEN_DELAY_MS);
  },
  { immediate: true },
);

watch(open, async (isOpen) => {
  if (isOpen) {
    lastFocused = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    await nextTick();
    /*
     * The close button, not the first focusable thing in the panel — which is the banner.
     * Focusing the banner draws the browser's focus ring right around the picture, which
     * reads as a border nobody asked for, and leaves Enter pointed at the link rather than
     * at the way out.
     */
    closeBtn.value?.focus();
  } else {
    document.body.style.overflow = '';
    lastFocused?.focus();
  }
});

onBeforeUnmount(() => {
  clearTimeout(timer);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="popup">
      <div
        v-if="open"
        class="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-8"
        @keydown="onKeydown"
      >
        <div class="absolute inset-0 bg-black/60" aria-hidden="true" @click="close" />

        <div ref="panel" role="dialog" aria-modal="true" :aria-label="label" class="panel">
          <!-- A banner with nowhere to go is a picture, not a link, and is not focusable. -->
          <a
            v-if="link"
            :href="link"
            :target="newTab ? '_blank' : undefined"
            :rel="newTab ? 'noopener noreferrer' : undefined"
            :aria-label="label"
            class="sheet"
            @click="follow"
          >
            <img
              :src="image"
              :alt="cfg.popupTitle || ''"
              class="banner"
              @error="onImageError"
            />
          </a>
          <div v-else class="sheet">
            <img
              :src="image"
              :alt="cfg.popupTitle || ''"
              class="banner"
              @error="onImageError"
            />
          </div>

          <button ref="closeBtn" type="button" class="close" aria-label="Close" @click="close">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/*
 * The panel is the picture's own size, capped by the window rather than by a column width:
 * a banner is drawn to be looked at whole, and one scaled into a fixed panel would sit in
 * a box of its own leftover space.
 *
 * 920 is a ceiling for the desktop, not a target — a banner narrower than that is drawn at
 * its own width rather than blown up past it, where the picture would only go soft.
 */
.panel {
  position: relative;
  max-width: min(920px, 100%);
  display: flex;
}
/*
 * No frame of any kind: no rounded corners, no white behind the picture, no shadow. The
 * banner is the whole popup, so whatever edge it draws for itself is the edge — a sheet
 * under it only shows as a border around artwork that already has one.
 */
.sheet {
  display: block;
  background: none;
  line-height: 0;
}
/*
 * A banner that leads somewhere reads as clickable across the whole picture.
 *
 * All of this is stated rather than left to the browser: an anchor wrapped round an image
 * picks up an underline in some stacks, a tap highlight on Android, and a focus ring the
 * moment anything focuses it — three different lines around the artwork, none of them ours.
 * The keyboard ring is the one that stays, and only for the keyboard.
 */
a.sheet {
  cursor: pointer;
  display: block;
  border: 0;
  outline: none;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
a.sheet:hover,
a.sheet:active {
  border: 0;
  outline: none;
  text-decoration: none;
}
a.sheet:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 4px;
}
/*
 * Sized by the picture itself: width follows the artwork up to the panel's ceiling, and the
 * height cap is the window less the gutter around it, so a tall banner shrinks to fit rather
 * than running off the screen. `width: auto` rather than `100%` is what keeps the element
 * the size of the picture — stretched to the panel it would letterbox, and with no sheet
 * behind it that empty space is a dead click zone beside the banner.
 *
 * `dvh` is what makes this right on a phone: `vh` counts the space under the address bar,
 * which is exactly the strip a popup would otherwise hide beneath.
 */
.banner {
  display: block;
  width: auto;
  height: auto;
  /* The picture draws no line of its own — the click target's edge is the artwork's. */
  border: 0;
  outline: none;
  max-width: 100%;
  max-height: calc(100vh - 1.5rem);
  max-height: calc(100dvh - 1.5rem);
}
@media (min-width: 640px) {
  .banner {
    max-height: calc(100vh - 4rem);
    max-height: calc(100dvh - 4rem);
  }
}

/*
 * Outside the picture's corner rather than over it: a close button laid on the artwork
 * covers whatever the banner put there, and every banner puts something in its corner.
 */
.close {
  position: absolute;
  top: -0.6rem;
  right: -0.6rem;
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #374151;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 10px rgb(0 0 0 / 30%);
  transition: transform 0.15s ease;
}
.close:hover {
  transform: scale(1.08);
}
.close:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 2px;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.2s ease;
}
.popup-enter-active .panel {
  transition: transform 0.22s ease;
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
}
.popup-enter-from .panel {
  transform: translateY(12px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .popup-enter-active,
  .popup-leave-active,
  .popup-enter-active .panel,
  .close {
    transition: none;
  }
  .close:hover {
    transform: none;
  }
}
</style>
