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
  if (s.background) style.background = s.background;
  if (s.textColor) style.color = s.textColor;
  if (s.paddingTop) style.paddingTop = s.paddingTop;
  if (s.paddingBottom) style.paddingBottom = s.paddingBottom;
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
        (block.styles as any)?.customClass,
        { 'hidden md:block': (block.settings as any)?.hiddenOnMobile },
      ]"
    >
      <div :class="(block.settings as any)?.fullWidth ? '' : 'container-site'">
        <component :is="resolveBlock(block.type)" v-bind="block.props" />
      </div>
    </section>
    <!-- Unknown block types render nothing in production but warn in dev. -->
    <div v-else-if="false" />
  </template>
</template>
