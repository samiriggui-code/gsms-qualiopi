<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.echeancier') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.echeancier.description') }}</p>
    </div>

    <GsmsFileNote file="backend/config/circuits/standard.yaml" />
    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <div v-if="loading" class="state-block"><t-loading size="small" /></div>

    <template v-else-if="circuit">
      <div class="group-title">{{ circuit.titre }}</div>
      <p class="group-desc">{{ t('gsms.parametres.echeancier.resume', { code: circuit.code, n: circuit.jalons.length }) }}</p>
      <div class="table-frame">
        <t-table row-key="cle" :data="circuit.jalons" :columns="columns" size="medium"
          :empty="t('gsms.parametres.echeancier.aucunJalon')">
          <template #libelle="{ row }">
            <div class="cell-main">{{ row.libelle }}</div>
            <div class="cell-sub"><code>{{ row.cle }}</code></div>
          </template>
          <template #echeance="{ row }">
            <div class="cell-main">{{ dueText(row) }}</div>
            <div class="cell-sub">{{ t('gsms.parametres.echeancier.alerte', { n: row.alerte_jours }, row.alerte_jours) }}</div>
          </template>
          <template #preuve="{ row }">
            <code>{{ row.preuve }}</code>
            <div v-if="factsText(row)" class="cell-sub">{{ factsText(row) }}</div>
            <div class="cell-sub">{{ t('gsms.parametres.echeancier.inscriptions', { statuts: row.inscriptions.join(', ') || '—' }) }}</div>
          </template>
          <template #indicateurs="{ row }">{{ row.indicateurs.join(', ') || '—' }}</template>
        </t-table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCircuit, type Circuit, type CircuitMilestone } from '@/api/gsms/qualite'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'

// Circuit de session lu tel que l'API l'applique (GET /qualiopi/circuit) : aucune échéance n'est calculée ici.
const { t } = useI18n()
const circuit = ref<Circuit | null>(null)
const loading = ref(true)
const loadError = ref<unknown>(null)

const columns = computed(() => [
  { colKey: 'libelle', title: t('gsms.parametres.echeancier.colJalon'), minWidth: 220 },
  { colKey: 'echeance', title: t('gsms.parametres.echeancier.colEcheance'), width: 200 },
  { colKey: 'preuve', title: t('gsms.parametres.echeancier.colPreuve'), minWidth: 200 },
  { colKey: 'responsable', title: t('gsms.parametres.echeancier.colResponsable'), width: 130 },
  { colKey: 'indicateurs', title: t('gsms.parametres.echeancier.colIndicateurs'), width: 110 },
])

/** « J-15 · début de session » : décalage et date de référence tels que le fichier les déclare. */
const dueText = (m: CircuitMilestone) => {
  const offset = m.decalage_jours === 0 ? 'J' : `J${m.decalage_jours > 0 ? '+' : ''}${m.decalage_jours}`
  const anchor = m.ancre === 'start' ? t('gsms.parametres.echeancier.debut')
    : m.ancre === 'end' ? t('gsms.parametres.echeancier.fin') : m.ancre
  return `${offset} · ${anchor}`
}
const factsText = (m: CircuitMilestone) =>
  Object.entries(m.faits ?? {}).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ')

onMounted(async () => {
  try {
    circuit.value = await getCircuit()
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
})
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
}
</style>
