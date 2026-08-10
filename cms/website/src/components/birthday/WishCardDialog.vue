<script setup lang="ts">
/**
 * The card behind a balloon, in a dialog.
 *
 * Nothing but the frame: the drawing is `WishCard`'s and the two things to do with it are
 * `WishCardActions`', which the screen shown after writing a wish puts under its own copy
 * of the same card.
 */
import { computed, ref } from 'vue';
import AppModal from '@/components/AppModal.vue';
import WishCard from './WishCard.vue';
import WishCardActions from './WishCardActions.vue';
import type { Wish } from '@/api/birthday';

withDefaults(
  defineProps<{
    wish: Wish | null;
    /** Absolute link that reopens this exact card; empty hides the copy-link button. */
    shareUrl?: string;
    /** The event's colour, so the buttons belong to the party rather than to the browser. */
    themeColor?: string | null;
  }>(),
  { shareUrl: '', themeColor: null },
);

defineEmits<{ close: [] }>();

const card = ref<InstanceType<typeof WishCard> | null>(null);
const actions = ref<InstanceType<typeof WishCardActions> | null>(null);
/** Holds the dialog open while a card is being rasterised. */
const busy = computed(() => actions.value?.saving === true);
</script>

<template>
  <AppModal
    :open="!!wish"
    size="lg"
    :busy="busy"
    :title="wish ? `การ์ดอวยพรจาก ${wish.name}` : ''"
    @close="$emit('close')"
  >
    <template v-if="wish">
      <WishCard
        ref="card"
        :name="wish.name"
        :message="wish.message"
        :balloon-shape="wish.balloonShape"
        :balloon-color="wish.balloonColor"
        :photo-url="wish.photoUrl"
        :framing="wish.photoFraming"
        :background-url="wish.background?.imageUrl"
        :gift-image="wish.gift?.imageUrl"
      />

      <WishCardActions
        ref="actions"
        class="mt-5"
        :svg="() => card?.svg ?? null"
        :name="wish.name"
        :link="shareUrl"
        :theme-color="themeColor"
      />

      <button type="button" class="close-btn mt-3 w-full" @click="$emit('close')">ปิด</button>
    </template>
  </AppModal>
</template>

<style scoped>
.close-btn {
  @apply rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold
         text-gray-700 transition hover:bg-gray-50;
}
</style>
