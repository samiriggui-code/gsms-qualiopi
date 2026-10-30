<template>
  <span class="gsms-illus" :style="{ '--illus-h': `${height}px` }" aria-hidden="true">
    <img class="gsms-illus__light" :src="urls.light" alt="" decoding="async" />
    <img class="gsms-illus__dark" :src="urls.dark" alt="" decoding="async" />
  </span>
</template>

<script setup lang="ts">
/**
 * Illustration de la médiathèque (`illustrations/N.svg`), avec sa variante `N-dark.svg` en thème sombre.
 * Décorative : le texte voisin porte l'information. Apparition douce, sans animation si l'utilisateur la refuse.
 */
import { computed } from 'vue'
import { illustration } from './media'

const props = withDefaults(defineProps<{ n: number; height?: number }>(), { height: 140 })
const urls = computed(() => illustration(props.n))
</script>

<style scoped lang="less">
.gsms-illus {
  display: inline-flex;
  justify-content: center;
  max-width: 100%;
  animation: gsms-illus-in 0.45s ease-out both;
  img { max-height: var(--illus-h); max-width: 100%; height: auto; }
}
.gsms-illus__dark { display: none; }
:global(:root[theme-mode='dark']) .gsms-illus__light { display: none; }
:global(:root[theme-mode='dark']) .gsms-illus__dark { display: block; }
@keyframes gsms-illus-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .gsms-illus { animation: none; }
}
</style>
