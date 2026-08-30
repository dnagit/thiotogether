/**
 * One picture — or one clip — in a slider.
 *
 * Its own file because `<script setup>` cannot export types, and both the slider and the
 * screens that feed it need to name this shape.
 */
import { isVideoUrl } from '@cms/shared';

export interface SlideImage {
  url?: string;
  caption?: string | null;
}

/**
 * Whether a slide is a video.
 *
 * A gallery row carries only a URL — the admin never asks an editor to say which kind of
 * file they just picked — so the kind is read back off the URL. See `isVideoUrl`.
 */
export function isVideoSlide(slide: SlideImage): boolean {
  return isVideoUrl(slide.url);
}
