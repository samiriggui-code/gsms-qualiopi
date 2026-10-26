<template>
  <GsmsListPage :title="t('gsms.finances.financement.titre')" icon="wallet" :subtitle="t('gsms.finances.financement.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(c) => `/platform/financement/${c.inscription_id}`"
    :empty-title="cases?.length ? t('gsms.commun.aucunResultat') : t('gsms.finances.financement.aucun')"
    :empty-description="cases?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.finances.financement.aucunAide')" @retry="load">
    <template v-if="canWrite" #actions>
      <t-button theme="primary" size="small" @click="openVisible = true"><template #icon><t-icon name="add" /></template>{{ t('gsms.finances.financement.ouvrir') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="statut" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-sources="{ row }">
      <span class="chips"><span v-for="s in row.sources" :key="s.id" class="chip">{{ s.dispositif }} · {{ stateLabel(s.etat) }}</span></span>
    </template>
    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" /></template>
    <template #cell-cout="{ row }">{{ euros(row.cout) }}</template>
    <template #cell-accorde="{ row }">{{ euros(row.accorde) }}</template>
    <template #cell-reste_a_financer="{ row }">{{ euros(row.reste_a_financer) }}</template>

    <template #card="{ item }">
      <router-link :to="`/platform/financement/${item.inscription_id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.stagiaire }}</span></div>
          <GsmsStatusTag :code="item.statut" />
        </div>
        <div class="card-content">
          <p class="card-description">{{ item.session }}</p>
          <div class="chips"><span v-for="s in item.sources" :key="s.id" class="chip">{{ s.dispositif }} · {{ stateLabel(s.etat) }}</span></div>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>{{ t('gsms.finances.financement.cout') }} {{ euros(item.cout) }}</span>
            <span>{{ t('gsms.finances.financement.accorde') }} {{ euros(item.accorde) }}</span>
            <span>{{ t('gsms.finances.financement.reste') }} {{ euros(item.reste_a_financer) }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <t-dialog v-model:visible="openVisible" :header="t('gsms.finances.financement.ouvrir')" attach="body" destroy-on-close
    width="min(520px, calc(100vw - 32px))" :close-on-overlay-click="!submitting"
    :confirm-btn="{ content: t('gsms.finances.financement.ouvrir'), loading: submitting }" :cancel-btn="{ content: t('gsms.commun.annuler') }"
    @confirm="openCase" @close="openVisible = false" @cancel="openVisible = false">
    <p class="intro">{{ t('gsms.finances.financement.ouvrirAide') }}</p>
    <GsmsRefusal v-if="pickError" :error="pickError" inline />
    <t-form label-align="top" @submit.prevent>
      <t-form-item :label="t('gsms.finances.financement.session')">
        <t-select v-model="form.session" :options="sessionOptions" filterable clearable @change="loadEnrollments" />
      </t-form-item>
      <t-form-item :label="t('gsms.finances.financement.stagiaire')">
        <t-select v-model="form.inscription" :options="enrollmentOptions" :disabled="!form.session" clearable />
      </t-form-item>
      <t-form-item :label="t('gsms.finances.financement.coutAide')">
        <t-input-number v-model="form.cout" theme="normal" :min="0" :decimal-places="2" style="width: 100%" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { listFundingCases, openFundingCase, type FundingCase } from '@/api/gsms/funding'
import { getSession, listSessions, type SessionInscription, type SessionRow } from '@/api/gsms/sessions'
import { stateLabel } from '@/components/gsms/format'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { euros } from './display'

const { t } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
const canWrite = computed(() => access.can('funding.write'))

const cases = ref<FundingCase[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const statut = ref('all')
const query = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    cases.value = await listFundingCases()
  } catch (e) {
    error.value = e
    cases.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const tabs = computed(() => {
  const all = cases.value ?? []
  const codes = [...new Set(all.map((c) => c.statut))]
  return [{ value: 'all', label: t('gsms.commun.tous'), count: all.length },
    ...codes.map((c) => ({ value: c, label: stateLabel(c), count: all.filter((x) => x.statut === c).length }))]
})
const rows = computed(() => {
  if (!cases.value) return null
  const q = query.value.trim().toLowerCase()
  return cases.value.filter((c) => (statut.value === 'all' || c.statut === statut.value)
    && (!q || [c.stagiaire, c.session, ...c.sources.map((s) => `${s.libelle} ${s.financeur ?? ''}`)].join(' ').toLowerCase().includes(q)))
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'stagiaire', title: t('gsms.finances.financement.stagiaire'), link: true },
  { colKey: 'session', title: t('gsms.finances.financement.session') },
  { colKey: 'sources', title: t('gsms.finances.financement.sources') },
  { colKey: 'statut', title: t('gsms.finances.financement.statut') },
  { colKey: 'cout', title: t('gsms.finances.financement.cout'), width: 110 },
  { colKey: 'accorde', title: t('gsms.finances.financement.accorde'), width: 110 },
  { colKey: 'reste_a_financer', title: t('gsms.finances.financement.reste'), width: 130 },
])

// Ouverture d'un dossier : session puis inscription (aucune route ne liste les inscriptions sans dossier).
const openVisible = ref(false)
const submitting = ref(false)
const sessions = ref<SessionRow[]>([])
const enrollments = ref<SessionInscription[]>([])
const pickError = ref<unknown>(null)
const form = reactive<{ session: string; inscription: string; cout: number | undefined }>({ session: '', inscription: '', cout: undefined })

const sessionOptions = computed(() => sessions.value.map((s) => ({ value: s.id, label: `${s.reference} · ${s.program_title ?? ''}` })))
const enrollmentOptions = computed(() => enrollments.value.map((e) => ({ value: e.id, label: `${e.stagiaire} · ${stateLabel(e.statut)}` })))

watch(openVisible, async (v) => {
  if (!v) return
  Object.assign(form, { session: '', inscription: '', cout: undefined })
  pickError.value = null
  enrollments.value = []
  if (sessions.value.length) return
  try {
    sessions.value = await listSessions()
  } catch (e) {
    pickError.value = e
  }
})

async function loadEnrollments() {
  form.inscription = ''
  enrollments.value = []
  const sid = form.session
  if (!sid) return
  try {
    const res = await getSession(sid)
    if (sid === form.session) enrollments.value = res.inscriptions
  } catch (e) {
    pickError.value = e
  }
}

async function openCase() {
  submitting.value = true
  pickError.value = null
  try {
    const c = await openFundingCase(form.inscription, form.cout != null ? String(form.cout) : null)
    openVisible.value = false
    router.push(`/platform/financement/${c.inscription_id}`)
  } catch (e) {
    pickError.value = e
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chip { .gsms-chip(); }
.intro { .gsms-muted(); margin: 0 0 12px; }
</style>
