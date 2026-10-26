<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" loading="lazy" decoding="async" />
    <template v-else>{{ initials }}</template>
  </span>
</template>

<script setup lang="ts">
/**
 * Photo si elle existe, sinon initiales. `email` ne sert qu'à retrouver la photo d'une personne FICTIVE de la démo
 * (table explicite de `media.ts`) : une personne réelle n'a jamais de photo d'exemple.
 */
import { computed } from 'vue'
import { demoAvatar } from './media'

const props = withDefaults(defineProps<{ name: string | null | undefined; photo?: string | null; email?: string | null; size?: number }>(),
  { photo: null, email: null, size: 28 })
const src = computed(() => props.photo || demoAvatar(props.email))
const initials = computed(() => (props.name ?? '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?')
</script>

<style scoped lang="less">
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-weight: 600;
  img { width: 100%; height: 100%; object-fit: cover; }
}
</style>
