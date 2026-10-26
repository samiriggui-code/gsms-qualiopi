<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }" aria-hidden="true">
    <img v-if="photo" :src="photo" alt="" />
    <template v-else>{{ initials }}</template>
  </span>
</template>

<script setup lang="ts">
/** Photo si elle existe, sinon initiales (jamais une photo d'exemple pour une personne réelle). */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string | null | undefined; photo?: string | null; size?: number }>(),
  { photo: null, size: 28 })
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
