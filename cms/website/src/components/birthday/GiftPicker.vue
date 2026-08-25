<script setup lang="ts">
/**
 * The present tied under the balloon, chosen from what the admin uploaded.
 *
 * Gifts arrive with an image far more often than not, but the catalogue is admin data and
 * an entry can be saved without one — so every card also carries its name as text. That
 * doubles as the accessible name, since decorative gift artwork has nothing useful to
 * announce on its own.
 */
import type { Gift } from '@/api/birthday';

defineProps<{ gifts: Gift[]; modelValue: Gift['id'] | null }>();
defineEmits<{ 'update:modelValue': [Gift['id']] }>();

const groupName = `gift-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <fieldset>
    <legend class="mb-2 font-semibold text-gray-800">Gift tied to your balloon</legend>

    <p v-if="!gifts.length" class="text-sm text-gray-500">No gifts have been added to this birthday yet.</p>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      <label v-for="gift in gifts" :key="gift.id" class="gift-card">
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="gift.id"
          :checked="modelValue === gift.id"
          @change="$emit('update:modelValue', gift.id)"
        />
        <span class="gift-body">
          <img v-if="gift.imageUrl" :src="gift.imageUrl" alt="" loading="lazy" class="gift-img" />
          <span v-else class="gift-img gift-placeholder" aria-hidden="true">🎁</span>
          <span class="gift-name">{{ gift.name }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.gift-card {
  cursor: pointer;
}
.gift-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  height: 100%;
  padding: 0.75rem 0.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.gift-card:hover .gift-body {
  border-color: #d1d5db;
}
.gift-card input:checked + .gift-body {
  border-color: #111827;
  transform: translateY(-2px);
}
.gift-card input:focus-visible + .gift-body {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}

.gift-img {
  width: 100%;
  max-width: 84px;
  aspect-ratio: 1;
  object-fit: contain;
}
.gift-placeholder {
  display: grid;
  place-items: center;
  font-size: 2.25rem;
}
.gift-name {
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  color: #374151;
}
.gift-card input:checked ~ .gift-body .gift-name {
  color: #111827;
}

@media (prefers-reduced-motion: reduce) {
  .gift-body {
    transition: none;
  }
  .gift-card input:checked + .gift-body {
    transform: none;
  }
}
</style>
