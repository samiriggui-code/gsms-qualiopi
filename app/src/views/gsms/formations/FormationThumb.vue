<template>
  <span class="thumb" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <t-icon v-else name="book" :size="`${Math.round(size * 0.45)}px`" />
  </span>
</template>

<script setup lang="ts">
/**
 * Vignette d'une formation : `image` est le chemin enregistré en base (`image_url`, `program_image_url`…), rendu par
 * l'API. Sans chemin (ou image introuvable), une icône neutre : rien n'est deviné d'après le code.
 */
import { computed, ref, watch } from 'vue'
import { mediaSrc } from '@/components/gsms/media'

const props = withDefaults(defineProps<{ image: string | null | undefined; size?: number }>(), { size: 40 })
const failed = ref(false)
watch(() => props.image, () => { failed.value = false })
const src = computed(() => (failed.value ? null : mediaSrc(props.image)))
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
