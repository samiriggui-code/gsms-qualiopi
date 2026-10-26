<template>
  <span class="thumb" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" loading="lazy" />
    <t-icon v-else name="book" :size="`${Math.round(size * 0.45)}px`" />
  </span>
</template>

<script setup lang="ts">
/** Vignette d'une formation (image associée à son code), sinon une icône neutre. */
import { computed } from 'vue'
import { formationThumbnail } from './thumbnail'

const props = withDefaults(defineProps<{ code: string | null | undefined; size?: number }>(), { size: 40 })
const src = computed(() => formationThumbnail(props.code))
</script>

<style scoped lang="less">
.thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--app-radius-sm);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  img { width: 100%; height: 100%; object-fit: cover; }
}
</style>
