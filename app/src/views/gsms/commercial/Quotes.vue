<template>
  <GsmsListPage :title="t('gsms.commercial.devis.titre')" icon="file-paste" :subtitle="t('gsms.commercial.devis.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/devis/${r.id}`"
    :empty-title="quotes?.length ? t('gsms.commun.aucunResultat') : t('gsms.commercial.devis.aucun')"
    :empty-description="quotes?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.commercial.devis.aucunAide')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openCreate"><template #icon><t-icon name="add" /></template>{{ t('gsms.commercial.devis.nouveau') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="status" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-reference="{ row }"><span class="chip">{{ row.reference }}</span></template>
    <template #cell-titre="{ row }"><span class="cell-title">{{ row.titre || '—' }}</span></template>
    <template #cell-client="{ row }">{{ row.client?.nom || '—' }}</template>
    <template #cell-valide_jusqu_au="{ row }">
      {{ fmtDate(row.valide_jusqu_au) }} <t-tag v-if="row.expire" theme="danger" variant="light" size="small">{{ t('gsms.commercial.devis.expire') }}</t-tag>
    </template>
    <template #cell-modifie_le="{ row }">{{ fmtDate(row.modifie_le) }}</template>
    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/devis/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="chip">{{ item.reference }}</span></div>
          <GsmsStatusTag :code="item.statut" :label="item.statut_libelle" />
        </div>
        <span class="card-title">{{ item.titre || '—' }}</span>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="city" size="14px" />{{ item.client?.nom || '—' }}</span>
            <span><t-icon name="time" size="14px" />{{ t('gsms.commercial.devis.valideJusquAu', { date: fmtDate(item.valide_jusqu_au) }) }}</span>
            <t-tag v-if="item.expire" theme="danger" variant="light" size="small">{{ t('gsms.commercial.devis.expire') }}</t-tag>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="createVisible" :title="t('gsms.commercial.devis.nouveau')" :confirm-label="t('gsms.commercial.devis.creer')"
    :intro="t('gsms.commercial.devis.nouveauAide')" :fields="createFields" :run="(v) => createEdition(v.client_id, v.titre)" @done="created">
    <GsmsRefusal v-if="clientsError" :error="clientsError" inline />
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { createEdition, getEditionTypes, listEditionClients, listEditions, type EditionClient, type EditionDetail, type EditionRow } from '@/api/gsms/editions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
// Création réservée à `documents.write` (permission de la route POST /editions).
const canWrite = computed(() => access.can('documents.write'))

const quotes = ref<EditionRow[] | null>(null)
const statuses = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref<unknown>(null)
const status = ref(typeof route.query.statut === 'string' ? route.query.statut : 'all')
const query = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const [list, types] = await Promise.all([listEditions({ type: 'DEVIS' }), getEditionTypes()])
    // Seuls les devis sont demandés à l'API (type=DEVIS).
    quotes.value = list
    statuses.value = Array.isArray(types.statuts) ? Object.fromEntries(types.statuts.map((s) => [s, s])) : types.statuts
  } catch (e) {
    error.value = e
    quotes.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); load() })

const tabs = computed(() => {
  const list = quotes.value ?? []
  return [
    { value: 'all', label: t('gsms.commun.tous'), count: list.length },
    ...Object.entries(statuses.value).map(([value, label]) => ({ value, label, count: list.filter((q) => q.statut === value).length })),
  ]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return quotes.value?.filter((r) => (status.value === 'all' || r.statut === status.value)
    && (!q || [r.reference, r.titre, r.client?.nom, r.client?.code].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.commercial.devis.colReference'), width: 160 },
  { colKey: 'titre', title: t('gsms.commercial.devis.colTitre') },
  { colKey: 'client', title: t('gsms.commercial.devis.colClient') },
  { colKey: 'valide_jusqu_au', title: t('gsms.commercial.devis.colValidite'), width: 170 },
  { colKey: 'modifie_le', title: t('gsms.commercial.devis.colModifie'), width: 120 },
  { colKey: 'statut', title: t('gsms.commercial.devis.colStatut'), width: 130 },
])

// Création : client choisi parmi ceux de l'API (adresse incomplète signalée, la validation la réclamera).
const createVisible = ref(false)
const clients = ref<EditionClient[]>([])
const clientsError = ref<unknown>(null)
const createFields = computed<ActionField[]>(() => [
  { name: 'client_id', label: `${t('gsms.commercial.devis.colClient')} *`, type: 'select',
    options: clients.value.map((c) => ({ value: c.id, label: c.adresse_complete ? c.nom : t('gsms.commercial.devis.clientAdresseIncomplete', { nom: c.nom }) })) },
  { name: 'titre', label: t('gsms.commercial.devis.colTitre') },
])
async function openCreate() {
  clientsError.value = null
  createVisible.value = true
  try {
    clients.value = await listEditionClients()
  } catch (e) {
    clientsError.value = e
  }
}
function created(res: unknown) {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  router.push(`/platform/devis/${(res as EditionDetail).id}`)
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); }
.cell-title { display: block; font-weight: 500; }
</style>
