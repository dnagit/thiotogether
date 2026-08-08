<script setup lang="ts">
/**
 * Artwork for the back of the card, chosen from what the admin uploaded.
 *
 * "None" is a real option and comes first, because the plain card is the default and an
 * event may have no artwork at all — in which case there is nothing to choose and the
 * whole picker stands down rather than offering a single meaningless choice.
 *
 * The thumbnails are the artwork itself, so they carry no alt text; the name beside each
 * one is what a screen reader announces.
 */
import type { CardBackground } from '@/api/birthday';

defineProps<{
  backgrounds: CardBackground[];
  modelValue: CardBackground['id'] | null;
}>();
defineEmits<{ 'update:modelValue': [CardBackground['id'] | null] }>();

const groupName = `bg-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <fieldset v-if="backgrounds.length">
    <legend class="mb-2 font-semibold text-gray-800">พื้นหลังการ์ด</legend>
    <p class="mb-2 text-xs text-gray-500">
      การ์ดใบนี้คือรูปที่บันทึกเก็บไว้ได้ตอนกดที่ลูกโป่ง
    </p>

    <div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
      <label class="bg-card" :title="'ไม่ใช้พื้นหลัง'">
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :checked="modelValue === null"
          @change="$emit('update:modelValue', null)"
        />
        <span class="bg-body">
          <span class="bg-img bg-plain" aria-hidden="true">✦</span>
          <span class="bg-name">พื้นเรียบ</span>
        </span>
      </label>

      <label v-for="background in backgrounds" :key="background.id" class="bg-card" :title="background.name">
        <input
          type="radio"
          class="sr-only"
          :name="groupName"
          :value="background.id"
          :checked="modelValue === background.id"
          @change="$emit('update:modelValue', background.id)"
        />
        <span class="bg-body">
          <img :src="background.imageUrl" alt="" loading="lazy" class="bg-img" />
          <span class="bg-name">{{ background.name }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.bg-card {
  cursor: pointer;
}
.bg-body {
  display: block;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.bg-card:hover .bg-body {
  border-color: #d1d5db;
}
/* The chosen one is ringed rather than tinted: a tint would read as part of the artwork. */
.bg-card input:checked + .bg-body {
  border-color: #111827;
  box-shadow: 0 0 0 3px rgb(17 24 39 / 12%);
}
.bg-card input:focus-visible + .bg-body {
  outline: 3px solid #1d4ed8;
  outline-offset: 2px;
}

.bg-img {
  display: block;
  width: 100%;
  /* The card's own proportions, so a thumbnail shows the crop the card will make. */
  aspect-ratio: 4 / 5;
  object-fit: cover;
}
.bg-plain {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(#fff, #f3f4f6);
  color: #9ca3af;
  font-size: 20px;
}

.bg-name {
  display: block;
  padding: 0.35rem 0.4rem;
  border-top: 1px solid #f3f4f6;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  color: #374151;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  .bg-body {
    transition: none;
  }
}
</style>
