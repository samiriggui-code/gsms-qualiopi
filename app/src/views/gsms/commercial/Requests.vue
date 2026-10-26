<template>
  <GsmsListPage :title="t('gsms.commercial.demandes.titre')" icon="user-add" :subtitle="t('gsms.commercial.demandes.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/demandes/${r.id}`"
    :empty-title="filtered ? t('gsms.commun.aucunResultat') : t('gsms.commercial.demandes.aucune')"
    :empty-description="filtered ? t('gsms.commun.aucunResultatFiltres') : t('gsms.commercial.demandes.aucuneAide')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="status" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commercial.demandes.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>

    <template #cell-reference="{ row }"><span class="chip">{{ row.reference }}</span></template>
    <template #cell-candidat="{ row }">
      <router-link :to="`/platform/demandes/${row.id}`" class="person" @click.stop>
        <GsmsPersonAvatar :name="fullName(row)" :email="row.email" /><span class="person-name">{{ fullName(row) }}</span>
      </router-link>
    </template>
    <template #cell-formation="{ row }">{{ row.formation.nom || '—' }}</template>
    <template #cell-recue_le="{ row }">{{ fmtDate(row.recue_le) }}</template>
    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /></template>

    <template #card="{ item }">
      <router-link :to="`/platform/demandes/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left person"><GsmsPersonAvatar :name="fullName(item)" :email="item.email" :size="40" /><span class="card-title">{{ fullName(item) }}</span></div>
          <GsmsStatusTag :code="item.statut" :label="item.statut_libelle" />
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="book" size="14px" />{{ item.formation.nom || '—' }}</span>
            <span v-if="item.session_souhaitee"><t-icon name="calendar" size="14px" />{{ item.session_souhaitee }}</span>
            <span><t-icon name="time" size="14px" />{{ item.reference }} · {{ fmtDate(item.recue_le) }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import { listPreinscriptions, type PreinscriptionList, type PreinscriptionRow } from '@/api/gsms/preinscriptions'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const data = ref<PreinscriptionList | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const status = ref(typeof route.query.statut === 'string' ? route.query.statut : 'all')
const query = ref('')
let controller: AbortController | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Filtre par statut et recherche faits par l'API ; les compteurs sont ceux qu'elle renvoie. */
async function load() {
  controller?.abort()
  const ctrl = new AbortController()
  controller = ctrl
  loading.value = true
  error.value = null
  try {
    data.value = await listPreinscriptions({ statut: status.value === 'all' ? undefined : status.value,
      recherche: query.value.trim() || undefined }, ctrl.signal)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return
    error.value = e
    data.value = null
  } finally {
    if (controller === ctrl) loading.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => { controller?.abort(); clearTimeout(timer) })
watch(status, (v) => {
  router.replace({ query: { ...route.query, statut: v === 'all' ? undefined : v } })
  load()
})
watch(query, () => { clearTimeout(timer); timer = setTimeout(load, 300) })

const filtered = computed(() => status.value !== 'all' || !!query.value.trim())
const tabs = computed(() => {
  const counts = data.value?.compteurs ?? {}
  return [
    { value: 'all', label: t('gsms.commun.toutes'), count: data.value ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined },
    ...Object.entries(data.value?.statuts ?? {}).map(([value, label]) => ({ value, label, count: counts[value] })),
  ]
})
const rows = computed(() => data.value?.demandes ?? null)
const fullName = (r: PreinscriptionRow) => [r.prenom, r.nom_usage || r.nom].filter(Boolean).join(' ')

const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.commercial.demandes.colReference'), width: 130 },
  { colKey: 'candidat', title: t('gsms.commercial.demandes.colCandidat') },
  { colKey: 'formation', title: t('gsms.commercial.demandes.colFormation') },
  { colKey: 'financement', title: t('gsms.commercial.demandes.colFinancement'), width: 170 },
  { colKey: 'recue_le', title: t('gsms.commercial.demandes.colRecue'), width: 120 },
  { colKey: 'statut', title: t('gsms.commercial.demandes.colStatut'), width: 190 },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chip { .gsms-chip(); }
.person { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none;
  &:hover .person-name { color: var(--td-brand-color); } }
.person-name { color: var(--td-text-color-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
