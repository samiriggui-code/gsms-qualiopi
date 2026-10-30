<template>
  <GsmsRecordSheet :title="audit?.titre || t('gsms.qualite.audits.audit')" icon="fact-check" back="/platform/qualite/audits"
    :back-label="t('gsms.qualite.audits.titre')" :subtitle="audit ? `${audit.reference} · ${audit.type_libelle} · ${audit.auditeur}` : ''"
    :ready="!!audit" :loading="loading" :error="error" :tabs="filterTabs" :tab="filter" @update:tab="(v) => (filter = v)" @retry="load">
    <template v-if="audit" #status><GsmsStatusTag :code="audit.statut" :label="audit.statut_libelle" /></template>
    <template v-if="audit" #actions>
      <GsmsActionGate v-if="audit.statut === 'EN_COURS'" :decision="audit.capabilities.clore" @run="closeVisible = true">{{ t('gsms.qualite.audits.clore') }}</GsmsActionGate>
    </template>
    <template v-if="audit" #before>
      <p class="notice"><t-icon name="info-circle" size="14px" /> {{ audit.avertissement }}</p>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
    </template>
    <template v-if="audit" #side>
      <section class="side-section">
        <h3>{{ t('gsms.qualite.audits.photo') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.qualite.fiche.referentiel') }}</dt><dd>{{ audit.referentiel }}</dd></div>
          <div><dt>{{ t('gsms.qualite.audits.colPhoto') }}</dt><dd>{{ fmtDateTime(audit.photo_le) }}</dd></div>
          <div><dt>{{ t('gsms.qualite.audits.periode') }}</dt><dd>{{ fmtDate(audit.periode.du) }} → {{ fmtDate(audit.periode.au) }}</dd></div>
          <div><dt>{{ t('gsms.qualite.audits.echantillon') }}</dt><dd>{{ audit.echantillon.join(', ') || '—' }}</dd></div>
          <div><dt>{{ t('gsms.qualite.audits.colProgression') }}</dt><dd>{{ t('gsms.qualite.audits.progression', { n: audit.progression.juges, total: audit.progression.total }) }}</dd></div>
          <div v-if="audit.clos_le"><dt>{{ t('gsms.qualite.audits.closLe') }}</dt><dd>{{ fmtDateTime(audit.clos_le) }}</dd></div>
        </dl>
      </section>
      <section v-if="audit.conclusion" class="side-section">
        <h3>{{ t('gsms.saisies.conclusion') }}</h3>
        <p class="text">{{ audit.conclusion }}</p>
      </section>
      <p v-if="audit.statut === 'EN_COURS' && !audit.capabilities.juger.allowed" class="muted">{{ t('gsms.qualite.audits.jugementImpossible', { motif: audit.capabilities.juger.message }) }}</p>
      <p v-if="audit.statut === 'EN_COURS' && !audit.capabilities.clore.allowed" class="muted">{{ t('gsms.qualite.audits.clotureImpossible', { motif: audit.capabilities.clore.message }) }}</p>
    </template>

    <template v-if="audit">
      <EmptyState v-if="!groups.length" icon="fact-check" compact :title="t('gsms.commun.aucunResultat')" />
      <template v-for="c in groups" :key="c.numero">
        <div class="section-header"><span>{{ t('gsms.qualite.critere', { n: c.numero }) }} · {{ c.titre }}</span><span class="section-count">{{ c.items.length }}</span></div>
        <div class="grid">
          <div v-for="i in c.items" :key="i.numero" class="card card--static">
            <div class="card-header">
              <div class="card-header-left"><span class="chip">ind. {{ i.numero }}</span><span class="card-title" :title="i.titre">{{ i.titre }}</span></div>
            </div>
            <div class="card-meta">
              <span>{{ t('gsms.qualite.audits.moteur') }} <GsmsStatusTag :code="i.etat_moteur" /></span>
              <span>{{ t('gsms.qualite.audits.jugement') }}
                <GsmsStatusTag v-if="i.jugement" :code="i.jugement" :label="i.jugement_libelle" /><template v-else>{{ t('gsms.qualite.audits.aJuger') }}</template>
              </span>
              <span v-if="i.constat">{{ t('gsms.qualite.audits.constat', { ref: i.constat }) }}</span>
            </div>
            <p v-if="i.commentaire" class="muted">« {{ i.commentaire }} »<template v-if="i.par"> · {{ i.par }}</template></p>
            <p class="muted">{{ t('gsms.qualite.audits.figees', { preuves: i.preuves.length, ecarts: i.ecarts_ouverts.length }) }}</p>
            <div v-if="audit.statut === 'EN_COURS'" class="judge">
              <GsmsActionGate :decision="audit.capabilities.juger" variant="outline" @run="openJudge(i.numero)">
                {{ i.jugement ? t('gsms.qualite.audits.modifierJugement') : t('gsms.qualite.audits.juger') }}
              </GsmsActionGate>
            </div>
          </div>
        </div>
      </template>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="judgeVisible" :title="t('gsms.qualite.audits.jugerIndicateur', { n: judged })" :fields="judgeFields"
    :run="(v) => judgeIndicator(id, judged, v.jugement, v.commentaire)" @done="refresh" />
  <ActionDialog v-model:visible="closeVisible" :title="t('gsms.qualite.audits.clore')" :confirm-label="t('gsms.qualite.audits.clore')"
    danger :consequence="t('gsms.qualite.audits.cloreAide')" :fields="['conclusion']" :run="(v) => closeAudit(id, v.conclusion ?? '')" @done="refresh" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { closeAudit, getAudit, judgeIndicator, type AuditDetail } from '@/api/gsms/qualite'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.auditId || ''))
const audit = ref<AuditDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const filter = ref('all')
const judgeVisible = ref(false)
const closeVisible = ref(false)
const judged = ref(0)

async function load() {
  const asked = id.value
  loading.value = true
  error.value = null
  try {
    const res = await getAudit(asked)
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    audit.value = res
  } catch (e) {
    error.value = e
    audit.value = null
  } finally {
    loading.value = false
  }
}
watch(id, load, { immediate: true })

const filterTabs = computed(() => {
  const items = audit.value?.indicateurs ?? []
  return [
    { value: 'all', label: t('gsms.commun.tous'), count: items.length },
    { value: 'todo', label: t('gsms.qualite.audits.aJuger'), count: items.filter((i) => !i.jugement).length },
    { value: 'done', label: t('gsms.qualite.audits.juges'), count: items.filter((i) => i.jugement).length },
  ]
})

const groups = computed(() => {
  const a = audit.value
  if (!a) return []
  const items = a.indicateurs.filter((i) => filter.value === 'all' || (filter.value === 'todo' ? !i.jugement : !!i.jugement))
  const titles = new Map(a.criteres.map((c) => [c.numero, c.titre]))
  const map = new Map<number, { numero: number; titre: string; items: typeof items }>()
  for (const i of items) {
    const n = i.critere ?? 0
    if (!map.has(n)) map.set(n, { numero: n, titre: titles.get(n) ?? '', items: [] })
    map.get(n)!.items.push(i)
  }
  return [...map.values()].sort((x, y) => x.numero - y.numero)
})

// Libellés des jugements : ceux de l'API (le jugement CONFORME y est déjà « Satisfait »).
const judgeFields = computed<ActionField[]>(() => [
  { name: 'jugement', label: t('gsms.qualite.audits.jugement'), type: 'radio',
    options: (audit.value?.jugements_possibles ?? []).map((j) => ({
      value: j.jugement, label: j.motif_obligatoire ? t('gsms.qualite.audits.motifObligatoire', { libelle: j.libelle }) : j.libelle,
    })) },
  { name: 'commentaire', label: t('gsms.qualite.audits.commentaire'), type: 'textarea' },
])

function openJudge(n: number) {
  judged.value = n
  judgeVisible.value = true
}

async function refresh() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.grid { .gsms-grid(); }
.card { .gsms-card(); }
.card--static { cursor: default; }
.text { margin: 0; white-space: pre-line; font-size: var(--app-text-md); line-height: 20px; }
.chip { .gsms-chip(); flex-shrink: 0; }
.muted { .gsms-muted(); margin: 6px 0 0; }
.notice { .gsms-notice(); }
.section-header { .gsms-section-header(); margin-top: 12px; .section-count { color: var(--td-text-color-placeholder); } }
.judge { margin-top: 10px; }
</style>
