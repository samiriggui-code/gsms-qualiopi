<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }" aria-hidden="true">
    <img v-if="src" :src="src" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <template v-else>{{ initials }}</template>
  </span>
</template>

<script setup lang="ts">
/**
 * Photo enregistrée en base (`photo` : chemin de la médiathèque rendu par l'API, `photo_url`, `stagiaire_photo_url`…),
 * sinon initiales. Rien n'est deviné : sans chemin, les initiales ; une image introuvable retombe aussi sur les initiales.
 */
import { computed, ref, watch } from 'vue'
import { mediaSrc } from './media'

const props = withDefaults(defineProps<{ name: string | null | undefined; photo?: string | null; size?: number }>(),
  { photo: null, size: 28 })
const failed = ref(false)
watch(() => props.photo, () => { failed.value = false })
const src = computed(() => (failed.value ? null : mediaSrc(props.photo)))
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
  background: var(--td-bg-color-component);
  color: var(--td-text-color-secondary);
  font-weight: 600;
  img { width: 100%; height: 100%; object-fit: cover; }
}
</style>
