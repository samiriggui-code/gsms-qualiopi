<template>
  <GsmsRecordSheet :title="dossier?.stagiaire || t('gsms.finances.financement.dossier')" icon="wallet" back="/platform/financement"
    :back-label="t('gsms.finances.financement.titre')" :subtitle="dossier?.session || ''"
    :ready="!!dossier || missing" :loading="loading" :error="error" @retry="load">
    <template v-if="dossier" #status><GsmsStatusTag :code="dossier.statut" /></template>
    <template v-if="dossier" #actions>
      <t-button v-if="canWrite" size="small" variant="outline" @click="sourceVisible = true">
        <template #icon><t-icon name="add" /></template>{{ t('gsms.finances.financement.ajouterSource') }}
      </t-button>
    </template>
    <template v-if="dossier || missing" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <!-- Pas encore de dossier pour cette inscription (404 de l'API) -->
    <EmptyState v-if="missing" icon="wallet" :title="t('gsms.finances.financement.pasDeDossier')" :description="t('gsms.finances.financement.pasDeDossierAide')">
      <t-button v-if="canWrite" theme="primary" size="small" :loading="busy === 'ouvrir'" @click="openCase">{{ t('gsms.finances.financement.ouvrir') }}</t-button>
    </EmptyState>

    <template v-if="dossier" #side>
      <section class="side-section">
        <h3>{{ t('gsms.finances.financement.montants') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.finances.financement.cout') }}</dt><dd class="num">{{ euros(dossier.cout) }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.accorde') }}</dt><dd class="num">{{ euros(dossier.accorde) }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.regle') }}</dt><dd class="num">{{ euros(dossier.regle) }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.reste') }}</dt><dd class="num strong">{{ euros(dossier.reste_a_financer) }}</dd></div>
        </dl>
        <p class="muted">{{ t('gsms.finances.financement.statutCalcule') }}</p>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.finances.financement.inscription') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.finances.financement.stagiaire') }}</dt><dd>{{ dossier.stagiaire }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.session') }}</dt><dd>{{ dossier.session }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="dossier">
      <p v-if="!dossier.sources.length" class="panel muted">{{ t('gsms.finances.financement.aucuneSource') }}</p>
      <section v-for="s in dossier.sources" :key="s.id" class="panel source">
        <div class="panel-bar">
          <h3 class="title">{{ s.libelle }}</h3>
          <GsmsStatusTag :code="s.etat" />
        </div>
        <dl class="kv">
          <div><dt>{{ t('gsms.finances.financement.financeur') }}</dt><dd>{{ s.financeur || '—' }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.demande') }}</dt><dd class="num">{{ euros(s.montants.demande) }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.accorde') }}</dt><dd class="num">{{ euros(s.montants.accorde) }}</dd></div>
          <div><dt>{{ t('gsms.finances.financement.regle') }}</dt><dd class="num">{{ euros(s.montants.regle) }}</dd></div>
          <div v-if="s.references.financeur"><dt>{{ t('gsms.saisies.external_ref') }}</dt><dd>{{ s.references.financeur }}</dd></div>
          <div v-if="s.references.facture"><dt>{{ t('gsms.saisies.invoice_ref') }}</dt><dd>{{ s.references.facture }}</dd></div>
          <div v-if="s.payeur?.nom || s.payeur?.type"><dt>{{ t('gsms.finances.financement.payeur') }}</dt><dd>{{ s.payeur?.nom || stateLabel(s.payeur?.type) }}</dd></div>
          <div v-if="s.destinataire_facture"><dt>{{ t('gsms.finances.financement.destinataire') }}</dt><dd>{{ s.destinataire_facture }}</dd></div>
          <div v-if="s.realisation"><dt>{{ t('gsms.finances.financement.realisation') }}</dt>
            <dd>{{ t('gsms.finances.financement.demiJournees', { n: s.realisation.presentes, total: s.realisation.prevues }) }}
              <template v-if="s.realisation.montant_facturable_estime"> · {{ t('gsms.finances.financement.facturableEstime', { montant: euros(s.realisation.montant_facturable_estime) }) }}</template></dd></div>
          <div v-if="s.motif"><dt>{{ t('gsms.saisies.motif') }}</dt><dd>{{ s.motif }}</dd></div>
        </dl>

        <template v-if="s.pieces?.length">
          <h4 class="sub-title">{{ t('gsms.finances.financement.pieces') }}</h4>
          <ul class="pieces">
            <li v-for="p in s.pieces" :key="p.piece"><span>{{ t(`gsms.finances.financement.piecesNoms.${p.piece}`, p.piece) }}</span>
              <span class="muted">{{ p.detail }}</span><GsmsStatusTag :code="p.etat" /></li>
          </ul>
        </template>

        <h4 class="sub-title">{{ t('gsms.finances.financement.circuit') }}</h4>
        <p v-if="!actionsOf(s).length" class="muted">{{ t('gsms.finances.financement.aucuneAction') }}</p>
        <div v-else class="gates">
          <div v-for="[name, d] in actionsOf(s)" :key="name" class="gate-row">
            <GsmsActionGate :decision="d" show-reason :variant="name === 'annuler' || name === 'refuser' ? 'outline' : 'base'"
              :theme="name === 'annuler' || name === 'refuser' ? 'danger' : 'primary'" :pending="busy === `${s.id}:${name}`" @run="runAction(s, name)" />
            <span v-if="d.echeance || d.portail" class="muted">
              <template v-if="d.echeance">{{ t('gsms.finances.financement.aFaireAvant', { date: fmtDate(d.echeance) }) }}</template>
              <template v-if="d.echeance && d.portail"> · </template>
              <template v-if="d.portail">{{ t('gsms.finances.surPortail', { portail: d.portail }) }}</template>
            </span>
          </div>
        </div>
        <div v-if="showInvoicing" class="invoice-link">
          <t-button size="small" variant="text" theme="primary" @click="invoiceSource = s.id">
            <template #icon><t-icon name="file-add" /></template>{{ t('gsms.finances.financement.facturerSource') }}
          </t-button>
        </div>

        <template v-if="s.historique.length">
          <h4 class="sub-title">{{ t('gsms.commun.historique') }}</h4>
          <ul class="timeline">
            <li v-for="(h, i) in s.historique" :key="i">
              <span class="tl-date">{{ fmtDate(h.le) }}</span>
              <span>{{ stateLabel(h.de) }} → {{ stateLabel(h.vers) }}<template v-if="h.portail"> · {{ h.portail }}</template><template v-if="h.note"> · {{ h.note }}</template></span>
              <span class="muted">{{ h.par || '—' }}</span>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="actionVisible" :title="pending?.decision.libelle || ''" :fields="pendingFields"
    :intro="pending?.decision.portail ? t('gsms.finances.financement.actionPortail', { portail: pending.decision.portail }) : ''"
    :run="(v) => applyFundingAction(pending!.source, pending!.action, v)" @done="done" />
  <ActionDialog v-model:visible="sourceVisible" :title="t('gsms.finances.financement.ajouterSource')" :fields="sourceFields"
    :intro="t('gsms.finances.financement.ajouterSourceAide')" :run="(v) => addFundingSource(dossier!.id, v as FundingSourceInput)" @done="done">
    <GsmsRefusal v-if="schemesError" :error="schemesError" inline />
  </ActionDialog>
  <InvoiceCreateDialog :visible="!!invoiceSource" :source-id="invoiceSource" @update:visible="(v) => { if (!v) invoiceSource = '' }"
    @created="(inv) => router.push(`/platform/factures/${inv.id}`)" />
</template>

<script setup lang="ts">
/**
 * Dossier de financement d'une inscription (page 18, fiche). Les actions du circuit sont celles de l'API, avec ses
 * décisions : on montre celles qui sont possibles depuis l'état actuel (autorisées, ou refusées pour une condition
 * à réunir) ; les saisies demandées (`a_saisir`) forment le formulaire.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import {
  addFundingSource, applyFundingAction, getEnrollmentFunding, listFundingSchemes, openFundingCase,
  type FundingCapability, type FundingCase, type FundingScheme, type FundingSource, type FundingSourceInput,
} from '@/api/gsms/funding'
import { ApiError } from '@/api/gsms/http'
import { fmtDate, stateLabel } from '@/components/gsms/format'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import InvoiceCreateDialog from './InvoiceCreateDialog.vue'
import { euros } from './display'

// Refus qui signifient « pas depuis cet état » : l'action n'a pas lieu d'être montrée (décision de l'API, lue telle quelle).
const NOT_NOW = new Set(['INVALID_TRANSITION', 'FUNDING_CLOSED'])
const AMOUNTS = new Set(['amount_granted', 'amount_paid'])

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const enrollmentId = computed(() => String(route.params.enrollmentId || ''))
const canWrite = computed(() => access.can('funding.write'))
const showInvoicing = computed(() => access.hasFeature('invoicing') && access.can('invoices.write'))

const dossier = ref<FundingCase | null>(null)
const missing = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const actionVisible = ref(false)
const pending = ref<{ source: string; action: string; decision: FundingCapability } | null>(null)
const sourceVisible = ref(false)
const schemes = ref<FundingScheme[]>([])
const schemesError = ref<unknown>(null)
const invoiceSource = ref('')

async function load() {
  const asked = enrollmentId.value
  if (!asked) return
  loading.value = true
  error.value = null
  try {
    const res = await getEnrollmentFunding(asked)
    if (asked !== enrollmentId.value) return
    dossier.value = res
    missing.value = false
  } catch (e) {
    if (asked !== enrollmentId.value) return
    dossier.value = null
    missing.value = e instanceof ApiError && e.status === 404
    if (!missing.value) error.value = e
  } finally {
    loading.value = false
  }
}
watch(enrollmentId, () => { actionError.value = null; load() }, { immediate: true })

const actionsOf = (s: FundingSource) =>
  Object.entries(s.capabilities ?? {}).filter(([, d]) => d.allowed || !NOT_NOW.has(d.code ?? ''))

const pendingFields = computed<ActionField[]>(() => [
  ...(pending.value?.decision.a_saisir ?? []).map<ActionField>((name) => ({ name, type: AMOUNTS.has(name) ? 'number' : name === 'motif' ? 'textarea' : 'text' })),
  { name: 'note', label: t('gsms.saisies.note'), type: 'textarea' },
])

function runAction(s: FundingSource, action: string) {
  const decision = s.capabilities?.[action]
  if (!decision) return
  pending.value = { source: s.id, action, decision }
  actionVisible.value = true
}

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}

async function openCase() {
  busy.value = 'ouvrir'
  actionError.value = null
  try {
    dossier.value = await openFundingCase(enrollmentId.value)
    missing.value = false
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

watch(sourceVisible, async (v) => {
  if (!v || schemes.value.length) return
  schemesError.value = null
  try {
    schemes.value = await listFundingSchemes()
  } catch (e) {
    schemesError.value = e
  }
})

const sourceFields = computed<ActionField[]>(() => [
  { name: 'dispositif', label: t('gsms.finances.financement.dispositif'), type: 'select',
    options: schemes.value.map((s) => ({ value: s.code, label: s.libelle })) },
  { name: 'financeur', label: t('gsms.finances.financement.financeur') },
  { name: 'montant_demande', label: t('gsms.finances.financement.montantDemande'), type: 'number' },
  { name: 'signataire', label: t('gsms.saisies.signataire') },
  { name: 'destinataire_facture', label: t('gsms.finances.financement.destinataire') },
  { name: 'payeur', label: t('gsms.finances.financement.payeur') },
])
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.muted { .gsms-muted(); }
.kv { .gsms-kv(); }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 600; }
.sub-title { margin: 14px 0 6px; font-size: var(--app-text-sm); font-weight: 600; color: var(--td-text-color-primary); }
.pieces { list-style: none; margin: 0; padding: 0; li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 4px 0;
  span:first-child { flex: 1 1 140px; } } }
.gates { display: flex; flex-direction: column; gap: 10px; }
.gate-row { display: flex; flex-direction: column; gap: 2px; }
.invoice-link { margin-top: 8px; }
.timeline { .gsms-timeline(); }
</style>
