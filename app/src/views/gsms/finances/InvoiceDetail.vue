<template>
  <GsmsRecordSheet :title="inv ? (inv.numero || t('gsms.finances.factures.brouillonDe', { type: inv.type_libelle })) : t('gsms.finances.facture')"
    icon="file" back="/platform/factures" :back-label="t('gsms.finances.factures.titre')"
    :subtitle="inv ? `${inv.client.nom} · ${inv.titre}` : ''" :meta="meta" :ready="!!inv" :loading="loading" :error="error"
    :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="inv" #status>
      <GsmsStatusTag :code="inv.statut" :label="inv.statut_libelle" /><GsmsStatusTag v-if="inv.en_retard" code="EN_RETARD" />
    </template>
    <template v-if="inv" #actions>
      <t-button size="small" variant="outline" :loading="busy === 'apercu'" @click="preview">
        <template #icon><t-icon name="download" /></template>{{ inv.numero ? t('gsms.finances.factures.piece') : t('gsms.finances.factures.apercu') }}
      </t-button>
    </template>
    <template v-if="inv" #before>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <!-- Vérifications de l'API, telles quelles : bloquantes ou à relire, avec leur fondement -->
      <section v-if="inv.verifications.length" class="panel checks">
        <h3 class="title">{{ t('gsms.finances.factures.verifications') }}</h3>
        <p class="muted">{{ t('gsms.finances.factures.verificationsAide') }}</p>
        <ul class="check-list">
          <li v-for="c in inv.verifications" :key="`${c.code}-${c.id ?? ''}`" class="check">
            <t-tag :theme="c.bloquant ? 'danger' : 'warning'" variant="light" size="small" class="check-tag">
              {{ c.bloquant ? t('gsms.finances.factures.bloquant') : t('gsms.finances.factures.aRelire') }}
            </t-tag>
            <span class="check-body">
              <span class="check-msg">{{ c.message }}</span>
              <span class="muted">{{ t('gsms.finances.factures.fondement', { fondement: c.fondement }) }} · {{ t(`gsms.finances.factures.cibles.${c.cible}`, c.cible) }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>

    <template v-if="inv" #side>
      <section class="side-section">
        <h3>{{ t('gsms.finances.factures.actions') }}</h3>
        <p v-if="!gates.length" class="muted">{{ t('gsms.finances.factures.aucuneAction') }}</p>
        <div v-else class="gates">
          <GsmsActionGate v-for="g in gates" :key="g.name" :decision="g.decision" show-reason :pending="busy === g.name"
            :theme="g.name === 'supprimer' ? 'danger' : 'primary'" :variant="g.name === 'emettre' ? 'base' : 'outline'" @run="runGate(g.name)" />
        </div>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.finances.factures.client') }}</h3>
        <dl>
          <div><dt>{{ inv.client.type_libelle }}</dt><dd>{{ inv.client.nom }}</dd></div>
          <div><dt>{{ t('gsms.finances.factures.adresse') }}</dt><dd>{{ [inv.client.adresse, [inv.client.code_postal, inv.client.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—' }}</dd></div>
          <div><dt>{{ t('gsms.finances.factures.siret') }}</dt><dd>{{ inv.client.siret || '—' }}</dd></div>
          <div v-if="inv.bon_commande"><dt>{{ t('gsms.finances.factures.bonCommande') }}</dt><dd>{{ inv.bon_commande }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.finances.factures.montants') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.finances.factures.totalHt') }}</dt><dd class="num">{{ centimes(inv.total_ht_centimes) }}</dd></div>
          <div><dt>{{ t('gsms.finances.factures.totalTva') }}</dt><dd class="num">{{ centimes(inv.total_tva_centimes) }}</dd></div>
          <div><dt>{{ t('gsms.finances.factures.totalTtc') }}</dt><dd class="num strong">{{ centimes(inv.total_ttc_centimes) }}</dd></div>
          <template v-if="inv.type === 'FACTURE' && inv.numero">
            <div><dt>{{ t('gsms.finances.factures.avoirs') }}</dt><dd class="num">{{ centimes(inv.avoirs_centimes) }}</dd></div>
            <div><dt>{{ t('gsms.finances.factures.encaisse') }}</dt><dd class="num">{{ centimes(inv.encaisse_centimes) }}</dd></div>
            <div><dt>{{ t('gsms.finances.factures.resteDu') }}</dt><dd class="num strong">{{ centimes(inv.reste_du_centimes) }}</dd></div>
            <div v-if="inv.trop_percu_centimes > 0"><dt>{{ t('gsms.finances.factures.tropPercu') }}</dt><dd class="num warn">{{ centimes(inv.trop_percu_centimes) }}</dd></div>
          </template>
        </dl>
        <p v-if="inv.mention_tva" class="muted mention">{{ inv.mention_tva }}</p>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.finances.factures.dates') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.finances.factures.emiseLe') }}</dt><dd>{{ fmtDate(inv.emise_le) }}</dd></div>
          <div v-if="inv.type === 'FACTURE'"><dt>{{ t('gsms.finances.factures.echeance') }}</dt><dd>{{ fmtDate(inv.echeance) }}</dd></div>
          <div><dt>{{ t('gsms.finances.factures.prestation') }}</dt><dd>{{ fmtDate(inv.prestation_du) }} → {{ fmtDate(inv.prestation_au) }}</dd></div>
          <div v-if="inv.facture_origine_id"><dt>{{ t('gsms.finances.factures.factureOrigine') }}</dt>
            <dd><router-link :to="`/platform/factures/${inv.facture_origine_id}`">{{ t('gsms.finances.factures.ouvrir') }}</router-link></dd></div>
          <div v-if="inv.motif"><dt>{{ t('gsms.saisies.motif') }}</dt><dd>{{ inv.motif }}</dd></div>
          <div v-if="inv.note"><dt>{{ t('gsms.finances.factures.noteInterne') }}</dt><dd>{{ inv.note }}</dd></div>
          <div v-if="inv.document"><dt>{{ t('gsms.finances.factures.empreinte') }}</dt><dd class="hash">{{ inv.document.sha256 }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="inv">
      <!-- Lignes : montants calculés par l'API -->
      <section v-if="tab === 'lignes'" class="panel">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.finances.factures.lignes') }}</h3>
          <t-button v-if="inv.capabilities.modifier.allowed" size="small" variant="outline" @click="openLine(-1)">
            <template #icon><t-icon name="add" /></template>{{ t('gsms.finances.factures.ajouterLigne') }}
          </t-button>
        </div>
        <p v-if="!inv.lignes.length" class="muted">{{ t('gsms.finances.factures.aucuneLigne') }}</p>
        <ul v-else class="rows">
          <li v-for="(l, i) in inv.lignes" :key="l.id" class="line">
            <div class="line-main">
              <span class="line-label">{{ l.libelle }}</span>
              <span v-if="l.detail" class="muted">{{ l.detail }}</span>
              <span class="muted">
                {{ t('gsms.finances.factures.quantitePrix', { q: l.quantite, unite: unitLabel(l.unite), prix: centimes(l.prix_unitaire_centimes) }) }}
                <template v-if="Number(l.remise_pct)"> · {{ t('gsms.finances.factures.remise', { pct: l.remise_pct }) }}</template>
                · {{ l.exoneree ? t('gsms.finances.factures.exoneree') : t('gsms.finances.factures.tva', { taux: l.tva_taux }) }}
                <template v-if="l.credite_centimes"> · {{ t('gsms.finances.factures.credite', { montant: centimes(l.credite_centimes) }) }}</template>
              </span>
            </div>
            <span class="num strong">{{ centimes(l.montant_ht_centimes) }}</span>
            <div v-if="inv.capabilities.modifier.allowed" class="line-actions">
              <button type="button" class="link-btn" @click="openLine(i)">{{ t('gsms.commun.modifier') }}</button>
              <button type="button" class="link-btn link-btn--danger" @click="removeLine(i)">{{ t('gsms.commun.supprimer') }}</button>
            </div>
          </li>
        </ul>
        <div v-if="inv.tva.length" class="vat">
          <h4>{{ t('gsms.finances.factures.tvaParTaux') }}</h4>
          <ul class="vat-list">
            <li v-for="g in inv.tva" :key="g.taux ?? 'exoneree'">
              <span>{{ g.taux != null ? t('gsms.finances.factures.tva', { taux: g.taux }) : t('gsms.finances.factures.exoneree') }}</span>
              <span class="muted">{{ t('gsms.finances.factures.base', { montant: centimes(g.base_centimes) }) }}</span>
              <span class="num">{{ centimes(g.tva_centimes) }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section v-else-if="tab === 'avoirs'" class="panel">
        <p v-if="!inv.avoirs.length" class="muted">{{ t('gsms.finances.factures.aucunAvoir') }}</p>
        <ul v-else class="rows">
          <li v-for="a in inv.avoirs" :key="a.id">
            <router-link :to="`/platform/factures/${a.id}`" class="row">
              <span class="row-main">{{ a.numero || t('gsms.finances.factures.sansNumero') }}</span>
              <span class="muted">{{ fmtDate(a.emise_le) }}</span>
              <span class="num">{{ centimes(a.total_ttc_centimes) }}</span>
              <GsmsStatusTag :code="a.statut" :label="a.statut_libelle" />
            </router-link>
          </li>
        </ul>
      </section>

      <section v-else-if="tab === 'encaissements'" class="panel">
        <p v-if="!inv.encaissements.length" class="muted">{{ t('gsms.finances.paiements.aucun') }}</p>
        <ul v-else class="rows">
          <li v-for="p in inv.encaissements" :key="p.id" class="pay">
            <div class="line-main">
              <span class="line-label">{{ fmtDate(p.date) }} · {{ p.mode_libelle }}<template v-if="p.reference"> · {{ p.reference }}</template></span>
              <span v-if="p.note" class="muted">{{ p.note }}</span>
              <span v-if="p.annule" class="muted">{{ t('gsms.finances.paiements.annuleLe', { le: fmtDateTime(p.annule_le), par: p.annule_par || '—', motif: p.motif_annulation || '—' }) }}</span>
            </div>
            <span class="num strong" :class="{ cancelled: p.annule }">{{ centimes(p.montant_centimes) }}</span>
            <GsmsStatusTag v-if="p.annule" code="ANNULE" />
            <GsmsActionGate v-else-if="p.capabilities" :decision="p.capabilities.annuler" variant="outline" theme="danger" @run="cancelTarget = p.id">
              {{ t('gsms.finances.paiements.annuler') }}
            </GsmsActionGate>
          </li>
        </ul>
      </section>

      <section v-else class="panel">
        <ul class="timeline">
          <li v-for="(h, i) in inv.historique" :key="i">
            <span class="tl-date">{{ fmtDateTime(h.le) }}</span>
            <span>{{ t(`gsms.finances.factures.historique.${h.action}`, h.action) }}<template v-if="h.numero"> · {{ h.numero }}</template>
              <template v-if="h.montant_centimes != null"> · {{ centimes(h.montant_centimes) }}</template><template v-if="h.motif"> · {{ h.motif }}</template></span>
            <span class="muted">{{ h.par || '—' }}</span>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <template v-if="inv">
    <ActionDialog v-model:visible="editVisible" :title="inv.capabilities.modifier.libelle || t('gsms.commun.modifier')" :fields="editFields"
      :run="(v) => updateInvoice(id, v)" @done="done" />
    <ActionDialog v-model:visible="lineVisible" :title="lineIndex < 0 ? t('gsms.finances.factures.ajouterLigne') : t('gsms.finances.factures.modifierLigne')"
      :fields="lineFields" :intro="t('gsms.finances.factures.ligneAide')" :run="saveLine" @done="done" />
    <ActionDialog v-model:visible="payVisible" :title="inv.capabilities.encaisser.libelle || ''" :fields="payFields"
      :intro="t('gsms.finances.paiements.aide', { reste: centimes(inv.reste_du_centimes) })" :run="pay" @done="done" />
    <ActionDialog v-model:visible="creditVisible" :title="inv.capabilities.avoir.libelle || ''" :fields="creditFields"
      :intro="t('gsms.finances.factures.avoirAide')" :confirm-label="t('gsms.finances.factures.emettreAvoir')" :run="credit" @done="credited"
      danger :consequence="t('gsms.finances.factures.avoirConsequence')" :confirm-text="inv.numero || ''" />
    <ActionDialog :visible="!!cancelTarget" :title="t('gsms.finances.paiements.annuler')" :fields="['motif']" danger
      :consequence="t('gsms.finances.paiements.annulerConsequence')"
      :intro="t('gsms.finances.paiements.annulerAide')" :confirm-label="t('gsms.finances.paiements.annuler')"
      :run="(v) => cancelPayment(cancelTarget, v.motif ?? '')" @update:visible="(v) => { if (!v) cancelTarget = '' }" @done="done" />
  </template>
</template>

<script setup lang="ts">
/**
 * Fiche facture ou avoir (niveau 3). Les boutons suivent les capacités de l'API ; les vérifications (`bloquant`,
 * `fondement`) s'affichent telles quelles. L'aperçu A4 est téléchargé en fichier, jamais injecté dans la page.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import {
  addPayment, cancelPayment, creditInvoice, deleteInvoice, getInvoice, getInvoiceReferences, invoicePreviewPath, issueInvoice,
  putInvoiceLines, updateInvoice, type InvoiceCapabilityName, type InvoiceDetail, type InvoiceLine, type InvoiceLineInput, type InvoiceReferences,
} from '@/api/gsms/invoicing'
import { downloadFile } from '@/api/gsms/files'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'
import { centimes, todayIso, toCentimes } from './display'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.invoiceId || ''))

const inv = ref<InvoiceDetail | null>(null)
const refs = ref<InvoiceReferences | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const TABS = ['lignes', 'avoirs', 'encaissements', 'historique']
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'lignes')
const editVisible = ref(false)
const lineVisible = ref(false)
const lineIndex = ref(-1)
const payVisible = ref(false)
const creditVisible = ref(false)
const cancelTarget = ref('')

// Puces de l'en-tête : montants et dates renvoyés par l'API (aucun calcul ici).
const meta = computed(() => {
  const i = inv.value
  if (!i) return []
  return [
    { icon: 'money', label: centimes(i.total_ttc_centimes), title: t('gsms.finances.factures.totalTtc') },
    ...(i.type === 'FACTURE' && i.reste_du_centimes ? [{ icon: 'wallet', label: `${t('gsms.finances.factures.resteDu')} ${centimes(i.reste_du_centimes)}` }] : []),
    ...(i.emise_le ? [{ icon: 'calendar', label: fmtDate(i.emise_le), title: t('gsms.finances.factures.emiseLe') }] : []),
    ...(i.echeance ? [{ icon: 'time', label: fmtDate(i.echeance), title: t('gsms.finances.factures.echeance') }] : []),
  ]
})
// Refus qui veulent dire « pas dans cet état » (pièce émise, brouillon…) : le bouton n'a pas lieu d'être montré.
// Les autres refus (droit manquant, vérifications bloquantes) restent visibles avec leur motif.
const STATE_REFUSALS = new Set(['NOT_DRAFT', 'NOT_ISSUED', 'NOT_AN_INVOICE', 'INVALID_STATE', 'NOTHING_TO_CREDIT'])
const GATES: InvoiceCapabilityName[] = ['emettre', 'encaisser', 'avoir', 'modifier', 'supprimer']
const gates = computed(() => {
  const i = inv.value
  if (!i) return []
  return GATES.map((name) => {
    const d = i.capabilities[name]
    // Les points bloquants sont déjà listés dans « Vérifications avant émission » : le motif suffit sous le bouton.
    return { name, decision: name === 'emettre' && i.verifications.length ? { ...d, details: undefined } : d }
  }).filter((g) => g.decision.allowed || !STATE_REFUSALS.has(g.decision.code ?? ''))
})

function runGate(name: InvoiceCapabilityName) {
  if (name === 'emettre') issue()
  else if (name === 'supprimer') remove()
  else if (name === 'encaisser') payVisible.value = true
  else if (name === 'avoir') creditVisible.value = true
  else editVisible.value = true
}

const tabs = computed(() => [
  { value: 'lignes', label: t('gsms.finances.factures.lignes'), count: inv.value?.lignes.length },
  ...(inv.value?.type === 'FACTURE' ? [
    { value: 'avoirs', label: t('gsms.finances.factures.avoirs'), count: inv.value.avoirs.length },
    { value: 'encaissements', label: t('gsms.finances.paiements.titre'), count: inv.value.encaissements.length },
  ] : []),
  { value: 'historique', label: t('gsms.commun.historique') },
])

async function load() {
  const asked = id.value
  if (!asked) return
  loading.value = true
  error.value = null
  try {
    const res = await getInvoice(asked)
    if (asked === id.value) inv.value = res
  } catch (e) {
    if (asked === id.value) { error.value = e; inv.value = null }
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; load() }, { immediate: true })
// Onglet absent du document chargé (un avoir n'a ni avoirs ni encaissements) : retour aux lignes.
watch(inv, (i) => { if (i && !tabs.value.some((x) => x.value === tab.value)) tab.value = 'lignes' })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))
void getInvoiceReferences().then((r) => { refs.value = r }).catch(() => { /* libellés bruts à défaut */ })

const unitLabel = (code: string) => refs.value?.unites[code] ?? code

async function done(res?: unknown) {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  actionError.value = null
  if (res && typeof res === 'object' && (res as InvoiceDetail).id === id.value) inv.value = res as InvoiceDetail
  else await load()
}

async function preview() {
  if (!inv.value) return
  busy.value = 'apercu'
  try {
    await downloadFile(invoicePreviewPath(id.value), `${inv.value.numero || t('gsms.finances.factures.fichierBrouillon')}.html`)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function issue() {
  const i = inv.value
  if (!i) return
  const res = await confirmCritical<InvoiceDetail>({
    title: i.capabilities.emettre.libelle || t('gsms.finances.factures.emettre'), consequence: t('gsms.finances.factures.emettreConfirmer'),
    confirmLabel: t('gsms.finances.factures.emettre'), confirmText: i.client.nom || undefined, run: () => issueInvoice(id.value),
  })
  if (!res) return
  inv.value = res
  actionError.value = null
  MessagePlugin.success(t('gsms.finances.factures.emise', { numero: res.numero }))
}

async function remove() {
  const done = await confirmCritical({
    title: inv.value?.capabilities.supprimer.libelle || t('gsms.commun.supprimer'), consequence: t('gsms.finances.factures.supprimerAide'),
    confirmLabel: t('gsms.commun.supprimer'), run: () => deleteInvoice(id.value).then(() => true),
  })
  if (done) router.push('/platform/factures')
}

// Modification du brouillon : champs de PATCH /factures/{id}.
const editFields = computed<ActionField[]>(() => {
  const i = inv.value
  if (!i) return []
  return [
    { name: 'titre', label: t('gsms.finances.factures.objet'), initial: i.titre },
    { name: 'client_nom', label: t('gsms.finances.factures.clientNom'), initial: i.client.nom },
    { name: 'client_adresse', label: t('gsms.finances.factures.adresse'), initial: i.client.adresse },
    { name: 'client_code_postal', label: t('gsms.finances.factures.codePostal'), initial: i.client.code_postal },
    { name: 'client_ville', label: t('gsms.finances.factures.ville'), initial: i.client.ville },
    { name: 'client_siret', label: t('gsms.finances.factures.siret'), initial: i.client.siret },
    { name: 'bon_commande', label: t('gsms.finances.factures.bonCommande'), initial: i.bon_commande },
    { name: 'prestation_du', label: t('gsms.finances.factures.prestationDu'), type: 'date', initial: i.prestation_du },
    { name: 'prestation_au', label: t('gsms.finances.factures.prestationAu'), type: 'date', initial: i.prestation_au },
    { name: 'echeance', label: t('gsms.finances.factures.echeance'), type: 'date', initial: i.echeance },
    { name: 'note', label: t('gsms.finances.factures.noteInterne'), type: 'textarea', initial: i.note },
  ]
})

// Lignes : PUT remplace toute la liste ; on renvoie les lignes existantes telles que l'API les a données.
const asInput = (l: InvoiceLine): InvoiceLineInput => ({
  libelle: l.libelle, detail: l.detail, quantite: l.quantite, unite: l.unite, prix_unitaire_centimes: l.prix_unitaire_centimes,
  remise_pct: l.remise_pct, tva_taux: l.tva_taux, exoneree: l.exoneree, formation_id: l.formation_id,
  session_id: l.session_id, inscription_id: l.inscription_id,
})

function openLine(i: number) {
  lineIndex.value = i
  lineVisible.value = true
}

const lineFields = computed<ActionField[]>(() => {
  const l = lineIndex.value >= 0 ? inv.value?.lignes[lineIndex.value] : undefined
  return [
    { name: 'libelle', label: t('gsms.finances.factures.libelle'), initial: l?.libelle, required: true },
    { name: 'detail', label: t('gsms.finances.factures.detail'), type: 'textarea', initial: l?.detail },
    { name: 'quantite', label: t('gsms.finances.factures.quantite'), type: 'number', initial: l ? Number(l.quantite) : 1 },
    { name: 'unite', label: t('gsms.finances.factures.unite'), type: 'select', initial: l?.unite ?? 'STAGIAIRE',
      options: Object.entries(refs.value?.unites ?? {}).map(([value, label]) => ({ value, label })) },
    { name: 'prix', label: t('gsms.finances.factures.prixUnitaire'), type: 'number', initial: l ? l.prix_unitaire_centimes / 100 : undefined, required: true },
    { name: 'remise_pct', label: t('gsms.finances.factures.remisePct'), type: 'number', initial: l ? Number(l.remise_pct) : 0 },
    { name: 'regime', label: t('gsms.finances.factures.regimeTva'), type: 'radio', initial: l ? (l.exoneree ? 'exoneree' : 'taux') : 'defaut',
      options: ['defaut', 'exoneree', 'taux'].map((value) => ({ value, label: t(`gsms.finances.factures.regimes.${value}`) })) },
    { name: 'tva_taux', label: t('gsms.finances.factures.tauxTva'), type: 'number', initial: l?.tva_taux != null ? Number(l.tva_taux) : undefined },
  ]
})

function saveLine(v: Record<string, any>) {
  const lines = (inv.value?.lignes ?? []).map(asInput)
  const current = lineIndex.value >= 0 ? lines[lineIndex.value] : undefined
  const line: InvoiceLineInput = {
    ...(current ?? {}),
    libelle: String(v.libelle ?? ''), detail: v.detail ?? null, quantite: String(v.quantite ?? ''), unite: String(v.unite ?? ''),
    // Jamais de 0 € à la place d'un prix absent : sans prix, la ligne part sans ce champ et l'API la refuse (422).
    prix_unitaire_centimes: toCentimes(v.prix), remise_pct: String(v.remise_pct ?? 0),
    exoneree: v.regime === 'exoneree', tva_taux: v.regime === 'taux' && v.tva_taux != null ? String(v.tva_taux) : null,
  }
  if (lineIndex.value >= 0) lines[lineIndex.value] = line
  else lines.push(line)
  return putInvoiceLines(id.value, lines)
}

async function removeLine(i: number) {
  const res = await confirmCritical<InvoiceDetail>({
    title: t('gsms.finances.factures.supprimerLigne'), intro: inv.value?.lignes[i]?.libelle,
    consequence: t('gsms.finances.factures.supprimerLigneAide'), confirmLabel: t('gsms.commun.supprimer'),
    run: () => putInvoiceLines(id.value, (inv.value?.lignes ?? []).filter((_, n) => n !== i).map(asInput)),
  })
  if (res) await done(res)
}

const payFields = computed<ActionField[]>(() => [
  { name: 'montant', label: t('gsms.finances.paiements.montantEuros'), type: 'number',
    initial: inv.value && inv.value.reste_du_centimes > 0 ? inv.value.reste_du_centimes / 100 : undefined },
  { name: 'recu_le', label: t('gsms.finances.paiements.recuLe'), type: 'date', initial: todayIso() },
  { name: 'mode', label: t('gsms.finances.paiements.mode'), type: 'select', initial: 'VIREMENT',
    options: Object.entries(refs.value?.modes_paiement ?? {}).map(([value, label]) => ({ value, label })) },
  { name: 'reference', label: t('gsms.finances.paiements.reference') },
  { name: 'note', label: t('gsms.saisies.note'), type: 'textarea' },
])

function pay(v: Record<string, any>) {
  return addPayment(id.value, {
    montant_centimes: toCentimes(v.montant) ?? 0, recu_le: String(v.recu_le ?? ''), mode: String(v.mode ?? ''),
    reference: v.reference ?? null, note: v.note ?? null,
  })
}

// Avoir : un montant HT par ligne (vide = rien sur cette ligne) ; aucun montant = tout le restant (règle de l'API).
const creditFields = computed<ActionField[]>(() => [
  { name: 'motif', label: t('gsms.saisies.motif'), type: 'textarea' },
  ...(inv.value?.lignes ?? []).map<ActionField>((l) => ({
    name: `ligne_${l.id}`, type: 'number',
    label: t('gsms.finances.factures.avoirLigne', { libelle: l.libelle, ht: centimes(l.montant_ht_centimes), credite: centimes(l.credite_centimes) }),
  })),
])

function credit(v: Record<string, any>) {
  const lignes = (inv.value?.lignes ?? [])
    .map((l) => ({ ligne_id: l.id, montant_ht_centimes: toCentimes(v[`ligne_${l.id}`]) ?? 0 }))
    .filter((x) => x.montant_ht_centimes !== 0)
  return creditInvoice(id.value, String(v.motif ?? ''), lignes)
}

function credited(res: unknown) {
  const note = res as InvoiceDetail
  MessagePlugin.success(t('gsms.finances.factures.avoirEmis', { numero: note.numero }))
  router.push(`/platform/factures/${note.id}`)
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.muted { .gsms-muted(); }
.gates { display: flex; flex-direction: column; gap: 12px; }
.checks { margin-bottom: 16px; .muted { margin: 4px 0 8px; display: block; } }
.check-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.check { display: flex; align-items: flex-start; gap: 10px; }
.check-tag { flex-shrink: 0; margin-top: 1px; }
.check-body { display: flex; flex-direction: column; min-width: 0; .muted { margin: 0; } }
.check-msg { font-size: var(--app-text-md); line-height: 20px; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.rows { .gsms-rows(); }
.line, .pay { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.line-main { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.line-label { font-size: var(--app-text-md); font-weight: 500; color: var(--td-text-color-primary); overflow-wrap: anywhere; }
.line-actions { display: flex; gap: 12px; }
.link-btn { .gsms-link-button(); }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.strong { font-weight: 600; }
.warn { color: var(--td-warning-color); }
.cancelled { text-decoration: line-through; color: var(--td-text-color-placeholder); }
.mention { margin: 8px 0 0; }
.hash { font-family: ui-monospace, monospace; font-size: var(--app-text-xs); word-break: break-all; }
.vat { margin-top: 12px; h4 { margin: 0 0 6px; font-size: var(--app-text-sm); font-weight: 600; } }
.vat-list { list-style: none; margin: 0; padding: 0; li { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; padding: 4px 0; } }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; color: inherit; text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.row-main { flex: 1 1 160px; min-width: 0; font-weight: 500; }
.timeline { .gsms-timeline(); }
</style>
