<template>
  <GsmsRecordSheet :title="chain ? `${t('gsms.qualite.indicateur', { n: chain.indicateur.numero })} · ${chain.indicateur.titre}` : t('gsms.qualite.indicateur', { n: number })"
    icon="chart-bar" back="/platform/qualite/indicateurs" :back-label="t('gsms.qualite.indicateurs.titre')"
    :subtitle="chain ? `${t('gsms.qualite.critere', { n: chain.critere.numero })} · ${chain.critere.titre}` : ''"
    :ready="!!chain" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="chain" #status><GsmsStatusTag :code="chain.etat" /></template>
    <template v-if="chain" #before><p class="notice"><t-icon name="info-circle" size="14px" /> {{ chain.avertissement }}</p></template>
    <template v-if="chain" #side>
      <section class="side-section">
        <h3>{{ t('gsms.qualite.fiche.identite') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.qualite.fiche.code') }}</dt><dd>{{ chain.indicateur.code }}</dd></div>
          <div><dt>{{ t('gsms.qualite.fiche.referentiel') }}</dt><dd>{{ chain.referentiel.version }} · {{ fmtDate(chain.referentiel.en_vigueur_le) }}</dd></div>
          <div><dt>{{ t('gsms.qualite.fiche.portee') }}</dt><dd>{{ chain.indicateur.portee }}</dd></div>
          <div><dt>{{ t('gsms.qualite.fiche.ponderation') }}</dt><dd>{{ chain.indicateur.ponderation || '—' }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.qualite.fiche.preuvesAttendues') }}</h3>
        <ul class="plain">
          <li v-for="p in chain.preuves_attendues" :key="p.type">{{ p.libelle }} : {{ p.disponibles }} / {{ p.total }}</li>
        </ul>
      </section>
    </template>

    <template v-if="chain">
      <section v-if="tab === 'controles'" class="panel">
        <p v-if="!chain.controles.length" class="muted">{{ t('gsms.qualite.fiche.aucunControle') }}</p>
        <div v-for="c in chain.controles" :key="c.cle" class="sub">
          <strong>{{ c.libelle }}</strong>
          <p v-if="c.remediation" class="muted">{{ t('gsms.qualite.aFaire', { texte: c.remediation }) }}</p>
          <ul class="plain">
            <li v-for="(r, i) in c.resultats" :key="i"><GsmsStatusTag :code="r.etat" /> {{ r.cible }}<template v-if="r.explication"> — {{ r.explication }}</template></li>
          </ul>
        </div>
      </section>
      <section v-else-if="tab === 'preuves'" class="panel">
        <p v-if="!chain.preuves.liste.length" class="muted">{{ t('gsms.qualite.preuves.aucune') }}</p>
        <ul class="plain">
          <li v-for="p in chain.preuves.liste" :key="p.id">
            <router-link :to="`/platform/qualite/preuves/${p.id}`">{{ p.reference }}</router-link> · {{ p.libelle }} <GsmsStatusTag :code="p.statut" />
          </li>
        </ul>
      </section>
      <section v-else-if="tab === 'ecarts'" class="panel">
        <p v-if="!chain.ecarts.length" class="muted">{{ t('gsms.qualite.fiche.aucunEcart') }}</p>
        <ul class="plain">
          <li v-for="e in chain.ecarts" :key="e.id">
            <router-link to="/platform/qualite/constats">{{ e.reference }}</router-link> · {{ e.titre }} <GsmsStatusTag :code="e.statut" />
          </li>
        </ul>
      </section>
      <section v-else-if="tab === 'exigences'" class="panel">
        <details v-for="ex in chain.indicateur.exigences" :key="ex.section" class="exigence" open>
          <summary>{{ ex.section }}</summary>
          <p>{{ ex.texte }}</p>
        </details>
      </section>
      <section v-else class="panel">
        <p v-if="!chain.historique.length" class="muted">{{ t('gsms.commun.aucunHistorique') }}</p>
        <ul class="timeline">
          <li v-for="(h, i) in chain.historique" :key="i">
            <span class="tl-date">{{ fmtDateTime(h.le) }}</span><span>{{ h.libelle }}</span><span class="muted">{{ h.par }}</span>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { getIndicatorChain, type IndicatorChain } from '@/api/gsms/qualite'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const number = computed(() => Number(route.params.number))
const chain = ref<IndicatorChain | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const tab = ref('controles')
const tabs = computed(() => [
  { value: 'controles', label: t('gsms.qualite.fiche.controles'), count: chain.value?.controles.length },
  { value: 'preuves', label: t('gsms.qualite.fiche.preuvesOnglet'), count: chain.value?.preuves.total },
  { value: 'ecarts', label: t('gsms.qualite.fiche.ecarts'), count: chain.value?.ecarts.length },
  { value: 'exigences', label: t('gsms.qualite.fiche.exigencesOnglet') },
  { value: 'historique', label: t('gsms.commun.historique') },
])

async function load() {
  loading.value = true
  error.value = null
  try {
    chain.value = await getIndicatorChain(number.value)
  } catch (e) {
    error.value = e
    chain.value = null
  } finally {
    loading.value = false
  }
}
watch(number, load, { immediate: true })
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.muted { .gsms-muted(); margin: 2px 0 4px; }
.notice { .gsms-notice(); }
.sub { margin-bottom: 12px; strong { font-size: var(--app-text-md); } }
.plain { .gsms-plain(); }
.timeline { .gsms-timeline(); }
.exigence { margin-bottom: 8px; summary { cursor: pointer; font-size: var(--app-text-md); font-weight: 500; } p { white-space: pre-line; font-size: var(--app-text-sm); line-height: 20px; color: var(--td-text-color-secondary); } }
</style>
