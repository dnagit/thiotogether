<script setup lang="ts">
defineProps<{
  headline?: string;
  subheadline?: string;
  image?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}>();
</script>

<template>
  <!--
    Copy is sized in vw, like the banner itself: the section's height is its width over the aspect
    ratio, so viewport-proportional type holds the same relationship to the artwork at any width
    instead of jumping at breakpoints. The clamps are only floors and ceilings for readability.
  -->
  <div class="relative h-full flex flex-col items-center justify-center text-center rounded-none
              px-4 py-[clamp(0.5rem,1.5vw,2rem)]">
    <!--
      The cutout shares the backdrop's canvas, so it has to be laid out by the backdrop's own rule
      rather than by any percentage of the banner box. `background-size: cover` on a backdrop narrower
      than the section resolves to "match the section's width, overflow the height, centre the
      overflow" — reproduced here as full-bleed width, automatic height and a centred offset. No
      constant to retune when the aspect ratio changes; the section's overflow-hidden takes the rest.
    -->
    <img
      v-if="image"
      :src="image"
      alt=""
      aria-hidden="true"
      class="pointer-events-none select-none absolute top-1/2 -translate-y-1/2
             right-[calc(50%_-_50vw)] w-screen max-w-none h-auto"
    />
    <!--
      From md up, lifted off centre by a viewport-proportional amount: the banner's height is its
      width over the aspect ratio, so 4vw is a fixed ~8% of the banner at every width above that
      breakpoint. Phones keep the copy centred — the banner is only ~190px tall there and any lift
      pushes it into the artwork.
    -->
    <div class="relative md:-translate-y-[4vw]">
      <h1
        class="font-extrabold text-echo leading-tight text-[clamp(0.8rem,8vw_-_1.8rem,8rem)] mb-[clamp(0.25rem,0.8vw,1rem)]"
        v-html="headline"
      />
      <p
        v-if="subheadline"
        class="opacity-90 max-w-2xl mx-auto text-[clamp(0.75rem,1.15vw,1.25rem)] mb-[clamp(0.4rem,1.4vw,2rem)]"
      >
        {{ subheadline }}
      </p>
      <!-- <RouterLink
        v-if="ctaLabel && ctaUrl && !ctaUrl.startsWith('http')"
        :to="ctaUrl"
        class="btn-primary text-[clamp(0.7rem,1vw,1rem)] px-[clamp(0.75rem,1.8vw,1.5rem)] py-[clamp(0.35rem,0.8vw,0.75rem)]"
      >{{ ctaLabel }}</RouterLink>
      <a
        v-else-if="ctaLabel && ctaUrl"
        :href="ctaUrl"
        class="btn-primary text-[clamp(0.7rem,1vw,1rem)] px-[clamp(0.75rem,1.8vw,1.5rem)] py-[clamp(0.35rem,0.8vw,0.75rem)]"
      >{{ ctaLabel }}</a> -->
    </div>
  </div>
</template>
