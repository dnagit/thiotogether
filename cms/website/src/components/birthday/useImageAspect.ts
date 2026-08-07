/**
 * The natural aspect ratio of a picture, once the browser has it.
 *
 * Every balloon that shows a photo needs this: the picture is placed inside the 100×100
 * balloon box by {@link photoRect}, and where its edges fall depends entirely on its shape.
 * An SVG `<image>` reports no intrinsic size, so it is measured through a detached `Image`.
 *
 * Results are shared, because the same photo is commonly on screen more than once — the
 * form draws it in the framer and in the whole-wish preview at the same time, and a wall
 * re-mounts the same balloons as the list polls. The browser serves the probe from cache
 * either way; the map is here so the second component does not even wait for that.
 */
import { ref, watch, type Ref } from 'vue';

const cache = new Map<string, number>();
/** Object URLs are one per upload, so the map would otherwise grow all session. */
const CACHE_MAX = 200;

export function useImageAspect(url: () => string | null | undefined): Ref<number | null> {
  const aspect = ref<number | null>(null);

  watch(
    url,
    (value) => {
      aspect.value = value ? (cache.get(value) ?? null) : null;
      if (!value || aspect.value !== null) return;

      const probe = new Image();
      probe.onload = () => {
        const ratio = probe.naturalWidth / probe.naturalHeight;
        if (!Number.isFinite(ratio) || ratio <= 0) return;
        if (cache.size >= CACHE_MAX) cache.clear();
        cache.set(value, ratio);
        // A slow probe must not overwrite a photo the visitor has since replaced.
        if (url() === value) aspect.value = ratio;
      };
      probe.src = value;
    },
    { immediate: true },
  );

  return aspect;
}
