<script setup lang="ts">
/**
 * "Get to know…" — a portrait beside a list of facts about someone.
 *
 * The facts are term-and-definition pairs, so they are marked up as a `<dl>` rather than as
 * lines of text with colons in them: the label and the value are then two things a screen
 * reader can tell apart, and the colon between them becomes punctuation the stylesheet draws
 * rather than characters somebody has to remember to type.
 */
import { computed } from 'vue';

interface Fact {
  label?: string;
  value?: string;
}

const props = withDefaults(
  defineProps<{
    heading?: string;
    image?: string;
    /** Which side the portrait sits on above the stacking breakpoint. */
    imageSide?: 'left' | 'right';
    rows?: Fact[];
    headingColor?: string;
    labelColor?: string;
    textColor?: string;
    background?: string;
  }>(),
  {
    heading: '',
    image: '',
    imageSide: 'left',
    rows: () => [],
    headingColor: '',
    labelColor: '',
    textColor: '',
    background: '',
  },
);

/**
 * A trailing colon on the label is dropped: the separator is drawn by the stylesheet, and a
 * label typed as "MBTI :" would otherwise come out with two of them.
 */
const facts = computed(() =>
  props.rows
    .filter((r) => r?.label || r?.value)
    .map((r) => ({
      label: (r.label ?? '').replace(/\s*[:：]\s*$/, ''),
      value: r.value ?? '',
    })),
);

const shell = computed(() => ({
  '--heading': props.headingColor || 'inherit',
  '--label': props.labelColor || 'inherit',
  '--ink': props.textColor || 'inherit',
  ...(props.background ? { background: props.background } : {}),
}));
</script>

<template>
  <section class="wrap" :style="shell">
    <div class="container-site inner">
      <h2 v-if="heading" class="heading">{{ heading }}</h2>

      <div class="layout" :class="{ 'image-right': imageSide === 'right' }">
        <div v-if="image" class="portrait">
          <img :src="image" :alt="heading || ''" loading="lazy" />
        </div>

        <dl v-if="facts.length" class="facts">
          <template v-for="(f, i) in facts" :key="i">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.wrap {
  padding: clamp(1.5rem, 4vw, 3.5rem) 0;
  color: var(--ink);
}
.inner {
  padding-inline: 1rem;
}

.heading {
  margin: 0 0 clamp(1.25rem, 3vw, 2.5rem);
  text-align: center;
  font-weight: 800;
  line-height: 1.25;
  font-size: clamp(1.35rem, 3vw, 2.25rem);
  color: var(--heading);
  text-wrap: balance;
}

/*
 * Stacked on a phone, side by side from `md`. The portrait is given a share of the row
 * rather than a fixed width, so the two columns keep their relationship as the page grows.
 */
.layout {
  display: grid;
  gap: clamp(1.25rem, 3vw, 2.5rem);
  align-items: start;
}
@media (min-width: 768px) {
  .layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 11fr);
  }
  /* The portrait moves by changing the order, so the markup stays in reading order. */
  .layout.image-right .portrait {
    order: 2;
  }
  .layout.image-right {
    grid-template-columns: minmax(0, 11fr) minmax(0, 5fr);
  }
}

.portrait img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 1rem;
}

/*
 * `max-content` for the labels: the column is exactly as wide as the longest one, so every
 * value starts on the same line without anybody measuring anything. The colon is drawn on
 * the label rather than typed into it — see the note in the script.
 */
.facts {
  margin: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 0.5rem;
  row-gap: clamp(0.35rem, 1vw, 0.6rem);
  font-size: clamp(0.9rem, 1.15vw, 1.05rem);
  line-height: 1.7;
}
.facts dt {
  font-weight: 600;
  color: var(--label);
}
.facts dt::after {
  content: ' :';
}
.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/*
 * Below the breakpoint the label goes above its value. A long label and a long value sharing
 * a phone's width leave the value a couple of words per line, which is unreadable — and Thai,
 * having no spaces to break at, wraps worse than most.
 */
@media (max-width: 520px) {
  .facts {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 0.15rem;
  }
  .facts dd {
    margin-bottom: 0.5rem;
  }
}
</style>
