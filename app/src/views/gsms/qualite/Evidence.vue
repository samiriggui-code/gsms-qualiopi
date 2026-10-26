<template>
  <GsmsListPage :title="t('gsms.qualite.preuves.titre')" icon="file-safety" :subtitle="t('gsms.qualite.preuves.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :row-to="(r) => `/platform/qualite/preuves/${r.id}`"
    :empty-title="t('gsms.qualite.preuves.aucune')" :empty-description="t('gsms.commun.aucunResultatFiltres')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="statut" :options="statusTabs" :label="t('gsms.commun.filtrerEtat')" />
      <div class="filters">
        <t-select v-model="type" :options="typeOptions" clearable :placeholder="t('gsms.qualite.preuves.type')" class="type-select" :aria-label="t('gsms.qualite.preuves.type')" />
        <t-input-number v-model="indicateur" theme="normal" :min="1" :max="40" :placeholder="t('gsms.qualite.preuves.indicateur')" class="ind-input" :aria-label="t('gsms.qualite.preuves.indicateur')" />
        <t-input v-model="recherche" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
          <template #prefix-icon><t-icon name="search" size="16px" /></template>
        </t-input>
      </div>
    </template>
    <template #before>
      <p v-if="data && data.total > data.affichees" class="muted">{{ t('gsms.qualite.preuves.tronque', { n: data.affichees, total: data.total }) }}</p>
    </template>

    <template #cell-statut="{ row }"><GsmsStatusTag :code="row.statut" :label="row.statut_libelle" /></template>
    <template #cell-produite_le="{ row }">{{ fmtDate(row.produite_le) }}</template>
    <template #cell-indicateurs="{ row }"><span class="chips"><span v-for="n in row.indicateurs" :key="n" class="chip">ind. {{ n }}</span></span></template>

    <template #card="{ item }">
      <router-link :to="`/platform/qualite/preuves/${item.id}`" class="card">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title" :title="item.libelle">{{ item.libelle }}</span></div>
          <GsmsStatusTag :code="item.statut" :label="item.statut_libelle" />
        </div>
        <div class="card-content">
          <p class="card-description">{{ item.type_libelle }}<template v-if="item.cible"> · {{ item.cible }}</template></p>
          <p v-if="item.problemes.length" class="problems">{{ item.problemes.join(' · ') }}</p>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>{{ item.reference }}</span>
            <span v-if="item.produite_le"><t-icon name="time" size="14px" />{{ fmtDate(item.produite_le) }}</span>
          </div>
          <div class="chips"><span v-for="n in item.indicateurs" :key="n" class="chip">ind. {{ n }}</span></div>
        </div>
      </router-link>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import { listEvidence, type EvidenceList } from '@/api/gsms/qualite'
import { fmtDate } from '@/components/gsms/format'

const { t } = useI18n()
const data = ref<EvidenceList | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const route = useRoute()
const statut = ref(typeof route.query.statut === 'string' ? route.query.statut : '')
const type = ref<string | undefined>(undefined)
const indicateur = ref<number | undefined>(undefined)
const recherche = ref('')
const types = ref<{ type: string; libelle: string }[]>([])

const typeOptions = computed(() => types.value.map((x) => ({ value: x.type, label: x.libelle })))
const totalAll = computed(() => (data.value?.par_statut ?? []).reduce((n, s) => n + s.nombre, 0))
const statusTabs = computed(() => [{ value: '', label: t('gsms.commun.toutes'), count: totalAll.value },
  ...(data.value?.par_statut ?? []).map((s) => ({ value: s.statut, label: s.libelle, count: s.nombre }))])
const rows = computed(() => data.value?.preuves ?? null)
const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.qualite.preuves.colReference'), width: 120 },
  { colKey: 'libelle', title: t('gsms.qualite.preuves.colLibelle'), link: true },
  { colKey: 'type_libelle', title: t('gsms.qualite.preuves.type') },
  { colKey: 'cible', title: t('gsms.qualite.preuves.concerne') },
  { colKey: 'statut', title: t('gsms.qualite.indicateurs.colEtat') },
  { colKey: 'produite_le', title: t('gsms.qualite.preuves.produiteLe'), width: 120 },
  { colKey: 'indicateurs', title: t('gsms.qualite.kpi.indicateurs') },
])

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  error.value = null
  try {
    const res = await listEvidence({
      statut: statut.value || undefined, type: type.value || undefined,
      indicateur: indicateur.value ?? null, recherche: recherche.value.trim() || undefined,
    })
    if (mine !== seq) return
    data.value = res
    if (res.types.length >= types.value.length) types.value = res.types
  } catch (e) {
    if (mine !== seq) return
    error.value = e
    data.value = null
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([statut, type, indicateur], load, { immediate: true })
watch(recherche, () => { clearTimeout(timer); timer = setTimeout(load, 300) })
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.filters { display: flex; flex-wrap: wrap; gap: 8px; flex: 1 1 auto; justify-content: flex-end; min-width: 0; }
.type-select { width: 220px; max-width: 100%; }
.ind-input { width: 130px; }
.search { .gsms-search(); margin-left: 0; }
.card { .gsms-card(); text-decoration: none; color: inherit; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { .gsms-chip(); }
.muted { .gsms-muted(); margin: 0 0 8px; }
.problems { margin: 4px 0 0; color: var(--td-warning-color); font-size: var(--app-text-xs); line-height: 16px; }
@media (max-width: 720px) {
  .filters { justify-content: stretch; }
  .type-select { flex: 1 1 100%; width: 100%; }
  .ind-input { flex: 1 1 120px; }
  .search { flex: 1 1 100%; }
}
</style>
