<template>
  <GsmsListPage :title="t('gsms.communication.messages.titre')" icon="mail" :subtitle="t('gsms.communication.messages.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns" :empty-title="t('gsms.communication.messages.aucun')"
    :empty-description="t('gsms.communication.messages.aucunAide')" @retry="load">
    <template v-if="!error" #actions>
      <t-button size="small" variant="outline" :loading="busy === 'planifier'" @click="confirmPlanner">
        <template #icon><t-icon name="play-circle" /></template>{{ t('gsms.communication.messages.planifier') }}
      </t-button>
    </template>
    <template v-if="!error" #toolbar>
      <GsmsFilterTabs v-model="status" :options="tabs" :label="t('gsms.commun.filtrerEtat')" />
    </template>
    <template v-if="!error" #before>
      <p class="notice"><t-icon name="info-circle" size="14px" />{{ t('gsms.communication.messages.parDefaut') }}</p>
      <p v-if="data && data.envoi.etat !== 'OK'" class="notice notice--warn" role="status">
        <t-icon name="error-circle" size="14px" />
        <span>{{ t(`gsms.communication.envoi.${data.envoi.etat === 'EN_PANNE' ? 'enPanne' : 'aVerifier'}`) }}
          <template v-if="data.envoi.motif"> : {{ data.envoi.motif }}</template>
          <template v-if="data.envoi.dernier_envoi"> · {{ t('gsms.communication.envoi.dernier', { le: fmtDateTime(data.envoi.dernier_envoi) }) }}</template>
        </span>
      </p>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
    </template>

    <template #cell-reference="{ row }"><span class="chip">{{ row.reference }}</span></template>
    <template #cell-objet="{ row }">
      <button type="button" class="open" @click.stop="open(row)">
        <span class="cell-title">{{ row.objet }}</span>
        <span class="cell-sub">{{ ruleLabel(row.regle) }}</span>
      </button>
    </template>
    <template #cell-destinataire="{ row }">
      <span class="cell-title">{{ row.destinataire.nom || '—' }}</span>
      <span class="cell-sub">{{ recipientLabel(row.destinataire.type) }}<template v-if="row.destinataire.email"> · {{ row.destinataire.email }}</template></span>
    </template>
    <template #cell-prevu_le="{ row }">{{ fmtDate(row.prevu_le) }}</template>
    <template #cell-statut="{ row }">
      <GsmsStatusTag :code="row.statut" :label="statusLabel(row.statut)" />
      <span v-if="row.motif_annulation" class="cell-sub reason">{{ row.motif_annulation }}</span>
    </template>
    <template #cell-actions="{ row }"><MessageActions :row="row" :busy="busy" @act="act" /></template>

    <template #card="{ item }">
      <div class="card" @click="open(item)">
        <div class="card-header">
          <button type="button" class="open card-title" @click.stop="open(item)">{{ item.objet }}</button>
          <GsmsStatusTag :code="item.statut" :label="statusLabel(item.statut)" />
        </div>
        <div class="card-meta">
          <span><t-icon name="user" size="14px" />{{ item.destinataire.nom || '—' }} · {{ recipientLabel(item.destinataire.type) }}</span>
          <span><t-icon name="calendar" size="14px" />{{ fmtDate(item.prevu_le) }} · {{ item.reference }}</span>
          <span v-if="item.motif_annulation" class="reason">{{ item.motif_annulation }}</span>
        </div>
        <MessageActions :row="item" :busy="busy" class="card-actions" @act="act" />
      </div>
    </template>
  </GsmsListPage>

  <t-drawer v-model:visible="drawerVisible" :header="selected?.reference || ''" size="min(560px, 100vw)" attach="body" :footer="false" :close-btn="true" destroy-on-close>
    <div v-if="selected" class="drawer">
      <div class="drawer-head">
        <h3>{{ selected.objet }}</h3>
        <GsmsStatusTag :code="selected.statut" :label="statusLabel(selected.statut)" />
      </div>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <MessageActions :row="selected" :busy="busy" @act="act" />
      <dl class="kv">
        <div><dt>{{ t('gsms.communication.messages.destinataire') }}</dt>
          <dd>{{ selected.destinataire.nom || '—' }}<br><span class="cell-sub">{{ recipientLabel(selected.destinataire.type) }}<template v-if="selected.destinataire.email"> · {{ selected.destinataire.email }}</template></span></dd></div>
        <div><dt>{{ t('gsms.communication.messages.regle') }}</dt><dd>{{ ruleLabel(selected.regle) }}</dd></div>
        <div><dt>{{ t('gsms.communication.messages.modele') }}</dt><dd>{{ t('gsms.communication.messages.modeleVersion', { modele: selected.modele, version: selected.version_modele }) }}</dd></div>
        <div><dt>{{ t('gsms.communication.messages.envoi') }}</dt><dd>{{ t(selected.externe ? 'gsms.communication.messages.externe' : 'gsms.communication.messages.interne') }}</dd></div>
        <div><dt>{{ t('gsms.communication.messages.prevuLe') }}</dt><dd>{{ fmtDate(selected.prevu_le) }}</dd></div>
        <div><dt>{{ t('gsms.communication.messages.creeLe') }}</dt><dd>{{ fmtDateTime(selected.cree_le) }}</dd></div>
        <div v-if="selected.valide_par"><dt>{{ t('gsms.communication.messages.validePar') }}</dt><dd>{{ selected.valide_par }} · {{ fmtDateTime(selected.valide_le) }}</dd></div>
        <div v-if="selected.envoye_le"><dt>{{ t('gsms.communication.messages.envoyeLe') }}</dt><dd>{{ fmtDateTime(selected.envoye_le) }}</dd></div>
        <div><dt>{{ t('gsms.communication.messages.tentatives') }}</dt><dd>{{ selected.tentatives }}</dd></div>
        <div v-if="selected.session_id"><dt>{{ t('gsms.communication.messages.concerne') }}</dt>
          <dd><router-link :to="subjectLink(selected)" class="link">{{ t(selected.inscription_id ? 'gsms.communication.messages.voirInscription' : 'gsms.communication.messages.voirSession') }}</router-link></dd></div>
      </dl>
      <div v-if="selected.indicateurs.length" class="chips">
        <span class="cell-sub">{{ t('gsms.communication.messages.indicateurs') }}</span>
        <router-link v-for="n in selected.indicateurs" :key="n" :to="`/platform/qualite/indicateurs/${n}`" class="chip chip--link">ind. {{ n }}</router-link>
      </div>
      <p v-if="selected.erreur" class="notice notice--warn"><t-icon name="error-circle" size="14px" />{{ selected.erreur }}</p>
      <p v-if="selected.motif_annulation" class="notice"><t-icon name="info-circle" size="14px" />{{ t('gsms.communication.messages.motif', { motif: selected.motif_annulation }) }}</p>

      <section class="block">
        <div class="block-bar">
          <h3>{{ t('gsms.communication.messages.contenu') }}</h3>
          <t-button size="small" variant="outline" :loading="busy === 'apercu'" @click="preview(selected)">
            <template #icon><t-icon name="download" /></template>{{ t('gsms.communication.messages.apercu') }}
          </t-button>
        </div>
        <p class="cell-sub">{{ t('gsms.communication.messages.apercuAide') }}</p>
        <t-skeleton v-if="detailLoading" animation="gradient" :row-col="[{ width: '100%' }, { width: '90%' }, { width: '70%' }]" />
        <GsmsRefusal v-else-if="detailError" :error="detailError" inline />
        <pre v-else-if="detail" class="body">{{ detail.texte }}</pre>
      </section>
      <p v-if="selected.empreinte" class="cell-sub hash">{{ t('gsms.communication.messages.empreinte', { sha: selected.empreinte }) }}</p>
    </div>
  </t-drawer>

  <ActionDialog v-model:visible="cancelVisible" :title="cancelTitle" :intro="t('gsms.communication.messages.annulerAide')"
    :fields="[{ name: 'motif', label: t('gsms.communication.messages.motifLabel'), type: 'textarea' }]"
    :confirm-label="cancelTitle" danger :consequence="t('gsms.communication.messages.annulerAide')" :run="(v) => cancelMessage(target!.id, String(v.motif ?? ''))" @done="done" />
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button as TButton, MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import {
  cancelMessage, downloadMessagePreview, getMessage, listMessages, listRelanceRules, retryMessage, runPlanner, validateMessage,
  type MessageDetail, type MessageList, type MessageRow, type RelanceRule,
} from '@/api/gsms/relances'
import { fmtDate, fmtDateTime, toRefusal } from '@/components/gsms/format'

type Action = 'valider' | 'rejeter' | 'annuler' | 'renvoyer'

/** Ordre des onglets : statuts de app/types/relances.py (MESSAGE_STATUSES), « à valider » d'abord. */
const STATUSES = ['A_VALIDER', 'PREVU', 'ENVOYE', 'ECHEC', 'ANNULE', 'SANS_ADRESSE']

/**
 * Actions proposées selon le statut renvoyé par l'API, telles que ses routes les documentent (valider : à valider ;
 * annuler : pas encore envoyé ; renvoyer : en échec). L'API n'expose pas de capacités par message : elle reste seule juge
 * et son refus (409, détail) s'affiche en clair si le message a changé entre-temps.
 */
const ACTIONS: Record<string, Action[]> = {
  A_VALIDER: ['valider', 'rejeter'],
  PREVU: ['annuler'],
  ECHEC: ['renvoyer', 'annuler'],
}

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()

const data = ref<MessageList | null>(null)
const rules = ref<RelanceRule[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const initial = typeof route.query.statut === 'string' ? route.query.statut : 'A_VALIDER'
const status = ref(initial === 'all' || STATUSES.includes(initial) ? initial : 'A_VALIDER')
let controller: AbortController | null = null

async function load() {
  controller?.abort()
  const ctrl = new AbortController()
  controller = ctrl
  loading.value = true
  error.value = null
  try {
    data.value = await listMessages({ statut: status.value === 'all' ? undefined : status.value }, ctrl.signal)
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return
    error.value = e
    data.value = null
  } finally {
    if (controller === ctrl) loading.value = false
  }
}
async function loadRules() {
  try {
    rules.value = await listRelanceRules()
  } catch {
    // Libellés des règles seulement : sans eux, la clé de la règle s'affiche ; le refus éventuel est celui de la liste.
    rules.value = []
  }
}
onMounted(() => { load(); loadRules() })
onBeforeUnmount(() => controller?.abort())
watch(status, (v) => {
  router.replace({ query: { ...route.query, statut: v === 'A_VALIDER' ? undefined : v } })
  actionError.value = null
  load()
})

const rows = computed(() => data.value?.messages ?? null)
const tabs = computed(() => {
  const counts = data.value?.compteurs ?? {}
  return [
    ...STATUSES.map((value) => ({ value, label: statusLabel(value), count: data.value ? counts[value] ?? 0 : undefined })),
    { value: 'all', label: t('gsms.commun.tous'), count: data.value ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined },
  ]
})
const ruleNames = computed(() => new Map(rules.value.map((r) => [r.cle, r.libelle])))
const ruleLabel = (key: string) => ruleNames.value.get(key) ?? key
const statusLabel = (code: string) => (te(`gsms.communication.statuts.${code}`) ? t(`gsms.communication.statuts.${code}`) : code)
const recipientLabel = (code: string) => (te(`gsms.communication.destinataires.${code}`) ? t(`gsms.communication.destinataires.${code}`) : code)
const subjectLink = (m: MessageRow) =>
  m.inscription_id ? `/platform/sessions/${m.session_id}/inscriptions/${m.inscription_id}` : `/platform/sessions/${m.session_id}`

const columns = computed<ListColumn[]>(() => [
  { colKey: 'reference', title: t('gsms.communication.messages.colReference'), width: 120 },
  { colKey: 'objet', title: t('gsms.communication.messages.colObjet') },
  { colKey: 'destinataire', title: t('gsms.communication.messages.colDestinataire') },
  { colKey: 'prevu_le', title: t('gsms.communication.messages.colPrevu'), width: 110 },
  { colKey: 'statut', title: t('gsms.communication.messages.colStatut'), width: 170 },
  { colKey: 'actions', title: '', width: 190 },
])

// ── Fiche du message (tiroir) ──
const drawerVisible = ref(false)
const selected = ref<MessageRow | null>(null)
const detail = ref<MessageDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref<unknown>(null)

let detailSeq = 0
async function open(row: MessageRow) {
  const n = ++detailSeq
  selected.value = row
  drawerVisible.value = true
  actionError.value = null
  detail.value = null
  detailError.value = null
  detailLoading.value = true
  try {
    // Seule la dernière fiche ouverte compte : une réponse plus ancienne arrivée après est ignorée.
    const result = await getMessage(row.id)
    if (n !== detailSeq) return
    detail.value = result
    if (selected.value?.id === row.id) selected.value = result
  } catch (e) {
    if (n === detailSeq) detailError.value = e
  } finally {
    if (n === detailSeq) detailLoading.value = false
  }
}

async function preview(m: MessageRow) {
  busy.value = 'apercu'
  try {
    await downloadMessagePreview(m.id, m.reference)
  } catch (e) {
    MessagePlugin.error(toRefusal(e).message)
  } finally {
    busy.value = ''
  }
}

// ── Actions ──
const cancelVisible = ref(false)
const target = ref<MessageRow | null>(null)
const cancelTitle = computed(() => t(target.value?.statut === 'A_VALIDER' ? 'gsms.communication.messages.rejeter' : 'gsms.communication.messages.annuler'))

function act(action: Action, row: MessageRow) {
  actionError.value = null
  target.value = row
  if (action === 'rejeter' || action === 'annuler') {
    cancelVisible.value = true
    return
  }
  const isValidation = action === 'valider'
  void confirmCritical({
    title: t(isValidation ? 'gsms.communication.messages.validerTitre' : 'gsms.communication.messages.renvoyerTitre', { ref: row.reference }),
    consequence: t(isValidation ? 'gsms.communication.messages.validerAide' : 'gsms.communication.messages.renvoyerAide'),
    confirmLabel: t(`gsms.communication.messages.${action}`),
    run: () => (isValidation ? validateMessage(row.id) : retryMessage(row.id)),
  }).then((updated) => { if (updated) done(updated) })
}

/** Le message renvoyé par l'API remplace la ligne affichée ; la liste est relue pour les compteurs. */
function done(updated: unknown) {
  const m = updated as MessageRow
  if (selected.value?.id === m.id) selected.value = { ...selected.value, ...m }
  MessagePlugin.success(t('gsms.communication.messages.fait', { ref: m.reference, statut: statusLabel(m.statut) }))
  load()
}

async function confirmPlanner() {
  actionError.value = null
  const r = await confirmCritical<Awaited<ReturnType<typeof runPlanner>>>({
    title: t('gsms.communication.messages.planifierTitre'), consequence: t('gsms.communication.messages.planifierAide'),
    confirmLabel: t('gsms.communication.messages.planifier'), run: () => runPlanner(),
  })
  if (!r) return
  MessagePlugin.success(r.inactif ? t('gsms.communication.messages.planifierInactif')
    : t('gsms.communication.messages.planifierFait', { crees: r.crees ?? 0, envoyes: r.envoyes ?? 0, annules: r.annules ?? 0, echecs: r.echecs ?? 0 }))
  load()
}

/** Boutons d'un message (ligne du tableau, carte ou tiroir). */
const MessageActions = defineComponent({
  props: { row: { type: Object as PropType<MessageRow>, required: true }, busy: { type: String, default: '' } },
  emits: { act: (_a: Action, _r: MessageRow) => true },
  setup(props, { emit }) {
    return () => {
      const actions = ACTIONS[props.row.statut] ?? []
      if (!actions.length) return null
      return h('div', { class: 'msg-actions', onClick: (e: Event) => e.stopPropagation() }, actions.map((a) => h(TButton, {
        size: 'small', variant: a === 'valider' ? 'base' : 'outline', theme: a === 'rejeter' || a === 'annuler' ? 'danger' : 'primary',
        loading: props.busy === `${a}:${props.row.id}`, onClick: () => emit('act', a, props.row),
      }, () => t(`gsms.communication.messages.${a}`))))
    }
  },
})
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.card { .gsms-card(); cursor: pointer; }
.card .card-title { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: normal; font-weight: 600; }
.card-actions { margin-top: 10px; }
.chip { .gsms-chip(); }
.chip--link { text-decoration: none; &:hover { color: var(--td-brand-color); } }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.notice { .gsms-notice(); }
.notice--warn { background: var(--td-warning-color-light); .t-icon { color: var(--td-warning-color); } }
.open { display: flex; flex-direction: column; align-items: flex-start; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
  &:hover .cell-title { color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; border-radius: var(--app-radius-xs); } }
.cell-title { display: block; font-weight: 500; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.cell-sub { display: block; color: var(--td-text-color-secondary); font-size: var(--app-text-sm); overflow-wrap: break-word; }
.reason { margin-top: 4px; }
:deep(.msg-actions) { display: flex; flex-wrap: wrap; gap: 6px; }
.link { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
.drawer { display: flex; flex-direction: column; gap: 14px; }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  h3 { margin: 0; font-size: var(--app-text-lg); font-weight: 600; line-height: 22px; overflow-wrap: anywhere; } }
.kv { .gsms-kv(); }
.block h3 { .gsms-panel-title(); margin: 0; }
.block-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.body { margin: 8px 0 0; padding: 12px; max-height: 50vh; overflow: auto; border: 1px solid var(--td-component-stroke); border-radius: var(--app-radius-sm);
  background: var(--td-bg-color-secondarycontainer); font: inherit; font-size: var(--app-text-sm); line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
.hash { font-family: var(--app-font-family-mono); font-size: var(--app-text-xs); }
</style>
