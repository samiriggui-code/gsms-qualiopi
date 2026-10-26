<template>
  <GsmsListPage :title="t('gsms.bilans.titre')" icon="chart-pie" :subtitle="t('gsms.bilans.sousTitre')"
    :items="items" :loading="loading" :error="error" row-key="code" :empty-title="t('gsms.bilans.aucun')" @retry="load">
    <template #toolbar>
      <GsmsFilterTabs v-model="filter" :options="filterTabs" :label="t('gsms.bilans.filtrer')" />
    </template>
    <template #before><GsmsRefusal v-if="downloadError" :error="downloadError" inline /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ item.intitule }}</span></div>
          <t-tag :theme="item.disponible ? 'success' : 'default'" variant="light" size="small" class="tag">
            {{ item.disponible ? t('gsms.bilans.disponible') : t('gsms.bilans.nonDisponible') }}
          </t-tag>
        </div>
        <div class="card-meta">
          <span><t-icon :name="natureIcon(item.nature)" size="14px" />{{ natureLabel(item.nature) }}</span>
          <span v-if="item.permissions.length">{{ t('gsms.bilans.droits') }}
            <code v-for="p in item.permissions" :key="p" class="chip">{{ p }}</code>
          </span>
          <span v-else>{{ t('gsms.bilans.toutCompte') }}</span>
        </div>
        <div class="card-actions">
          <template v-if="item.disponible">
            <t-button v-if="item.code === 'carnet_impression'" size="small" variant="outline" :loading="downloading" @click="download">
              <template #icon><t-icon name="download" /></template>{{ t('gsms.bilans.telechargerCarnet') }}
            </t-button>
            <router-link v-else-if="pageOf(item.code)" :to="{ name: pageOf(item.code) }" class="open">
              {{ t('gsms.bilans.ouvrir') }}<t-icon name="chevron-right" size="14px" />
            </router-link>
            <span v-else class="muted">{{ t('gsms.bilans.sansEcran') }}</span>
          </template>
          <span v-else class="muted">{{ t('gsms.bilans.droitManquant') }}</span>
        </div>
      </div>
    </template>
  </GsmsListPage>
</template>

<script setup lang="ts">
/**
 * Bilans et rapports (page 3) : inventaire de GET /bilans. L'accès (`disponible`) est décidé par l'API ; un rapport
 * ne mène à un écran que si la page existe dans cette application, sinon on le dit.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { getReports, type ReportEntry } from '@/api/gsms/pilotage'
import { downloadCarnet } from '@/api/gsms/qualite'

const { t, te } = useI18n()
const router = useRouter()

/** Rapport de l'API → page de cette application qui l'affiche. */
const PAGES: Record<string, string> = {
  carnet_qualiopi: 'gsmsCarnet',
  etat_indicateurs: 'gsmsIndicateurs',
  feuille_de_route: 'gsmsPilotage',
  synthese_parcours: 'gsmsParcours',
  evaluations_acquis: 'gsmsEvaluations',
  synthese_documents: 'gsmsDevis',
  aide_bpf: 'gsmsBpf',
}
const pageOf = (code: string) => (PAGES[code] && router.hasRoute(PAGES[code]) ? PAGES[code] : '')

const reports = ref<ReportEntry[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const filter = ref('all')
const downloading = ref(false)
const downloadError = ref<unknown>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    reports.value = (await getReports()).rapports
  } catch (e) {
    error.value = e
    reports.value = null
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filterTabs = computed(() => [
  { value: 'all', label: t('gsms.commun.tous') },
  { value: 'yes', label: t('gsms.bilans.disponibles') },
  { value: 'no', label: t('gsms.bilans.nonDisponibles') },
])
const items = computed(() => reports.value?.filter((r) => filter.value === 'all' || r.disponible === (filter.value === 'yes')) ?? null)

const natureLabel = (n: string) => (te(`gsms.bilans.natures.${n}`) ? t(`gsms.bilans.natures.${n}`) : n)
const natureIcon = (n: string) => (n === 'IMPRESSION' ? 'print' : n === 'AIDE' ? 'help-circle' : 'view-list')

/** Carnet imprimable (HTML A4 rendu par l'API) : enregistré comme fichier, jamais injecté dans la page. */
async function download() {
  downloading.value = true
  downloadError.value = null
  try {
    await downloadCarnet()
    MessagePlugin.success(t('gsms.bilans.carnetTelecharge'))
  } catch (e) {
    downloadError.value = e
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); .card-header { align-items: flex-start; } .card-title { white-space: normal; overflow-wrap: anywhere; } }
.card--static { cursor: default; }
.tag { flex-shrink: 0; }
.chip { .gsms-chip(); margin-left: 4px; font-family: var(--app-font-family-mono); }
.card-actions { display: flex; align-items: center; margin-top: 10px; }
.open {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--td-brand-color);
  font-size: var(--app-text-sm);
  font-weight: 500;
  text-decoration: none;
  &:hover { text-decoration: underline; }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); }
}
.muted { .gsms-muted(); }
</style>
