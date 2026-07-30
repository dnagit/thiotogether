<script setup lang="ts">
/**
 * Accessible modal: labelled dialog role, focus moved in on open and restored on
 * close, Tab cycles inside, Escape closes. Built rather than imported because the
 * public site carries no component library.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  /** Blocks Escape and backdrop dismissal while a request is in flight. */
  busy?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);
let lastFocused: HTMLElement | null = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function close(): void {
  if (props.busy) return;
  emit('close');
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab' || !panel.value) return;

  const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];
  // Wrap focus so it cannot escape to the page behind the modal.
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      lastFocused = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      await nextTick();
      panel.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else {
      document.body.style.overflow = '';
      lastFocused?.focus();
    }
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        @keydown="onKeydown"
      >
        <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="close" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          class="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6"
        >
          <h2 class="text-lg font-bold mb-3">{{ title }}</h2>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active { transition: opacity 0.18s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active { transition: none; }
}
</style>
