<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.preuves') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.preuves.description') }}</p>
    </div>

    <GsmsFileNote file="backend/config/dossiers/standard.yaml" />
    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <div v-if="loading" class="state-block"><t-loading size="small" /></div>
    <div v-else-if="noOrg" class="state-block">{{ t('gsms.parametres.preuves.sansOrganisme') }}</div>

    <template v-else-if="dossier">
      <div class="group-title">{{ dossier.label }}</div>
      <p class="group-desc">{{ t('gsms.parametres.preuves.resume', { required: dossier.required, complete: dossier.complete }) }}</p>
      <div class="table-frame">
        <t-table row-key="code" :data="dossier.items" :columns="columns" size="medium">
          <template #label="{ row }">
            <div class="cell-main">{{ row.label }}</div>
            <div class="cell-sub"><code>{{ row.code }}</code></div>
            <ul v-if="row.grille.length" class="grille">
              <li v-for="g in row.grille" :key="g.code">
                {{ g.question }}
                <t-tag size="small" variant="light" :theme="g.exigence === 'GSMS' ? 'default' : 'warning'">
                  {{ exigenceLabel(g.exigence) }}
                </t-tag>
              </li>
            </ul>
          </template>
          <template #required="{ row }">{{ t(row.required ? 'gsms.parametres.preuves.attendue' : 'gsms.parametres.preuves.facultative') }}</template>
          <template #indicators="{ row }">{{ row.indicators.join(', ') || '—' }}</template>
        </t-table>
      </div>
      <p class="meta">{{ t('gsms.parametres.preuves.formateur') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getOrganisme } from '@/api/gsms/platform'
import { getPieceDossier, type PieceDossier } from '@/api/gsms/dossiers'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'

const { t, te } = useI18n()
const dossier = ref<PieceDossier | null>(null)
const loading = ref(true)
const noOrg = ref(false)
const loadError = ref<unknown>(null)

const columns = computed(() => [
  { colKey: 'label', title: t('gsms.parametres.preuves.colPiece'), minWidth: 300 },
  { colKey: 'required', title: t('gsms.parametres.preuves.colStatut'), width: 120 },
  { colKey: 'indicators', title: t('gsms.parametres.preuves.colIndicateurs'), width: 110 },
])

// Origine d'un point de grille déclarée dans le fichier (grille[].exigence).
const exigenceLabel = (e: string) => (te(`gsms.parametres.preuves.exigences.${e}`) ? t(`gsms.parametres.preuves.exigences.${e}`) : e)

onMounted(async () => {
  try {
    const org = await getOrganisme()
    if (!org.id) {
      noOrg.value = true
      return
    }
    dossier.value = await getPieceDossier('ORGANISME', org.id)
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

  code {
    font-family: var(--app-font-family-mono);
  }
}

.grille {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  line-height: 1.6;
}
</style>
