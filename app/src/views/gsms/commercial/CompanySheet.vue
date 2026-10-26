<template>
  <GsmsRecordSheet :title="company?.name || t('gsms.commercial.entreprises.fiche')" icon="city" back="/platform/entreprises"
    :back-label="t('gsms.commercial.entreprises.titre')" :subtitle="company ? t('gsms.commercial.entreprises.resume', { stagiaires: company.learners, inscriptions: company.enrollments }) : ''"
    :ready="!!company" :loading="loading" :error="error" :tabs="tabs" :tab="current" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="company?.code" #status><span class="chip">{{ company.code }}</span></template>
    <template v-if="company && canWrite" #actions>
      <t-button size="small" variant="outline" @click="formVisible = true">{{ t('gsms.commun.modifier') }}</t-button>
      <t-button size="small" variant="outline" theme="danger" @click="confirmRemove">{{ t('gsms.commun.supprimer') }}</t-button>
    </template>
    <template v-if="company" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template v-if="company" #side>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.entreprises.coordonnees') }}</h3>
        <dl>
          <div><dt>{{ companyLabel('siret') }}</dt><dd>{{ company.siret || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.entreprises.adresse') }}</dt><dd>{{ address || '—' }}</dd></div>
          <div><dt>{{ companyLabel('phone') }}</dt><dd>{{ company.phone || '—' }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.entreprises.contact') }}</h3>
        <dl>
          <div><dt>{{ companyLabel('contact_name') }}</dt><dd>{{ company.contact_name || '—' }}</dd></div>
          <div><dt>{{ companyLabel('contact_role') }}</dt><dd>{{ company.contact_role || '—' }}</dd></div>
          <div><dt>{{ companyLabel('contact_email') }}</dt><dd>{{ company.contact_email || '—' }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="company">
      <!-- Stagiaires rattachés à l'entreprise -->
      <section v-if="current === 'stagiaires'" class="panel">
        <GsmsRefusal v-if="learnersError" :error="learnersError" inline />
        <t-skeleton v-else-if="!learners" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!learners.length" class="muted">{{ t('gsms.commercial.entreprises.aucunStagiaire') }}</p>
        <ul v-else class="rows">
          <li v-for="l in learners" :key="l.id">
            <router-link :to="`/platform/stagiaires/${l.id}`" class="row">
              <GsmsPersonAvatar :name="l.full_name" />
              <span class="row-main">{{ l.full_name }}</span>
              <span class="muted">{{ l.email || '—' }}</span>
              <span class="chip">{{ t('gsms.stagiaires.nInscriptions', { n: l.enrollments }, l.enrollments) }}</span>
              <t-icon name="chevron-right" class="row-chevron" />
            </router-link>
          </li>
        </ul>
      </section>

      <!-- Devis adressés à l'entreprise -->
      <section v-else class="panel">
        <div v-if="canQuote" class="panel-bar">
          <span />
          <t-button size="small" :loading="creating" @click="newQuote"><template #icon><t-icon name="add" /></template>{{ t('gsms.commercial.devis.nouveau') }}</t-button>
        </div>
        <GsmsRefusal v-if="quotesError" :error="quotesError" inline />
        <t-skeleton v-else-if="!quotes" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!quotes.length" class="muted">{{ t('gsms.commercial.entreprises.aucunDevis') }}</p>
        <ul v-else class="rows">
          <li v-for="q in quotes" :key="q.id">
            <router-link :to="`/platform/devis/${q.id}`" class="row">
              <span class="chip">{{ q.reference }}</span>
              <span class="row-main">{{ q.titre || '—' }}</span>
              <span class="muted">{{ t('gsms.commercial.devis.valideJusquAu', { date: fmtDate(q.valide_jusqu_au) }) }}</span>
              <GsmsStatusTag :code="q.statut" :label="q.statut_libelle" />
              <t-icon name="chevron-right" class="row-chevron" />
            </router-link>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-if="company" v-model:visible="formVisible" :title="t('gsms.commercial.entreprises.modifier')" :fields="companyFields(company)"
    :run="(v) => updateCompany(id, v)" @done="saved" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { deleteCompany, getCompany, updateCompany, type Company } from '@/api/gsms/entreprises'
import { listLearnerRecords, type LearnerRecord } from '@/api/gsms/sessions'
import { createEdition, listEditions, type EditionRow } from '@/api/gsms/editions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'
import { companyFields, companyLabel } from './companyForm'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const id = computed(() => String(route.params.companyId || ''))
const company = ref<Company | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const learners = ref<LearnerRecord[] | null>(null)
const learnersError = ref<unknown>(null)
const quotes = ref<EditionRow[] | null>(null)
const quotesError = ref<unknown>(null)
const formVisible = ref(false)
const creating = ref(false)

const canWrite = computed(() => access.can('sessions.write'))
// Onglet Devis : seulement avec `documents.read` (GET /bootstrap) ; création avec `documents.write`.
const showQuotes = computed(() => access.can('documents.read'))
const canQuote = computed(() => access.can('documents.write'))
const tab = ref(String(route.query.onglet) === 'devis' ? 'devis' : 'stagiaires')
const current = computed(() => (tab.value === 'devis' && showQuotes.value ? 'devis' : 'stagiaires'))
const tabs = computed(() => [
  { value: 'stagiaires', label: t('gsms.menu.entrees.stagiaires'), count: learners.value?.length },
  ...(showQuotes.value ? [{ value: 'devis', label: t('gsms.menu.entrees.devis'), count: quotes.value?.length }] : []),
])
const address = computed(() => {
  const c = company.value
  return c ? [c.address, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
})

async function load() {
  const asked = id.value
  if (!asked) return
  loading.value = true
  error.value = null
  try {
    const res = await getCompany(asked)
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    company.value = res
  } catch (e) {
    if (asked !== id.value) return
    error.value = e
    company.value = null
    return
  } finally {
    loading.value = false
  }
  loadLearners(asked)
  await access.load()
  if (showQuotes.value) loadQuotes(asked)
}

// Aucune route ne filtre par entreprise : on relève les stagiaires et les devis qui portent son identifiant.
async function loadLearners(asked: string) {
  learners.value = null
  learnersError.value = null
  try {
    const all = await listLearnerRecords()
    if (asked === id.value) learners.value = all.filter((l) => l.company_id === asked).sort((a, b) => a.full_name.localeCompare(b.full_name))
  } catch (e) {
    if (asked === id.value) learnersError.value = e
  }
}
async function loadQuotes(asked: string) {
  quotes.value = null
  quotesError.value = null
  try {
    const all = await listEditions()
    if (asked === id.value) quotes.value = all.filter((q) => q.type === 'DEVIS' && q.client?.id === asked)
  } catch (e) {
    if (asked === id.value) quotesError.value = e
  }
}

watch(id, () => { actionError.value = null; load() }, { immediate: true })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))
watch(showQuotes, (v) => { if (v && company.value && !quotes.value) loadQuotes(id.value) })

async function saved(res: unknown) {
  company.value = res as Company
  MessagePlugin.success(t('gsms.commun.enregistre'))
}

function confirmRemove() {
  const dlg = DialogPlugin.confirm({
    header: t('gsms.commercial.entreprises.supprimer'), body: t('gsms.commun.suppressionDefinitive'), theme: 'danger',
    confirmBtn: { content: t('gsms.commun.supprimer'), theme: 'danger' }, cancelBtn: t('gsms.commun.annuler'),
    onConfirm: () => { dlg.destroy(); remove() },
    onClose: () => dlg.destroy(),
  })
}

async function remove() {
  actionError.value = null
  try {
    await deleteCompany(id.value)
    MessagePlugin.success(t('gsms.commercial.entreprises.supprimee'))
    router.push('/platform/entreprises')
  } catch (e) {
    actionError.value = e
  }
}

async function newQuote() {
  creating.value = true
  actionError.value = null
  try {
    const q = await createEdition(id.value)
    router.push(`/platform/devis/${q.id}`)
  } catch (e) {
    actionError.value = e
  } finally {
    creating.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.muted { .gsms-muted(); margin: 0; }
.chip { .gsms-chip(); }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; color: inherit; text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); } }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.row-chevron { color: var(--td-text-color-placeholder); }
</style>
