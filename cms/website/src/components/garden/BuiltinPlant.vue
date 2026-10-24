<script setup lang="ts">
/**
 * The plant drawn by hand, for a garden whose growth stages have not been uploaded: a seed, a
 * sprout, a stem with leaves, a bud. Paths only, in a 100×150 box with the soil at the bottom,
 * so it can sit inside any `<svg>` — the field's and the saved card's alike.
 */
defineProps<{ stage: number }>();
</script>

<template>
  <g>
    <ellipse cx="50" cy="143" rx="30" ry="6" fill="#8b5e34" />
    <ellipse cx="50" cy="141" rx="24" ry="4" fill="#a47148" />
    <template v-if="stage === 0">
      <ellipse cx="50" cy="136" rx="7" ry="4.5" fill="#5b3a1e" />
      <path d="M46 135 Q50 128 54 135" fill="#3f2a14" />
    </template>
    <template v-else>
      <path
        :d="
          stage === 1
            ? 'M50 140 L50 118'
            : stage === 2
              ? 'M50 140 Q48 100 50 70'
              : 'M50 140 Q47 90 50 42'
        "
        stroke="#3f8f3a"
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
      />
      <path d="M50 124 Q38 112 30 118 Q40 128 50 126Z" fill="#5cb85c" />
      <path d="M50 120 Q62 108 70 114 Q60 124 50 122Z" fill="#4cae4c" />
      <template v-if="stage >= 2">
        <path d="M49 98 Q34 86 26 94 Q38 104 49 100Z" fill="#5cb85c" />
        <path d="M51 90 Q66 78 74 86 Q62 96 51 92Z" fill="#4cae4c" />
      </template>
      <template v-if="stage === 3">
        <ellipse cx="50" cy="38" rx="11" ry="13" fill="#6aa84f" />
        <path d="M42 30 Q50 18 58 30" fill="#f6c343" />
        <path d="M44 34 Q50 26 56 34" fill="#7cb342" />
      </template>
    </template>
  </g>
</template>
