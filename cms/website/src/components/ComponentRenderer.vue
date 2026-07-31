<script setup lang="ts">
/**
 * Component Renderer: Route → fetch JSON → this component → block components.
 * Applies per-block styles (background, padding, colors) and settings
 * (anchor, visibility, container width) uniformly for every block type.
 */
import { computed } from 'vue';
import { resolveBlock } from '@/blocks/registry';
import type { PageBlock } from '@cms/shared';

const props = defineProps<{ blocks: PageBlock[] }>();

const visibleBlocks = computed(() =>
  [...props.blocks]
    .filter((b) => !(b.settings as any)?.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder),
);

function styleFor(block: PageBlock): Record<string, string> {
  const s = (block.styles ?? {}) as Record<string, string>;
  const style: Record<string, string> = {};
  if (s.background) {
    style.background = s.background;
    // Image backgrounds fill the section instead of tiling at their native size — unless the
    // shorthand already carries its own `position / size`, as multi-layer backgrounds do.
    const outsideUrls = s.background.replace(/url\([^)]*\)/g, '');
    if (!outsideUrls.includes('/')) {
      style.backgroundSize = 'cover';
      // Pinned explicitly: the overlays are placed against this crop, so it can't be left to the
      // top-left default that the shorthand would otherwise reset it to.
      style.backgroundPosition = 'center';
    }
  }
  if (s.textColor) style.color = s.textColor;
  const ratio = aspectRatioFor(block);
  if (ratio) {
    // Height follows width, with no `min-height` escape hatch: every layer in a banner is placed as
    // a percentage of this box, so letting content stretch it would move all of them at once.
    style.aspectRatio = ratio;
    // Vertical padding is deliberately dropped here. A border-box can never be shorter than its own
    // padding, so on narrow screens padding taller than the ratio's height (6rem+6rem vs 390/2.1)
    // pins the height, and the ratio then transfers that back into width — the section ends up wider
    // than the viewport and every layer inside it shifts. The ratio owns the height instead.
  } else {
    if (s.paddingTop) style.paddingTop = s.paddingTop;
    if (s.paddingBottom) style.paddingBottom = s.paddingBottom;
  }
  return style;
}

/**
 * Width-driven section height. Decorated banner sections default to the artwork's ratio so the
 * composition holds on every screen instead of flattening as the viewport widens.
 */
const BANNER_RATIO = '2.1';

function aspectRatioFor(block: PageBlock): string {
  const s = (block.styles ?? {}) as Record<string, string>;
  const explicit = (s.aspectRatio ?? '').trim();
  if (explicit) return explicit;
  return s.overlayImage ? BANNER_RATIO : '';
}

/** Decorative artwork pinned to the section's bottom-left, in front of the background. */
function overlayFor(block: PageBlock): string {
  return ((block.styles ?? {}) as Record<string, string>).overlayImage ?? '';
}

/** Second decoration layer, stretched across the whole section in front of the first. */
function fullOverlayFor(block: PageBlock): string {
  return ((block.styles ?? {}) as Record<string, string>).overlayImageFull ?? '';
}

/** A bare number is treated as px; anything else passes through as authored CSS. */
function cssLength(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  return /^-?\d*\.?\d+$/.test(v) ? `${v}px` : v;
}

/** Placement of the artwork: distance from the bottom edge, plus an optional width override. */
function overlayStyleFor(block: PageBlock): Record<string, string> {
  const s = (block.styles ?? {}) as Record<string, string>;
  const style: Record<string, string> = {};
  const bottom = cssLength(s.overlayBottom);
  const width = cssLength(s.overlayWidth);
  if (bottom) style.bottom = bottom;
  // The default sizing is height-driven; an explicit width has to hand the height back to
  // the aspect ratio, otherwise the artwork stretches.
  if (width) {
    style.width = width;
    style.height = 'auto';
  }
  return style;
}
</script>

<template>
  <template v-for="block in visibleBlocks" :key="block.id">
    <section
      v-if="resolveBlock(block.type)"
      :id="(block.settings as any)?.anchorId || undefined"
      :style="styleFor(block)"
      :class="[
        'relative',
        // Keeps the artwork from spilling onto the section below.
        overlayFor(block) || fullOverlayFor(block) ? 'overflow-hidden' : '',
        (block.styles as any)?.customClass,
        { 'hidden md:block': (block.settings as any)?.hiddenOnMobile },
      ]"
    >
      <img
        v-if="overlayFor(block)"
        :src="overlayFor(block)"
        alt=""
        aria-hidden="true"
        :style="overlayStyleFor(block)"
        class="pointer-events-none select-none absolute left-0 bottom-[10%] w-auto max-w-full
               object-contain object-left-bottom h-[48%]"
      />
      <img
        v-if="fullOverlayFor(block)"
        :src="fullOverlayFor(block)"
        alt=""
        aria-hidden="true"
        class="pointer-events-none select-none absolute inset-0 w-full h-full object-cover"
      />
      <div class="relative h-full" :class="(block.settings as any)?.fullWidth ? '' : 'container-site'">
        <component :is="resolveBlock(block.type)" v-bind="block.props" />
      </div>
    </section>
    <!-- Unknown block types render nothing in production but warn in dev. -->
    <div v-else-if="false" />
  </template>
</template>
