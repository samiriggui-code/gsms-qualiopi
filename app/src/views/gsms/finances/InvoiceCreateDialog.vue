<template>
  <t-dialog :visible="visible" :header="t('gsms.finances.factures.nouvelle')" attach="body" destroy-on-close
    width="min(600px, calc(100vw - 32px))" :close-on-overlay-click="!submitting"
    :confirm-btn="{ content: t('gsms.finances.factures.creerBrouillon'), loading: submitting }" :cancel-btn="{ content: t('gsms.commun.annuler') }"
    @confirm="submit" @close="close" @cancel="close">
    <p class="intro">{{ t('gsms.finances.factures.nouvelleAide') }}</p>
    <GsmsRefusal v-if="error" :error="error" inline />
    <GsmsRefusal v-else-if="listError" :error="listError" inline />
    <t-form label-align="top" @submit.prevent>
      <t-form-item :label="t('gsms.finances.factures.origine')">
        <t-radio-group v-model="form.origine" class="radios">
          <t-radio v-for="o in ORIGINS" :key="o" :value="o">{{ t(`gsms.finances.factures.origines.${o}`) }}</t-radio>
        </t-radio-group>
      </t-form-item>

      <!-- Devis validé : le client est l'entreprise du devis -->
      <t-form-item v-if="form.origine === 'devis'" :label="t('gsms.finances.factures.devis')">
        <t-select v-model="form.devis" :options="quoteOptions" filterable clearable :loading="lists.loading" />
      </t-form-item>

      <t-form-item v-if="form.origine === 'financement'" :label="t('gsms.finances.factures.source')">
        <t-select v-model="form.source" :options="sourceOptions" filterable clearable :loading="lists.loading" />
      </t-form-item>

      <template v-if="form.origine === 'session'">
        <t-form-item :label="t('gsms.finances.financement.session')">
          <t-select v-model="form.session" :options="sessionOptions" filterable clearable @change="loadEnrollments" />
        </t-form-item>
        <t-form-item v-if="enrollments.length" :label="t('gsms.finances.factures.inscriptions')" :help="t('gsms.finances.factures.inscriptionsAide')">
          <t-checkbox-group v-model="form.inscriptions" class="checks">
            <t-checkbox v-for="e in enrollments" :key="e.id" :value="e.id">{{ e.stagiaire }} · {{ stateLabel(e.statut) }}</t-checkbox>
          </t-checkbox-group>
        </t-form-item>
      </template>

      <template v-if="form.origine !== 'devis'">
        <t-form-item :label="t('gsms.finances.factures.clientType')">
          <t-radio-group v-model="form.client" class="radios">
            <t-radio v-for="(label, code) in clientKinds" :key="code" :value="code">{{ label }}</t-radio>
          </t-radio-group>
        </t-form-item>
        <t-form-item v-if="form.client === 'ENTREPRISE'" :label="t('gsms.finances.factures.entreprise')">
          <t-select v-model="form.entreprise" :options="companyOptions" filterable clearable :loading="lists.loading" />
        </t-form-item>
        <t-form-item v-else-if="form.client === 'STAGIAIRE'" :label="t('gsms.finances.financement.stagiaire')">
          <t-select v-model="form.stagiaire" :options="learnerOptions" filterable clearable :loading="lists.loading" />
        </t-form-item>
        <template v-else>
          <t-form-item :label="t('gsms.finances.factures.financeurNom')" :help="form.origine === 'financement' ? t('gsms.finances.factures.financeurNomAide') : undefined">
            <t-input v-model="form.financeur.nom" />
          </t-form-item>
          <t-form-item :label="t('gsms.finances.factures.adresse')"><t-input v-model="form.financeur.adresse" /></t-form-item>
          <div class="pair">
            <t-form-item :label="t('gsms.finances.factures.codePostal')"><t-input v-model="form.financeur.code_postal" /></t-form-item>
            <t-form-item :label="t('gsms.finances.factures.ville')"><t-input v-model="form.financeur.ville" /></t-form-item>
          </div>
          <t-form-item :label="t('gsms.finances.factures.siret')"><t-input v-model="form.financeur.siret" /></t-form-item>
        </template>
      </template>

      <t-form-item :label="t('gsms.finances.factures.titreFacultatif')"><t-input v-model="form.titre" /></t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
/**
 * Création d'un brouillon de facture : depuis un devis validé, des inscriptions d'une session, une source de
 * financement, ou sans origine (lignes saisies ensuite). Les listes viennent de l'API ; l'API vérifie tout
 * (devis non validé, autre client, inscription hors session…) et son refus s'affiche tel quel.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { createInvoice, getInvoiceReferences, type InvoiceCreate, type InvoiceDetail } from '@/api/gsms/invoicing'
import { listEditionClients, listEditions, type EditionRow } from '@/api/gsms/editions'
import { listFundingCases, type FundingCase } from '@/api/gsms/funding'
import { getSession, listLearners, listSessions, type LearnerRow, type SessionInscription, type SessionRow } from '@/api/gsms/sessions'
import { stateLabel } from '@/components/gsms/format'

type Origin = 'devis' | 'session' | 'financement' | 'aucune'
type ClientKind = InvoiceCreate['client_type']
const ORIGINS: Origin[] = ['devis', 'session', 'financement', 'aucune']

const props = withDefaults(defineProps<{ visible: boolean; sourceId?: string }>(), { sourceId: '' })
const emit = defineEmits<{ 'update:visible': [boolean]; created: [InvoiceDetail] }>()
const { t } = useI18n()

const blank = () => ({
  origine: 'devis' as Origin, devis: '', source: '', session: '', inscriptions: [] as string[], client: 'ENTREPRISE' as ClientKind,
  entreprise: '', stagiaire: '', titre: '', financeur: { nom: '', adresse: '', code_postal: '', ville: '', siret: '' },
})
const form = reactive(blank())
const error = ref<unknown>(null)
const submitting = ref(false)
const enrollments = ref<SessionInscription[]>([])

// Listes chargées une fois à l'ouverture ; chacune peut être refusée (module ou droit) sans bloquer les autres.
const lists = reactive({
  loading: false, loaded: false,
  quotes: [] as EditionRow[], companies: [] as { id: string; nom: string }[], learners: [] as LearnerRow[],
  sessions: [] as SessionRow[], cases: [] as FundingCase[], clientKinds: {} as Record<string, string>,
})

const listErrors = reactive<Record<string, unknown>>({})
// Seul le refus de la liste utile au choix en cours s'affiche (le module financement peut être éteint, par exemple).
const listError = computed(() => {
  const keys = ['refs', form.origine === 'devis' ? 'quotes' : form.origine === 'session' ? 'sessions' : form.origine === 'financement' ? 'cases' : '',
    form.origine !== 'devis' && form.client === 'ENTREPRISE' ? 'companies' : form.origine !== 'devis' && form.client === 'STAGIAIRE' ? 'learners' : '']
  return keys.map((k) => listErrors[k]).find(Boolean) ?? null
})

async function loadLists() {
  if (lists.loaded || lists.loading) return
  lists.loading = true
  for (const k of Object.keys(listErrors)) delete listErrors[k]
  const settle = async <T,>(key: string, p: Promise<T>, fallback: T) => {
    try { return await p } catch (e) { listErrors[key] = e; return fallback }
  }
  const [refs, quotes, companies, learners, sessions, cases] = await Promise.all([
    settle('refs', getInvoiceReferences(), null), settle('quotes', listEditions(), []), settle('companies', listEditionClients(), []),
    settle('learners', listLearners(), []), settle('sessions', listSessions(), []), settle('cases', listFundingCases(), []),
  ])
  Object.assign(lists, { quotes: quotes.filter((q) => q.type === 'DEVIS'), companies, learners, sessions, cases,
    clientKinds: refs?.clients ?? {}, loading: false, loaded: Object.keys(listErrors).length === 0 })
}

watch(() => props.visible, (v) => {
  if (!v) return
  Object.assign(form, blank())
  error.value = null
  enrollments.value = []
  if (props.sourceId) Object.assign(form, { origine: 'financement', source: props.sourceId, client: 'FINANCEUR' })
  void loadLists()
}, { immediate: true })

// Proposition par défaut : une source de financement se facture d'habitude au financeur (modifiable).
watch(() => form.origine, (o) => { if (o === 'financement') form.client = 'FINANCEUR' })

const clientKinds = computed(() => lists.clientKinds)
const quoteOptions = computed(() => lists.quotes.map((q) => ({
  value: q.id, label: `${q.reference} · ${q.client?.nom ?? '—'} · ${q.statut_libelle}`,
})))
const companyOptions = computed(() => lists.companies.map((c) => ({ value: c.id, label: c.nom })))
const learnerOptions = computed(() => lists.learners.map((l) => ({ value: l.id, label: `${l.last_name} ${l.first_name}` })))
const sessionOptions = computed(() => lists.sessions.map((s) => ({ value: s.id, label: `${s.reference} · ${s.program_title ?? ''}` })))
const sourceOptions = computed(() => lists.cases.flatMap((c) => c.sources.map((s) => ({
  value: s.id, label: `${c.stagiaire} · ${c.session} · ${s.libelle}${s.financeur ? ` (${s.financeur})` : ''} · ${stateLabel(s.etat)}`,
}))))

async function loadEnrollments() {
  form.inscriptions = []
  enrollments.value = []
  const sid = form.session
  if (!sid) return
  try {
    const res = await getSession(sid)
    if (sid === form.session) enrollments.value = res.inscriptions
  } catch (e) {
    error.value = e
  }
}

function payload(): InvoiceCreate {
  const body: InvoiceCreate = { client_type: form.client, titre: form.titre.trim() || undefined }
  if (form.origine === 'devis') {
    const quote = lists.quotes.find((q) => q.id === form.devis)
    return { ...body, client_type: 'ENTREPRISE', entreprise_id: quote?.client?.id, devis_id: form.devis || undefined }
  }
  if (form.origine === 'session') Object.assign(body, { session_id: form.session || undefined, inscription_ids: form.inscriptions.length ? form.inscriptions : undefined })
  if (form.origine === 'financement') body.financement_source_id = form.source || undefined
  if (form.client === 'ENTREPRISE') body.entreprise_id = form.entreprise || undefined
  else if (form.client === 'STAGIAIRE') body.stagiaire_id = form.stagiaire || undefined
  else {
    const f = Object.fromEntries(Object.entries(form.financeur).map(([k, v]) => [k, v.trim() || undefined]))
    if (f.nom) body.financeur = f as InvoiceCreate['financeur']
  }
  return body
}

function close() {
  if (!submitting.value) emit('update:visible', false)
}

async function submit() {
  submitting.value = true
  error.value = null
  try {
    const invoice = await createInvoice(payload())
    emit('created', invoice)
    emit('update:visible', false)
  } catch (e) {
    error.value = e
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.intro { .gsms-muted(); margin: 0 0 12px; }
.radios { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.checks { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 0 12px; }
@media (max-width: 480px) { .pair { grid-template-columns: minmax(0, 1fr); } }
</style>
