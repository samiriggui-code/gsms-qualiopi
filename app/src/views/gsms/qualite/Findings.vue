<template>
  <GsmsListPage :title="t('gsms.qualite.constats.titre')" icon="flag" :subtitle="t('gsms.qualite.constats.sousTitre')"
    :items="rows" :loading="current.loading" :error="current.error" :columns="columns" row-key="id"
    :empty-title="emptyTitle" :empty-icon="tab === 'actions' ? 'task' : 'check-circle'" @retry="reload">
    <template #toolbar>
      <GsmsFilterTabs v-model="tab" :options="tabs" :label="t('gsms.commun.vue')" tabs />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <!-- Cellules du tableau (grand écran) -->
    <template #cell-titre="{ row }">
      <span class="cell-title">{{ row.titre }}</span>
      <span v-if="row.sous" class="cell-sub">{{ row.sous }}</span>
    </template>
    <template #cell-statut="{ row }">
      <span class="tags"><t-tag v-if="row.capa?.en_retard" theme="danger" variant="light" size="small">{{ t('gsms.etats.EN_RETARD') }}</t-tag><GsmsStatusTag :code="row.statut" :label="row.statutLibelle" /></span>
    </template>
    <template #cell-actions="{ row }"><span class="row-actions" @click.stop><FindingActions :row="row" /></span></template>

    <!-- Cartes (téléphone) -->
    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span v-if="item.indicateur" class="chip">I{{ item.indicateur }}</span><span class="card-title" :title="item.titre">{{ item.titre }}</span></div>
          <t-tag v-if="item.capa?.en_retard" theme="danger" variant="light" size="small">{{ t('gsms.etats.EN_RETARD') }}</t-tag>
          <GsmsStatusTag :code="item.statut" :label="item.statutLibelle" />
        </div>
        <div class="card-content">
          <p class="card-description">{{ item.texte }}</p>
          <p v-if="item.sous" class="todo">{{ item.sous }}</p>
        </div>
        <div class="card-meta"><span>{{ item.reference }}</span><span v-for="m in item.meta" :key="m">{{ m }}</span></div>
        <div class="card-actions"><FindingActions :row="item" /></div>
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="capaDialog.visible" :title="t('gsms.qualite.constats.ouvrirAction', { ref: capaDialog.ref })"
    :confirm-label="t('gsms.qualite.constats.ouvrir')" :fields="capaFields" :run="(v) => openCapa(capaDialog.id, v as CapaIn)" @done="afterChange" />
  <ActionDialog v-model:visible="stepDialog.visible" :title="stepDialog.title" :fields="stepDialog.fields"
    :danger="stepDialog.action === 'annuler'" :run="(v) => capaStep(stepDialog.id, stepDialog.action, v)" @done="afterChange" />
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref, watch, type PropType } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { capaStep, listCapa, listFindings, listOpenGaps, openCapa, type CapaIn, type CapaRow, type Finding } from '@/api/gsms/qualite'
import { fmtDate } from '@/components/gsms/format'

interface Row {
  id: string
  reference: string
  indicateur: number | null
  titre: string
  texte: string
  sous: string
  statut: string
  statutLibelle?: string
  date: string
  meta: string[]
  gap?: Finding
  capa?: CapaRow
}

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const tab = ref(['ecarts', 'constats', 'actions'].includes(String(route.query.onglet)) ? String(route.query.onglet) : 'ecarts')
const query = ref('')
const actionError = ref<unknown>(null)
const busy = ref('')

function source<T>(load: () => Promise<T>) {
  const s = reactive({ data: null as T | null, error: null as unknown, loading: false })
  const run = async () => {
    s.loading = true
    s.error = null
    try { s.data = (await load()) as never } catch (e) { s.error = e; s.data = null } finally { s.loading = false }
  }
  return { s, run }
}
const gaps = source(listOpenGaps)
const findings = source(listFindings)
const capas = source(listCapa)
gaps.run(); findings.run(); capas.run()
const current = computed(() => (tab.value === 'ecarts' ? gaps.s : tab.value === 'constats' ? findings.s : capas.s))
const reload = () => (tab.value === 'ecarts' ? gaps.run() : tab.value === 'constats' ? findings.run() : capas.run())
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

const tabs = computed(() => [
  { value: 'ecarts', label: t('gsms.qualite.constats.aTraiter'), count: gaps.s.data?.length },
  { value: 'constats', label: t('gsms.qualite.constats.tous'), count: findings.s.data?.length },
  { value: 'actions', label: t('gsms.qualite.constats.actions'), count: capas.s.data?.length },
])
const emptyTitle = computed(() => t(tab.value === 'ecarts' ? 'gsms.qualite.constats.aucunATraiter' : tab.value === 'constats' ? 'gsms.qualite.constats.aucun' : 'gsms.qualite.constats.aucuneAction'))
const originLabel = (o: string) => (te(`gsms.qualite.constats.origines.${o}`) ? t(`gsms.qualite.constats.origines.${o}`) : o)

const allRows = computed<Row[] | null>(() => {
  if (tab.value === 'ecarts') {
    return gaps.s.data?.map((f) => ({
      id: f.id, reference: f.reference, indicateur: f.indicateur, titre: f.titre, texte: f.explication ?? '',
      sous: f.remediation ? t('gsms.qualite.aFaire', { texte: f.remediation }) : '', statut: f.statut, date: fmtDate(f.constate_le),
      meta: [f.gravite ? t('gsms.qualite.constats.gravite', { g: f.gravite }) : '', fmtDate(f.constate_le)].filter(Boolean), gap: f,
    })) ?? null
  }
  if (tab.value === 'constats') {
    return findings.s.data?.map((f) => ({
      id: f.id, reference: f.reference, indicateur: f.indicateur, titre: f.titre, texte: f.explication ?? '',
      sous: f.a_faire ? t('gsms.qualite.aFaire', { texte: f.a_faire }) : '', statut: f.statut, statutLibelle: f.statut_libelle,
      date: fmtDate(f.constate_le), meta: [originLabel(f.origine), f.cible ?? '', fmtDate(f.constate_le)].filter(Boolean),
    })) ?? null
  }
  return capas.s.data?.map((c) => ({
    id: c.id, reference: c.reference, indicateur: c.ecart?.indicateur ?? null, titre: c.titre, texte: c.plan,
    sous: c.ecart ? `${c.ecart.reference} · ${c.ecart.titre}` : '', statut: c.statut, date: fmtDate(c.echeance),
    meta: [t(c.type === 'PREVENTIVE' ? 'gsms.qualite.constats.preventive' : 'gsms.qualite.constats.corrective'), c.responsable,
      t('gsms.qualite.constats.echeanceLe', { date: fmtDate(c.echeance) })], capa: c,
  })) ?? null
})
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return allRows.value?.filter((r) => !q || [r.reference, r.titre, r.texte, ...r.meta].some((v) => v.toLowerCase().includes(q))) ?? null
})

const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.qualite.preuves.colReference'), width: 130 },
  { colKey: 'indicateur', title: 'I', width: 60 },
  { colKey: 'titre', title: t('gsms.qualite.constats.colIntitule') },
  { colKey: 'date', title: t(tab.value === 'actions' ? 'gsms.qualite.constats.colEcheance' : 'gsms.qualite.constats.colConstate'), width: 120 },
  { colKey: 'statut', title: t('gsms.qualite.indicateurs.colEtat'), width: 150 },
  ...(tab.value === 'constats' ? [] : [{ colKey: 'actions', title: '' }]),
])

/** Boutons d'une ligne : ouvrir une action (écart) ou faire avancer l'action (CAPA), selon les décisions de l'API. */
const FindingActions = defineComponent({
  props: { row: { type: Object as PropType<Row>, required: true } },
  setup(props) {
    return () => {
      const r = props.row
      if (r.gap?.ouvrir_action) {
        return h(GsmsActionGate, { decision: r.gap.ouvrir_action, variant: 'outline', onRun: () => openCapaDialog(r.gap!) },
          () => t('gsms.qualite.constats.ouvrir'))
      }
      if (r.capa) {
        const caps = Object.entries(r.capa.capabilities)
        const refused = caps.filter(([, c]) => !c.allowed).map(([, c]) => `${c.libelle ?? ''} (${c.message ?? ''})`)
        return h('div', { class: 'capa' }, [
          h('div', { class: 'capa-buttons' }, caps.filter(([, c]) => c.allowed).map(([name, c]) => h(GsmsActionGate, {
            key: name, decision: c, variant: 'outline', theme: name === 'annuler' ? 'danger' : 'primary',
            pending: busy.value === `${r.id}:${name}`, onRun: () => capaRun(r.capa!, name),
          }))),
          refused.length ? h('p', { class: 'capa-refused' }, t('gsms.qualite.constats.indisponible', { liste: refused.join(' ; ') })) : null,
        ])
      }
      return null
    }
  },
})

const capaDialog = reactive({ visible: false, id: '', ref: '' })
const capaFields = computed<ActionField[]>(() => [
  { name: 'titre', label: t('gsms.qualite.constats.champs.titre') },
  { name: 'type', label: t('gsms.qualite.constats.champs.type'), type: 'radio', initial: 'CORRECTIVE',
    options: [{ value: 'CORRECTIVE', label: t('gsms.qualite.constats.corrective') }, { value: 'PREVENTIVE', label: t('gsms.qualite.constats.preventive') }] },
  { name: 'cause', label: t('gsms.qualite.constats.champs.cause'), type: 'textarea' },
  { name: 'plan', label: t('gsms.qualite.constats.champs.plan'), type: 'textarea' },
  { name: 'responsable', label: t('gsms.qualite.constats.champs.responsable') },
  { name: 'echeance', label: t('gsms.qualite.constats.champs.echeance'), type: 'date' },
])
function openCapaDialog(f: Finding) {
  Object.assign(capaDialog, { visible: true, id: f.id, ref: f.reference })
}

const stepDialog = reactive<{ visible: boolean; id: string; action: string; title: string; fields: ActionField[] }>({ visible: false, id: '', action: '', title: '', fields: [] })
async function capaRun(c: CapaRow, action: string) {
  const cap = c.capabilities[action]
  if (cap?.a_saisir?.length) {
    Object.assign(stepDialog, { visible: true, id: c.id, action, title: cap.libelle ?? action, fields: cap.a_saisir.map((n) => ({ name: n, type: 'textarea' as const })) })
    return
  }
  busy.value = `${c.id}:${action}`
  actionError.value = null
  try {
    await capaStep(c.id, action, {})
    await afterChange()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}
async function afterChange() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await Promise.all([gaps.run(), capas.run(), findings.run()])
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.card { .gsms-card(); }
.card--static { cursor: default; }
.card .card-content { overflow: visible; }
.card .card-description { -webkit-line-clamp: 3; line-clamp: 3; }
.chip { .gsms-chip(); flex-shrink: 0; }
.todo { margin: 4px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-sm); line-height: 18px; }
.card-actions { margin-top: 10px; }
.cell-title { display: block; font-weight: 500; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); }
.tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.row-actions { display: inline-block; cursor: default; }
:deep(.capa-buttons) { display: flex; flex-wrap: wrap; gap: 8px; }
:deep(.capa-refused) { margin: 6px 0 0; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); line-height: 18px; }
</style>
