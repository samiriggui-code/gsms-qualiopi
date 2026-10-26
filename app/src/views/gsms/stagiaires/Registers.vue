<template>
  <GsmsListPage :title="t('gsms.registres.titre')" icon="view-list" :subtitle="t(`gsms.registres.aide.${vue}`)"
    back="/platform/stagiaires" :back-label="t('gsms.stagiaires.titre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" row-key="inscription" :row-to="rowTo"
    :empty-title="register?.lignes.length ? t('gsms.commun.aucunResultat') : t('gsms.registres.vide')"
    :empty-description="register?.lignes.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.registres.videAide')" @retry="load">
    <template #toolbar>
      <t-select :model-value="vue" :options="viewOptions" class="view-select" :aria-label="t('gsms.registres.choisir')"
        @change="(v: unknown) => router.push({ name: 'gsmsParcours', params: { vue: String(v) } })" />
      <GsmsFilterTabs v-if="stateTabs.length > 2" v-model="state" :options="stateTabs" :label="t('gsms.commun.filtrerEtat')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <p v-if="vue === 'certification' && register" class="results">
        <span v-for="(n, code) in register.compteurs" :key="code" class="chip">{{ stateLabel(String(code)) }} : {{ n }}</span>
      </p>
    </template>

    <template #cell-stagiaire="{ row }">
      <span class="person"><GsmsPersonAvatar :name="row.stagiaire" /><span class="person-name">{{ row.stagiaire }}</span></span>
    </template>
    <template #cell-session="{ row }">
      <router-link :to="`/platform/sessions/${row.session.id}`" class="cell-link" @click.stop>{{ row.session.reference }}</router-link>
      <span class="muted block">{{ fmtDate(row.session.debut) }} → {{ fmtDate(row.session.fin) }}</span>
    </template>
    <template #cell-etat="{ row }"><GsmsStatusTag :code="stateOf(row)" /></template>
    <template #cell-detail="{ row }"><span class="muted">{{ detailOf(row) }}</span></template>
    <template #cell-action="{ row }">
      <GsmsActionGate v-if="row.action" :decision="row.action" :pending="busy === row.inscription" @run="run(row)" @click.stop>
        {{ row.action.libelle }}
      </GsmsActionGate>
    </template>

    <template #card="{ item }">
      <div class="card">
        <div class="card-header">
          <router-link :to="rowTo(item)" class="card-header-left person"><GsmsPersonAvatar :name="item.stagiaire" :size="32" /><span class="card-title">{{ item.stagiaire }}</span></router-link>
          <GsmsStatusTag :code="stateOf(item)" />
        </div>
        <div class="card-content"><p class="card-description">{{ detailOf(item) }}</p></div>
        <div class="card-bottom">
          <div class="card-meta">
            <span><t-icon name="calendar-1" size="14px" />{{ item.session.reference }} · {{ fmtDate(item.session.debut) }}</span>
            <span v-if="item.financement"><t-icon name="wallet" size="14px" />{{ item.financement }}</span>
          </div>
          <GsmsActionGate v-if="item.action" :decision="item.action" :pending="busy === item.inscription" @run="run(item)">{{ item.action.libelle }}</GsmsActionGate>
        </div>
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="dialog.visible" :title="dialog.title" :fields="dialog.fields"
    :run="(v) => journeyAction(dialog.enrollment, dialog.action, v)" @done="done" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { getJourneyRegister, journeyAction, JOURNEY_REGISTERS, type JourneyRegister, type RegisterRow } from '@/api/gsms/journey'
import { fmtDate, stateLabel, stepLabel } from '@/components/gsms/format'

const STEP_VIEWS = new Set<string>(JOURNEY_REGISTERS.filter((v) => !['inscriptions', 'abandons', 'certification'].includes(v)))
const NUMBER_FIELDS = new Set(['note'])

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const vue = computed(() => {
  const v = String(route.params.vue || 'inscriptions')
  return (JOURNEY_REGISTERS as readonly string[]).includes(v) ? v : 'inscriptions'
})
const register = ref<JourneyRegister | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const state = ref('all')
const query = ref('')
const dialog = reactive<{ visible: boolean; title: string; action: string; enrollment: string; fields: ActionField[] }>(
  { visible: false, title: '', action: '', enrollment: '', fields: [] })

const viewOptions = computed(() => JOURNEY_REGISTERS.map((v) => ({ value: v, label: t(`gsms.registres.vues.${v}`) })))

/** État affiché d'une ligne, tel que l'API le donne : celui de l'étape, sinon le statut d'inscription. */
const stateOf = (row: RegisterRow): string => row.etape?.etat ?? row.statut
function detailOf(row: RegisterRow): string {
  if (row.etape) {
    const e = row.etape
    if (e.le) return [fmtDate(e.le), e.detail].filter(Boolean).join(' · ')
    return e.detail || (e.echeance ? t('gsms.parcours.echeanceLe', { date: fmtDate(e.echeance) }) : '—')
  }
  if (row.abandon) return [t('gsms.registres.abandonLe', { le: fmtDate(row.abandon.le) }), row.abandon.motif].filter(Boolean).join(' · ')
  if (row.epreuves) {
    return row.epreuves.map((x) => [x.intitule, fmtDate(x.le), x.note ?? null,
      x.reussi === null ? null : t(x.reussi ? 'gsms.registres.reussie' : 'gsms.registres.nonReussie')].filter((v) => v !== null).join(' · ')).join(' ; ')
  }
  if (row.avancement) {
    const a = row.avancement
    const next = a.prochaine ? t('gsms.registres.prochaine', { etape: stepLabel(a.prochaine.etape), etat: stateLabel(a.prochaine.etat) }) : t('gsms.registres.toutFait')
    return `${t('gsms.registres.avancement', { n: a.faits, total: a.applicables })} · ${next}`
  }
  return '—'
}

// Registre « certification » : les compteurs de l'API portent sur le résultat d'examen, pas sur l'état affiché.
const stateTabs = computed(() => {
  if (vue.value === 'certification') return []
  const counts = register.value?.compteurs ?? {}
  return [{ value: 'all', label: t('gsms.commun.tous'), count: register.value?.lignes.length ?? 0 },
    ...Object.entries(counts).map(([code, n]) => ({ value: code, label: stateLabel(code), count: n }))]
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return register.value?.lignes.filter((r) => (state.value === 'all' || stateOf(r) === state.value)
    && (!q || [r.stagiaire, r.session.reference, r.session.intitule, r.entreprise, r.financement].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const columns = computed<ListColumn[]>(() => [
  { colKey: 'stagiaire', title: t('gsms.sessions.stagiaire') },
  { colKey: 'session', title: t('gsms.sessions.session'), width: 190 },
  { colKey: 'etat', title: t('gsms.qualite.indicateurs.colEtat'), width: 130 },
  { colKey: 'detail', title: t('gsms.registres.colDetail') },
  ...(STEP_VIEWS.has(vue.value) ? [{ colKey: 'action', title: '', width: 200 }] : []),
])
const rowTo = (r: RegisterRow) => `/platform/sessions/${r.session.id}/inscriptions/${r.inscription}`

async function load() {
  const v = vue.value
  loading.value = true
  error.value = null
  try {
    const res = await getJourneyRegister(v)
    if (v === vue.value) register.value = res
  } catch (e) {
    if (v === vue.value) { error.value = e; register.value = null }
  } finally {
    loading.value = false
  }
}
watch(vue, () => { state.value = 'all'; actionError.value = null; register.value = null; load() }, { immediate: true })

async function run(row: RegisterRow) {
  const cap = row.action
  if (!cap) return
  const inputs = cap.a_saisir ?? []
  if (inputs.length) {
    Object.assign(dialog, {
      action: cap.cle, enrollment: row.inscription, title: cap.libelle ?? cap.cle, visible: true,
      fields: inputs.map((f) => ({ name: f, type: f === 'date' ? 'date' : NUMBER_FIELDS.has(f) ? 'number' : undefined })),
    })
    return
  }
  busy.value = row.inscription
  actionError.value = null
  try {
    await journeyAction(row.inscription, cap.cle, {})
    await done()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.view-select { width: 240px; max-width: 100%; @media (max-width: 720px) { width: 100%; } }
.card { .gsms-card(); .card-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; } }
.muted { .gsms-muted(); }
.block { display: block; }
.results { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.chip { .gsms-chip(); }
.person { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; text-decoration: none; }
.person-name { color: var(--td-text-color-primary); font-weight: 500; overflow-wrap: anywhere; }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
</style>
