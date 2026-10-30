<template>
  <t-drawer :visible="visible" :header="session?.reference || slot?.session.reference || ''" :size="size" attach="body" :footer="false"
    :close-btn="true" destroy-on-close @update:visible="(v: boolean) => emit('update:visible', v)" @close="emit('update:visible', false)">
    <PlanningSessionPanel :slot="slot" :session="session" :alerts="alerts" @close="emit('update:visible', false)" />
  </t-drawer>
</template>

<script setup lang="ts">
/** Tiroir de la fiche d'un créneau (vues Mois et Liste, téléphone) ; plein écran sous 480 px. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PlanningAlert, PlanningSession, PlanningSlot } from '@/api/gsms/pilotage'
import PlanningSessionPanel from './PlanningSessionPanel.vue'

defineProps<{ visible: boolean; slot: PlanningSlot | null; session: PlanningSession | null; alerts: PlanningAlert[] }>()
const emit = defineEmits<{ 'update:visible': [boolean] }>()

const narrow = ref(false)
let mq: MediaQueryList | null = null
const onMq = (e: MediaQueryListEvent) => { narrow.value = e.matches }
onMounted(() => { mq = window.matchMedia('(max-width: 479px)'); narrow.value = mq.matches; mq.addEventListener('change', onMq) })
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))
const size = computed(() => (narrow.value ? '100%' : 'min(520px, 100vw)'))
</script>
