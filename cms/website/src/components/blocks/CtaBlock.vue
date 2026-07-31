<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

interface CtaButton {
  label?: string;
  url?: string;
  image?: string;
}

const props = defineProps<{
  title?: string;
  text?: string;
  buttons?: CtaButton[];
  /** Pre-list props: pages saved before this block took multiple buttons still carry these. */
  buttonLabel?: string;
  buttonUrl?: string;
}>();

const buttons = computed<CtaButton[]>(() => {
  const list = (props.buttons ?? []).filter((b) => b?.url && (b.label || b.image));
  if (list.length) return list;
  return props.buttonLabel && props.buttonUrl ? [{ label: props.buttonLabel, url: props.buttonUrl }] : [];
});

/** Router links keep in-app navigation; anything absolute has to leave through a plain anchor. */
function isInternal(url?: string): boolean {
  return !!url && !url.startsWith('http');
}

function linkTag(button: CtaButton): typeof RouterLink | 'a' {
  return isInternal(button.url) ? RouterLink : 'a';
}

function linkProps(button: CtaButton): Record<string, unknown> {
  return isInternal(button.url) ? { to: button.url } : { href: button.url, rel: 'noopener' };
}
</script>

<template>
  <div class="py-16 text-center rounded-2xl my-8 text-black font-sukhumvit">
    <!-- Fluid rather than a fixed step: viewport-proportional, with clamp ends for readability. -->
    <h2 class="font-bold leading-tight text-[clamp(1.25rem,3vw,3.5rem)] mb-[clamp(0.5rem,1vw,1rem)]">{{ title }}</h2>
    <p
      v-if="text"
      class="opacity-90 max-w-xl mx-auto px-4 text-[clamp(0.8rem,1.2vw,1.25rem)] mb-[clamp(0.75rem,1.6vw,1.5rem)]"
    >
      {{ text }}
    </p>

    <!-- One button per row: a column instead of a wrapping row. -->
    <div v-if="buttons.length" class="flex flex-col items-center gap-4">
      <component
        :is="linkTag(button)"
        v-for="(button, i) in buttons"
        :key="i"
        v-bind="linkProps(button)"
        class="inline-block transition hover:opacity-90"
        :class="button.image ? '' : 'bg-white font-semibold px-8 py-3 rounded-lg'"
        :style="button.image ? {} : { color: 'var(--color-primary)' }"
      >
        <!-- An uploaded image stands in for the whole button; the label becomes its alt text. -->
        <img v-if="button.image" :src="button.image" :alt="button.label ?? ''" class="h-auto w-full" />
        <template v-else>{{ button.label }}</template>
      </component>
    </div>
  </div>
</template>
