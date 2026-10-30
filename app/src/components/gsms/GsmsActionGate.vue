<template>
  <div v-if="decision" class="gate">
    <t-tooltip :content="refused ? decision.message : undefined" :disabled="!refused || !decision.message" placement="top">
      <t-button :theme="refused ? 'default' : theme" :variant="refused ? 'outline' : variant" :size="size"
        :loading="pending" :class="{ 'gate--refused': refused }" :aria-disabled="refused ? 'true' : undefined"
        :aria-describedby="refused && showReason ? reasonId : undefined" @click="click">
        <slot>{{ decision.libelle }}</slot>
      </t-button>
    </t-tooltip>
    <div v-if="refused && showReason && (decision.message || reasons.length)" :id="reasonId" class="gate__reason">
      <span>{{ decision.message }}</span>
      <ul v-if="reasons.length"><li v-for="(d, i) in reasons" :key="i">{{ d }}</li></ul>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Bouton gouverné par une décision de l'API (`allowed`, `message`, `details`) : il n'invente aucune règle.
 * Refusé, il reste visible et atteignable au clavier ; la raison est donnée au survol, au clic (téléphone :
 * pas de survol) et, si `showReason`, en clair sous le bouton.
 */
import { computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { Capability } from '@/api/gsms/common'
import { detailLines } from './format'

const props = withDefaults(defineProps<{
  decision: Capability | undefined
  pending?: boolean
  showReason?: boolean
  theme?: 'primary' | 'default' | 'danger' | 'warning' | 'success'
  variant?: 'base' | 'outline' | 'text' | 'dashed'
  size?: 'small' | 'medium' | 'large'
}>(), { pending: false, showReason: false, theme: 'primary', variant: 'base', size: 'small' })
const emit = defineEmits<{ run: [] }>()

const refused = computed(() => !!props.decision && !props.decision.allowed)
const reasons = computed(() => detailLines(props.decision?.details).slice(0, 12))
const reasonId = `gate-${Math.random().toString(36).slice(2, 9)}`

function click() {
  if (props.pending) return
  if (refused.value) {
    if (props.decision?.message) MessagePlugin.error(props.decision.message)
    return
  }
  emit('run')
}
</script>

<style scoped lang="less">
.gate { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; max-width: 100%; }
.gate--refused { opacity: 0.6; cursor: not-allowed; }
.gate__reason {
  // Refus motivé de l'API : texte d'alerte en rouge, comme tout refus.
  color: var(--td-error-color);
  font-size: var(--app-text-sm);
  line-height: 18px;
  overflow-wrap: anywhere;
  ul { margin: 2px 0 0; padding-left: 16px; }
}
</style>
