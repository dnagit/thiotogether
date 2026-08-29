/**
 * One picture in a slider.
 *
 * Its own file because `<script setup>` cannot export types, and both the slider and the
 * screens that feed it need to name this shape.
 */
export interface SlideImage {
  url?: string;
  caption?: string | null;
}
