<template>
  <GsmsRecordSheet :title="item?.name || t('gsms.ficheEnrichie.sousTraitant')" icon="link" back="/platform/sous-traitants"
    :back-label="t('gsms.ressources.sousTraitants.titre')" :avatar-name="item?.name" :subtitle="item?.siret ? `${moyenLabel('siret')} ${item.siret}` : ''"
    :ready="!!item" :loading="loading" :error="error" :tabs="tabs" :tab="current" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="item" #status>
      <t-tag :theme="item.qualiopi_certified ? 'success' : 'default'" variant="light" size="small">{{ certLabel }}</t-tag>
    </template>
    <template v-if="item && canWrite" #actions>
      <t-button size="small" variant="outline" @click="editVisible = true"><template #icon><t-icon name="edit-1" /></template>{{ t('gsms.commun.modifier') }}</t-button>
      <t-button size="small" variant="outline" theme="danger" @click="remove">{{ t('gsms.commun.supprimer') }}</t-button>
    </template>

    <template v-if="item" #side>
      <GsmsInfoPanel :title="t('gsms.ficheEnrichie.identite')" icon="city" :rows="[
        { label: moyenLabel('sousTraitant'), value: item.name },
        { label: moyenLabel('siret'), value: item.siret },
        { label: moyenLabel('qualiopi'), value: certLabel },
      ]" />
      <GsmsInfoPanel :title="t('gsms.ficheEnrichie.suivi')" icon="time" :rows="[
        { label: moyenLabel('contract_signed_on'), value: item.contract_signed_on ? fmtDate(item.contract_signed_on) : null },
        { label: moyenLabel('last_review_on'), value: item.last_review_on ? fmtDate(item.last_review_on) : null },
        { label: t('gsms.ficheEnrichie.creeLe'), value: item.created_at ? fmtDateTime(item.created_at) : null },
        { label: t('gsms.ficheEnrichie.majLe'), value: item.updated_at ? fmtDateTime(item.updated_at) : null },
      ]" />
    </template>

    <!-- Vue d'ensemble : champs du sous-traitant (GET /subcontractors/{id}) et relevé du moteur (GET /qualiopi/evaluations/resultats) -->
    <template v-if="item && current === 'synthese'">
      <GsmsKpiRow :items="kpis" />
      <section v-if="canReadQuality" class="panel">
        <div class="panel-bar">
          <h3 class="title"><t-icon name="chart-bar" size="16px" class="title-icon" />{{ t('gsms.ficheEnrichie.moteur') }}</h3>
          <router-link to="/platform/qualite/indicateurs/27" class="link">{{ t('gsms.ficheEnrichie.ouvrirIndicateur') }}<t-icon name="chevron-right" size="14px" /></router-link>
        </div>
        <p class="muted">{{ t('gsms.ficheEnrichie.moteurAide') }}</p>
        <GsmsRefusal v-if="engineError" :error="engineError" inline />
        <t-skeleton v-else-if="!engine" animation="gradient" :row-col="[{ width: '100%' }, { width: '60%' }]" />
        <template v-else>
          <ul v-if="engineRows.length" class="rows">
            <li v-for="r in engineRows" :key="r.id" class="row">
              <div class="row-head"><span class="row-main">{{ r.libelle }}</span><GsmsStatusTag :code="r.etat" /></div>
              <p v-if="r.explication" class="muted">{{ r.explication }}</p>
            </li>
          </ul>
          <ul v-if="gaps.length" class="gaps">
            <li v-for="(g, i) in gaps" :key="i"><t-icon name="error-circle" size="14px" />{{ g }}</li>
          </ul>
          <p v-else-if="engineRows.length" class="ok"><t-icon name="check-circle" size="14px" />{{ t('gsms.ficheEnrichie.moteurOk') }}</p>
          <GsmsEmptyState v-else :title="t('gsms.graphiques.vide')" compact />
        </template>
      </section>
      <GsmsTimeline :title="t('gsms.ficheEnrichie.chronologie')" :subtitle="t('gsms.ficheEnrichie.chronologieAide')" :items="timeline"
        :empty="t('gsms.ficheEnrichie.chronologieVide')" />
      <p class="muted note">{{ t('gsms.ressources.sousTraitants.declaratif') }}</p>
    </template>

    <GsmsHistory v-else-if="item && current === 'historique'" table="formation.subcontractor" :entity-id="item.id" />
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="editVisible" :title="t('gsms.ressources.sousTraitants.modifier')" :fields="formFields"
    :run="(v) => updateRessource('subcontractors', id, moyenPayload('subcontractors', v))" @done="saved" />
</template>

<script setup lang="ts">
/**
 * Fiche d'un sous-traitant : identité, certification déclarée, contrat, dernière vérification, ce que le moteur
 * Qualiopi relève pour lui (contrôle des sous-traitants, indicateur 27), chronologie et historique des modifications.
 * L'API ne relie pas encore les sessions sous-traitées à la fiche : elles ne sont pas montrées.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsInfoPanel from '@/components/gsms/GsmsInfoPanel.vue'
import GsmsKpiRow from '@/components/gsms/GsmsKpiRow.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsEmptyState from '@/components/gsms/GsmsEmptyState.vue'
import GsmsTimeline, { type TimelineItem } from '@/components/gsms/GsmsTimeline.vue'
import GsmsHistory from '@/components/gsms/GsmsHistory.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { deleteRessource, getSubcontractor, updateRessource, type Subcontractor } from '@/api/gsms/ressources'
import { getControlResults, type ControlResult } from '@/api/gsms/qualite'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'
import type { KpiItem } from '@/components/gsms/types'
import { moyenFields, moyenLabel, moyenPayload, moyenWrite } from './moyenForm'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
access.load()
const canWrite = computed(() => access.can(moyenWrite('subcontractors')))
const canReadQuality = computed(() => access.can('quality.read'))

const id = computed(() => String(route.params.subcontractorId || ''))
const item = ref<Subcontractor | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

async function load() {
  const sid = id.value
  if (!sid) return
  loading.value = true
  error.value = null
  try {
    const res = await getSubcontractor(sid)
    if (sid === id.value) item.value = res
  } catch (e) {
    if (sid === id.value) { error.value = e; item.value = null }
  } finally {
    loading.value = false
  }
}
watch(id, load, { immediate: true })

const certLabel = computed(() => (item.value?.qualiopi_certified ? t('gsms.ressources.sousTraitants.certifie') : t('gsms.ressources.sousTraitants.nonCertifie')))

// ── Onglets : vue d'ensemble et historique (journal des modifications, droit `journal.read`) ──
const showHistory = computed(() => access.can('journal.read'))
const tab = ref(String(route.query.onglet) === 'historique' ? 'historique' : 'synthese')
const current = computed(() => (tab.value === 'historique' && showHistory.value ? 'historique' : 'synthese'))
const tabs = computed(() => (showHistory.value
  ? [{ value: 'synthese', label: t('gsms.ficheEnrichie.synthese') }, { value: 'historique', label: t('gsms.ficheEnrichie.historique') }]
  : []))
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

// ── Relevé du moteur : résultats de l'indicateur 27 et manques nommés pour ce sous-traitant (champ `who` de l'API) ──
const engine = ref<ControlResult[] | null>(null)
const engineError = ref<unknown>(null)
watch(canReadQuality, async (can) => {
  if (!can || engine.value) return
  engineError.value = null
  try {
    engine.value = (await getControlResults()).resultats
  } catch (e) {
    engineError.value = e
  }
}, { immediate: true })
const engineRows = computed(() => (engine.value ?? []).filter((r) => r.indicateur === 27))
const gaps = computed(() => engineRows.value.flatMap((r) => (r.manquants ?? []).filter((m) => m.who === item.value?.name).map((m) => m.reason)))

const kpis = computed<KpiItem[]>(() => {
  const s = item.value
  if (!s) return []
  return [
    { key: 'cert', label: moyenLabel('qualiopi'), value: s.qualiopi_certified ? t('gsms.ficheEnrichie.oui') : t('gsms.ficheEnrichie.non'), icon: 'certificate',
      subtitle: certLabel.value, tone: s.qualiopi_certified ? 'success' : undefined },
    { key: 'contrat', label: moyenLabel('contract_signed_on'), value: s.contract_signed_on ? fmtDate(s.contract_signed_on) : '—', icon: 'file-paste' },
    { key: 'revue', label: moyenLabel('last_review_on'), value: s.last_review_on ? fmtDate(s.last_review_on) : '—', icon: 'search' },
    ...(canReadQuality.value && engine.value ? [{ key: 'moteur', label: t('gsms.ficheEnrichie.moteurIndicateur'), value: gaps.value.length,
      subtitle: gaps.value.length ? undefined : t('gsms.ficheEnrichie.moteurOk'), icon: 'chart-bar',
      tone: gaps.value.length ? 'danger' as const : engineRows.value.length ? 'success' as const : undefined, to: '/platform/qualite/indicateurs/27' }] : []),
  ]
})

const time = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).getTime() : 0)
const timeline = computed<TimelineItem[]>(() => {
  const s = item.value
  if (!s) return []
  const out: TimelineItem[] = []
  if (s.created_at) out.push({ key: 'cree', date: s.created_at, dateLabel: fmtDateTime(s.created_at), title: t('gsms.ficheEnrichie.evtCree'), detail: s.created_by ? t('gsms.ficheEnrichie.par', { auteur: s.created_by }) : null, icon: 'add' })
  if (s.contract_signed_on) out.push({ key: 'contrat', date: s.contract_signed_on, dateLabel: fmtDate(s.contract_signed_on), title: t('gsms.ficheEnrichie.evtContratSigne'), icon: 'file-paste' })
  if (s.last_review_on) out.push({ key: 'revue', date: s.last_review_on, dateLabel: fmtDate(s.last_review_on), title: t('gsms.ficheEnrichie.evtRevue'), icon: 'search' })
  return out.sort((a, b) => time(b.date) - time(a.date))
})

// ── Modifier, supprimer (quality.write) ──
const editVisible = ref(false)
const formFields = computed(() => moyenFields('subcontractors', item.value))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}
async function remove() {
  const done = await confirmCritical({
    title: t('gsms.ressources.sousTraitants.supprimer'), consequence: t('gsms.commun.suppressionDefinitive'), confirmLabel: t('gsms.commun.supprimer'),
    confirmText: item.value?.name || undefined, run: () => deleteRessource('subcontractors', id.value).then(() => true),
  })
  if (done) router.push('/platform/sous-traitants')
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.title { .gsms-panel-title(); margin: 0; display: inline-flex; align-items: center; gap: 8px; }
.title-icon { color: var(--td-text-color-secondary); }
.muted { .gsms-muted(); margin: 0; overflow-wrap: anywhere; }
.note { margin-top: 4px; }
.rows { .gsms-rows(); }
.row { padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
.row-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 6px 10px; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.gaps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px;
  li { display: flex; align-items: flex-start; gap: 6px; color: var(--td-error-color); font-size: var(--app-text-sm); overflow-wrap: anywhere; .t-icon { margin-top: 2px; flex-shrink: 0; } } }
.ok { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); .t-icon { color: var(--td-success-color); } }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
</style>
