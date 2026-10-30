<template>
  <div class="gsms-page">
    <div class="gsms-page-content">
      <GsmsPageHeader :title="t('gsms.bilans.bpf.titre')" icon="help-circle" :subtitle="t('gsms.bilans.bpf.sousTitre')"
        back="/platform/rapports" :back-label="t('gsms.bilans.titre')">
        <template #actions>
          <t-select v-model="year" size="small" :options="yearOptions" class="year" :aria-label="t('gsms.bilans.bpf.exercice')" />
        </template>
      </GsmsPageHeader>

      <div class="gsms-page-main">
        <!-- Avertissement de l'API, toujours en tête : ce n'est pas le BPF -->
        <div class="warning" role="note">
          <t-icon name="error-triangle" size="20px" />
          <div>
            <strong>{{ t('gsms.bilans.bpf.pasLeBpf') }}</strong>
            <p>{{ help?.avertissement || t('gsms.bilans.bpf.pasLeBpfAide') }}</p>
          </div>
        </div>

        <div v-if="loading && !help" class="panel"><t-skeleton animation="gradient" :row-col="[{ width: '50%' }, { width: '100%' }, { width: '80%' }]" /></div>
        <GsmsRefusal v-else-if="error" :error="error">
          <t-button size="small" variant="outline" @click="load">{{ t('gsms.commun.reessayer') }}</t-button>
        </GsmsRefusal>
        <template v-else-if="help">
          <p class="muted">
            {{ t('gsms.bilans.bpf.periode', { du: fmtDate(help.du), au: fmtDate(help.au) }) }}
            · {{ help.exercice_clos ? t('gsms.bilans.bpf.clos') : t('gsms.bilans.bpf.nonClos') }}
          </p>
          <GsmsKpiRow :items="kpis" class="kpis" />
          <ul v-if="help.synthese.inscriptions_sans_heures || help.synthese.presences_sans_horaires" class="gaps">
            <li v-if="help.synthese.inscriptions_sans_heures">{{ t('gsms.bilans.bpf.sansHeures', { n: help.synthese.inscriptions_sans_heures }) }}</li>
            <li v-if="help.synthese.presences_sans_horaires">{{ t('gsms.bilans.bpf.sansHoraires', { n: help.synthese.presences_sans_horaires }) }}</li>
          </ul>

          <section class="legend" :aria-label="t('gsms.bilans.bpf.legende')">
            <span v-for="s in STATES" :key="s" class="legend-item"><GsmsStatusTag :code="s" :label="stateName(s)" />{{ t(`gsms.bilans.bpf.etatsAide.${s}`) }}</span>
          </section>

          <div class="blocks">
            <section v-for="b in help.cadres" :key="b.cadre" class="block" :class="`block--${b.etat}`" :aria-labelledby="`cadre-${b.cadre}`">
              <header class="block-head">
                <h3 :id="`cadre-${b.cadre}`"><span class="letter">{{ b.cadre }}</span>{{ b.intitule }}</h3>
                <GsmsStatusTag :code="b.etat" :label="stateName(b.etat)" />
              </header>
              <BpfValues :values="b.valeurs" />
              <div v-if="b.manque" class="missing">
                <t-icon name="info-circle" size="14px" />
                <span><strong>{{ t('gsms.bilans.bpf.manque') }}</strong> {{ b.manque }}</span>
              </div>
              <p v-if="b.methode" class="method"><strong>{{ t('gsms.bilans.bpf.methode') }}</strong> {{ b.methode }}</p>
            </section>
          </div>

          <section class="sources">
            <h3>{{ t('gsms.bilans.bpf.sources') }}</h3>
            <ul>
              <li v-for="s in help.sources" :key="s"><a :href="s" target="_blank" rel="noopener noreferrer">{{ s }}</a></li>
            </ul>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Aide au BPF (page 3) : GET /bilans/bpf?exercice=, cadre par cadre, avec l'état que l'API donne (calculé, indicatif,
 * partiel, non calculable) et ce qui manque. Ce n'est pas le BPF : l'avertissement de l'API reste en tête de page.
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsPageHeader from '@/components/gsms/GsmsPageHeader.vue'
import GsmsKpiRow from '@/components/gsms/GsmsKpiRow.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import BpfValues from './BpfValues.vue'
import type { KpiItem } from '@/components/gsms/types'
import { getBpfHelp, type BpfHelp } from '@/api/gsms/pilotage'
import { fmtDate } from '@/components/gsms/format'

const STATES = ['CALCULE', 'INDICATIF', 'PARTIEL', 'NON_CALCULABLE'] as const

const { t, te, locale } = useI18n()
const current = new Date().getFullYear()
// Le BPF porte sur le dernier exercice clos : l'année précédente par défaut ; l'API refuse un exercice à venir (422).
const year = ref(current - 1)
const yearOptions = Array.from({ length: 6 }, (_, i) => ({ value: current - i, label: String(current - i) }))

const help = ref<BpfHelp | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
let seq = 0

async function load() {
  const n = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await getBpfHelp(year.value)
    if (n === seq) help.value = res
  } catch (e) {
    if (n === seq) { error.value = e; help.value = null }
  } finally {
    if (n === seq) loading.value = false
  }
}
watch(year, load, { immediate: true })

const stateName = (s: string) => (te(`gsms.bilans.bpf.etats.${s}`) ? t(`gsms.bilans.bpf.etats.${s}`) : s)
const num = (v: number) => v.toLocaleString(locale.value, { maximumFractionDigits: 2 })
const kpis = computed<KpiItem[]>(() => {
  const s = help.value?.synthese
  if (!s) return []
  return [
    { key: 'sessions', label: t('gsms.bilans.bpf.kpi.sessions'), value: num(s.sessions), icon: 'calendar-1' },
    { key: 'stagiaires', label: t('gsms.bilans.bpf.kpi.stagiaires'), value: num(s.stagiaires), subtitle: t('gsms.bilans.bpf.kpi.personnes', { n: s.personnes }), icon: 'usergroup' },
    { key: 'heures', label: t('gsms.bilans.bpf.kpi.heures'), value: num(s.heures_stagiaires),
      subtitle: t('gsms.bilans.bpf.kpi.dontEstimees', { n: num(s.dont_heures_estimees) }), icon: 'time' },
  ]
})
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.gsms-page { .gsms-page-shell(); }
.gsms-page-content { .resource-list-content(); }
.gsms-page-main { .resource-list-main(); }
.panel { .gsms-panel(); }
.year { width: 110px; }
.muted { .gsms-muted(); margin: 0 0 10px; }
.kpis { margin-bottom: 10px; }
.warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--td-warning-color) 55%, transparent);
  border-radius: var(--app-radius-md);
  background: var(--td-warning-color-light);
  color: var(--td-text-color-primary);
  > .t-icon { flex-shrink: 0; color: var(--td-warning-color); }
  strong { display: block; font-size: var(--app-text-lg); line-height: 22px; }
  p { margin: 4px 0 0; font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; }
}
.gaps { margin: 0 0 12px; padding-left: 18px; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 20px; }
.legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);
  line-height: 20px;
}
.legend-item { display: flex; align-items: flex-start; gap: 8px; }
.blocks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 12px; align-items: start; }
.block {
  .gsms-panel();
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 3px solid var(--td-component-stroke);
  &--CALCULE { border-left-color: var(--td-success-color); }
  &--INDICATIF, &--PARTIEL { border-left-color: var(--td-warning-color); }
  &--NON_CALCULABLE { border-left-color: var(--td-text-color-disabled); background: var(--td-bg-color-secondarycontainer); }
}
.block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  h3 { .gsms-panel-title(); display: flex; align-items: flex-start; gap: 8px; margin: 0; min-width: 0; overflow-wrap: anywhere; }
}
.letter { .gsms-chip(); flex-shrink: 0; height: 22px; font-weight: 700; }
.missing {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-container-hover);
  font-size: var(--app-text-sm);
  line-height: 18px;
  overflow-wrap: anywhere;
  .t-icon { margin-top: 2px; flex-shrink: 0; color: var(--td-warning-color); }
}
.method { margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 18px; overflow-wrap: anywhere; }
.sources {
  margin-top: 16px;
  h3 { .gsms-panel-title(); }
  ul { .gsms-plain(); }
}
</style>
