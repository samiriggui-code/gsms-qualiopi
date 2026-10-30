<template>
  <GsmsListPage :title="t('gsms.finances.factures.titre')" icon="file" :subtitle="t('gsms.finances.factures.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/factures/${r.id}`"
    :empty-title="filtered ? t('gsms.commun.aucunResultat') : t('gsms.finances.factures.aucune')"
    :empty-description="filtered ? t('gsms.commun.aucunResultatFiltres') : t('gsms.finances.factures.aucuneAide')" @retry="load">
    <template v-if="canWrite" #actions>
      <t-button theme="primary" size="small" @click="createVisible = true"><template #icon><t-icon name="add" /></template>{{ t('gsms.finances.factures.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="statut" :options="statusTabs" :label="t('gsms.commun.filtrerEtat')" />
      <div class="filters">
        <t-select v-model="type" :options="typeOptions" clearable :placeholder="t('gsms.finances.factures.type')" class="type-select" :aria-label="t('gsms.finances.factures.type')" />
        <t-checkbox v-model="retard">{{ t('gsms.finances.factures.enRetardSeulement') }}</t-checkbox>
        <t-input v-model="recherche" class="search" :placeholder="t('gsms.finances.factures.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
          <template #prefix-icon><t-icon name="search" size="16px" /></template>
        </t-input>
      </div>
    </template>

    <template #cell-numero="{ row }">
      <router-link :to="`/platform/factures/${row.id}`" class="cell-link" @click.stop>{{ row.numero || t('gsms.finances.factures.sansNumero') }}</router-link>
    </template>
    <template #cell-client="{ row }">{{ row.client.nom }}</template>
    <template #cell-reste_du_centimes="{ row }"><span class="num">{{ row.type === 'FACTURE' ? centimes(row.reste_du_centimes) : '—' }}</span></template>
    <template #cell-statut="{ row }">
      <span class="tags"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /><GsmsStatusTag v-if="row.en_retard" code="EN_RETARD" /></span>
    </template>

    <template #card="{ item }">
      <router-link :to="`/platform/factures/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.numero || t('gsms.finances.factures.sansNumero') }}</span></div>
          <span class="tags"><GsmsStatusTag :code="item.statut" :label="item.statut_libelle" /><GsmsStatusTag v-if="item.en_retard" code="EN_RETARD" /></span>
        </div>
        <div class="card-content">
          <p class="card-description">{{ item.type_libelle }} · {{ item.client.nom }}</p>
          <p class="sub">{{ item.titre }}</p>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>{{ t('gsms.finances.factures.totalTtc') }} {{ centimes(item.total_ttc_centimes) }}</span>
            <span v-if="item.type === 'FACTURE'">{{ t('gsms.finances.factures.resteDu') }} {{ centimes(item.reste_du_centimes) }}</span>
            <span v-if="item.echeance"><t-icon name="time" size="14px" />{{ fmtDate(item.echeance) }}</span>
          </div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>

  <InvoiceCreateDialog v-model:visible="createVisible" @created="(inv) => router.push(`/platform/factures/${inv.id}`)" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { getInvoiceReferences, listInvoices, type InvoiceReferences, type InvoiceSummary } from '@/api/gsms/invoicing'
import { fmtDate } from '@/components/gsms/format'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import InvoiceCreateDialog from './InvoiceCreateDialog.vue'
import { centimes } from './display'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const canWrite = computed(() => access.can('invoices.write'))

const q = (k: string) => (typeof route.query[k] === 'string' ? String(route.query[k]) : '')
const rows = ref<InvoiceSummary[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const refs = ref<InvoiceReferences | null>(null)
const statut = ref(q('statut') || 'all')
const type = ref<string | undefined>(q('type') === 'FACTURE' || q('type') === 'AVOIR' ? q('type') : undefined)
const retard = ref(q('retard') === '1')
const recherche = ref('')
const createVisible = ref(false)

const filtered = computed(() => statut.value !== 'all' || !!type.value || retard.value || !!recherche.value.trim())
const typeOptions = computed(() => Object.entries(refs.value?.types ?? {}).map(([value, label]) => ({ value, label })))
const statusTabs = computed(() => [{ value: 'all', label: t('gsms.commun.tous') },
  ...Object.entries(refs.value?.statuts ?? {}).map(([value, label]) => ({ value, label }))])
const columns = computed<ListColumn[]>(() => [
  { colKey: 'numero', title: t('gsms.finances.factures.numero'), width: 170 },
  { colKey: 'type_libelle', title: t('gsms.finances.factures.type'), width: 90 },
  { colKey: 'client', title: t('gsms.finances.factures.client'), text: (r: InvoiceSummary) => r.client.nom },
  { colKey: 'titre', title: t('gsms.finances.factures.objet') },
  { colKey: 'emise_le', title: t('gsms.finances.factures.emiseLe'), width: 120, kind: 'relative' },
  { colKey: 'echeance', title: t('gsms.finances.factures.echeance'), width: 120, kind: 'relative' },
  { colKey: 'total_ttc_centimes', title: t('gsms.finances.factures.totalTtc'), width: 130, kind: 'centimes' },
  { colKey: 'reste_du_centimes', title: t('gsms.finances.factures.resteDu'), width: 130, align: 'right',
    text: (r: InvoiceSummary) => (r.type === 'FACTURE' ? centimes(r.reste_du_centimes) : '') },
  { colKey: 'statut', title: t('gsms.finances.factures.statut'), text: (r: InvoiceSummary) => r.statut_libelle },
])

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await listInvoices({
      statut: statut.value === 'all' ? undefined : statut.value, type: type.value as 'FACTURE' | 'AVOIR' | undefined,
      en_retard: retard.value, q: recherche.value.trim() || undefined,
    })
    if (mine === seq) rows.value = res
  } catch (e) {
    if (mine === seq) { error.value = e; rows.value = null }
  } finally {
    if (mine === seq) loading.value = false
  }
}
onMounted(async () => {
  try { refs.value = await getInvoiceReferences() } catch { /* le refus s'affiche par la liste */ }
})
watch([statut, type, retard], load, { immediate: true })
watch(recherche, () => { clearTimeout(timer); timer = setTimeout(load, 300) })
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; flex: 1 1 auto; justify-content: flex-end; min-width: 0; }
.type-select { width: 150px; }
.search { .gsms-search(); margin-left: 0; }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.sub { .gsms-muted(); margin: 2px 0 0; overflow-wrap: anywhere; }
.tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
@media (max-width: 720px) {
  .filters { justify-content: stretch; }
  .type-select { flex: 1 1 140px; }
  .search { flex: 1 1 100%; }
}
</style>
