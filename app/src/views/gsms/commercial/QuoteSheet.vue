<template>
  <GsmsRecordSheet :title="quote?.reference || t('gsms.commercial.devis.fiche')" icon="file-paste" back="/platform/devis"
    :back-label="t('gsms.commercial.devis.titre')" :subtitle="quote ? [quote.titre, quote.client?.nom].filter(Boolean).join(' · ') : ''"
    :ready="!!quote" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="quote" #status>
      <GsmsStatusTag :code="quote.statut" :label="quote.statut_libelle" />
      <t-tag v-if="quote.expire" theme="danger" variant="light" size="small">{{ t('gsms.commercial.devis.expire') }}</t-tag>
    </template>
    <template v-if="quote" #actions>
      <t-button size="small" variant="outline" :loading="busy === 'apercu'" @click="preview">
        <template #icon><t-icon name="download" /></template>{{ t('gsms.commercial.devis.apercu') }}
      </t-button>
    </template>
    <template v-if="quote" #before>
      <p class="notice"><t-icon name="info-circle" size="14px" />{{ t('gsms.commercial.devis.apercuAide') }}</p>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
    </template>

    <template v-if="quote" #side>
      <section v-if="actions.length" class="side-section">
        <h3>{{ t('gsms.commercial.devis.circuit') }}</h3>
        <div class="lifecycle">
          <GsmsActionGate v-for="a in actions" :key="a" :decision="quote.capabilities[a]" show-reason
            :theme="a === 'abandonner' ? 'danger' : 'primary'" :variant="a === 'abandonner' || a === 'renvoyer' ? 'outline' : 'base'"
            :pending="busy === a" @run="openAction(a)" />
        </div>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.devis.colClient') }}</h3>
        <dl v-if="quote.client">
          <div><dt>{{ t('gsms.commercial.entreprises.nom') }}</dt><dd>
            <router-link :to="`/platform/entreprises/${quote.client.id}`" class="link">{{ quote.client.nom }}</router-link></dd></div>
          <div><dt>{{ t('gsms.commercial.entreprises.siret') }}</dt><dd>{{ quote.client.siret || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.entreprises.adresse') }}</dt><dd>{{ clientAddress || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.entreprises.contact') }}</dt><dd>{{ [quote.client.contact, quote.client.email].filter(Boolean).join(' · ') || '—' }}</dd></div>
        </dl>
        <p v-else class="muted">—</p>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.devis.document') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.commercial.devis.version') }}</dt><dd>{{ quote.version }}</dd></div>
          <div><dt>{{ t('gsms.commercial.devis.colValidite') }}</dt><dd>{{ fmtDate(quote.valide_jusqu_au) }}</dd></div>
          <div v-if="quote.envoye_le"><dt>{{ t('gsms.commercial.devis.envoyeLe') }}</dt><dd>{{ fmtDate(quote.envoye_le) }}</dd></div>
          <div><dt>{{ t('gsms.commercial.devis.creeLe') }}</dt><dd>{{ fmtDateTime(quote.cree_le) }}<template v-if="quote.par"> · {{ quote.par }}</template></dd></div>
          <div><dt>{{ t('gsms.commercial.devis.colModifie') }}</dt><dd>{{ fmtDateTime(quote.modifie_le) }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="quote">
      <!-- Contenu : lignes, totaux calculés par l'API, sections -->
      <template v-if="tab === 'contenu'">
        <section class="panel">
          <div class="panel-bar">
            <h3 class="title">{{ t('gsms.commercial.devis.lignes') }}</h3>
            <div v-if="editable" class="bar-actions">
              <GsmsActionGate :decision="quote.capabilities.modifier" variant="outline" @run="editVisible = true">{{ t('gsms.commercial.devis.modifierEntete') }}</GsmsActionGate>
              <GsmsActionGate :decision="quote.capabilities.modifier" @run="linesVisible = true">{{ t('gsms.commercial.devis.modifierLignes') }}</GsmsActionGate>
            </div>
          </div>
          <p v-if="!quote.lignes.length" class="muted">{{ t('gsms.commercial.devis.aucuneLigne') }}</p>
          <ul v-else class="rows">
            <li v-for="l in quote.lignes" :key="l.id" class="row">
              <div class="row-main">
                <span>{{ l.libelle }}</span>
                <span v-if="l.formation" class="chip">{{ l.formation.code }}</span>
                <span v-if="l.detail" class="muted detail">{{ l.detail }}</span>
              </div>
              <span class="muted">{{ qty(l.quantite) }} × {{ unitLabel(l.unite) }} · {{ euros(l.prix_unitaire) }}<template v-if="l.remise_pct"> · {{ t('gsms.commercial.devis.remiseN', { n: l.remise_pct }) }}</template></span>
              <span class="amount">{{ euros(l.montant_ht) }}</span>
            </li>
          </ul>
          <dl class="totals">
            <div><dt>{{ t('gsms.commercial.devis.totalHt') }}</dt><dd>{{ euros(quote.totaux.total_ht) }}</dd></div>
            <div><dt>{{ quote.totaux.tva_taux !== null ? t('gsms.commercial.devis.tvaTaux', { n: quote.totaux.tva_taux }) : t('gsms.commercial.devis.tva') }}</dt><dd>{{ euros(quote.totaux.tva) }}</dd></div>
            <div class="total"><dt>{{ t('gsms.commercial.devis.totalTtc') }}</dt><dd>{{ euros(quote.totaux.total_ttc) }}</dd></div>
          </dl>
          <p v-if="quote.totaux.mention_tva" class="muted">{{ quote.totaux.mention_tva }}</p>
          <p v-if="!quote.totaux.complet" class="muted warn">{{ t('gsms.commercial.devis.totauxIncomplets') }}</p>
        </section>
        <section v-for="(s, i) in quote.sections" :key="i" class="panel">
          <h3 class="title">{{ s.titre }}</h3>
          <p class="text">{{ s.texte }}</p>
        </section>
      </template>

      <!-- Vérifications : ce qui bloque la relecture et la validation -->
      <section v-else-if="tab === 'verifications'" class="panel">
        <p v-if="!quote.verifications.length" class="muted">{{ t('gsms.commercial.devis.aucuneVerification') }}</p>
        <ul v-else class="rows">
          <li v-for="(v, i) in quote.verifications" :key="i" class="row">
            <t-icon name="error-circle" class="ko" size="16px" />
            <span class="row-main">{{ v.message }}</span>
            <router-link v-if="targetOf(v)" :to="targetOf(v)!" class="link">{{ t('gsms.commercial.devis.corriger') }}<t-icon name="chevron-right" size="14px" /></router-link>
          </li>
        </ul>
      </section>

      <!-- Historique du circuit -->
      <section v-else-if="tab === 'historique'" class="panel">
        <p v-if="!quote.historique.length" class="muted">{{ t('gsms.commun.aucunHistorique') }}</p>
        <ul v-else class="timeline">
          <li v-for="(h, i) in quote.historique" :key="i">
            <span class="tl-date">{{ fmtDateTime(h.le) }}<template v-if="h.version"> · v{{ h.version }}</template><template v-if="h.par"> · {{ h.par }}</template></span>
            <span>{{ h.de }} → {{ h.vers }}</span>
            <span v-if="h.motif" class="muted">{{ h.motif }}</span>
          </li>
        </ul>
      </section>

      <!-- Versions validées archivées -->
      <section v-else class="panel">
        <p v-if="!quote.versions.length" class="muted">{{ t('gsms.commercial.devis.aucuneVersion') }}</p>
        <ul v-else class="rows">
          <li v-for="v in quote.versions" :key="v.id" class="row">
            <span class="row-main">{{ t('gsms.commercial.devis.versionN', { n: v.version }) }}</span>
            <span class="muted">{{ fmtDateTime(v.emis_le) }}<template v-if="v.par"> · {{ v.par }}</template></span>
            <GsmsStatusTag :code="v.statut" />
            <span class="muted sha" :title="v.sha256">SHA-256 {{ v.sha256.slice(0, 12) }}…</span>
            <t-button size="small" variant="text" theme="primary" :loading="busy === v.id" @click="downloadVersion(v.id, v.version)">
              <t-icon name="download" />{{ t('gsms.commun.telecharger') }}
            </t-button>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="action.visible" :title="action.title" :confirm-label="action.title" :danger="action.name === 'abandonner'"
    :intro="action.intro" :fields="action.fields" :run="runAction" @done="done" />
  <ActionDialog v-if="quote" v-model:visible="editVisible" :title="t('gsms.commercial.devis.modifierEntete')" :fields="editFields"
    :run="(v) => updateEdition(id, v)" @done="done" />
  <QuoteLinesDialog v-if="quote" v-model:visible="linesVisible" :quote-id="id" :lines="quote.lignes" :units="units" @saved="saved" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import QuoteLinesDialog from './QuoteLinesDialog.vue'
import {
  EDITION_ACTIONS, downloadEditionPreview, downloadEditionVersion, editionAction, getEdition, getEditionTypes, updateEdition,
  type EditionCheck, type EditionDetail,
} from '@/api/gsms/editions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'
import { euros } from '@/views/gsms/formations/display'

const TABS = ['contenu', 'verifications', 'historique', 'versions']
// Refus qui ne sont pas à montrer : action sans objet dans cet état, ou droit que le compte n'a pas.
const HIDDEN = new Set(['INVALID_TRANSITION', 'PERMISSION_MISSING'])

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const id = computed(() => String(route.params.quoteId || ''))
const quote = ref<EditionDetail | null>(null)
const units = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'contenu')
const editVisible = ref(false)
const linesVisible = ref(false)

const actions = computed(() => EDITION_ACTIONS.filter((a) => {
  const d = quote.value?.capabilities[a]
  return !!d && !HIDDEN.has(d.code ?? '')
}))
// Modification : proposée quand l'API la permet (brouillon et `documents.write`).
const editable = computed(() => !!quote.value?.capabilities.modifier?.allowed)
const tabs = computed(() => [
  { value: 'contenu', label: t('gsms.commercial.devis.ongletContenu'), count: quote.value?.lignes.length },
  { value: 'verifications', label: t('gsms.commercial.devis.ongletVerifications'), count: quote.value?.verifications.length },
  { value: 'historique', label: t('gsms.commun.historique'), count: quote.value?.historique.length },
  { value: 'versions', label: t('gsms.commercial.devis.ongletVersions'), count: quote.value?.versions.length },
])
const clientAddress = computed(() => {
  const c = quote.value?.client
  return c ? [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
})
const editFields = computed<ActionField[]>(() => [
  { name: 'titre', label: t('gsms.commercial.devis.colTitre'), initial: quote.value?.titre ?? undefined },
  { name: 'valide_jusqu_au', label: t('gsms.commercial.devis.colValidite'), type: 'date', initial: quote.value?.valide_jusqu_au ?? undefined },
])

const unitLabel = (code: string) => units.value[code] ?? code
const qty = (n: number) => n.toLocaleString(locale.value, { maximumFractionDigits: 2 })

/** Lien vers l'endroit où corriger un point de vérification (`cible` de l'API), quand la page existe. */
function targetOf(v: EditionCheck): string | null {
  if (v.cible === 'entreprise' && v.id) return `/platform/entreprises/${v.id}`
  if (v.cible === 'formation' && v.id) return `/platform/formations/${v.id}`
  return null
}

async function load() {
  const asked = id.value
  if (!asked) return
  loading.value = true
  error.value = null
  try {
    const [res, types] = await Promise.all([getEdition(asked), Object.keys(units.value).length ? null : getEditionTypes()])
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    quote.value = res
    if (types && !Array.isArray(types.unites)) units.value = types.unites
  } catch (e) {
    if (asked !== id.value) return
    error.value = e
    quote.value = null
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; access.load(); load() }, { immediate: true })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

// Circuit : chaque action passe par une confirmation ; les saisies sont celles que l'API demande (`a_saisir`).
const action = reactive<{ visible: boolean; name: string; title: string; intro: string; fields: ActionField[] }>({
  visible: false, name: '', title: '', intro: '', fields: [],
})
function openAction(name: string) {
  const d = quote.value?.capabilities[name]
  actionError.value = null
  Object.assign(action, {
    visible: true, name, title: d?.libelle ?? name, intro: t(`gsms.commercial.devis.actionsAide.${name}`),
    fields: (d?.a_saisir ?? []).map((f) => (f === 'date' ? { name: 'date', label: t('gsms.commercial.devis.dateEnvoi'), type: 'date' } : { name: f })),
  })
}
// La saisie « date » de l'API est la date d'envoi (`date_envoi` de la route).
const runAction = (v: Record<string, unknown>) =>
  editionAction(id.value, action.name, { motif: (v.motif as string) || null, date_envoi: (v.date as string) || null })

function done(res: unknown) {
  quote.value = res as EditionDetail
  MessagePlugin.success(t('gsms.commun.misAJour'))
}
function saved(res: EditionDetail) {
  quote.value = res
  MessagePlugin.success(t('gsms.commun.enregistre'))
}

async function preview() {
  if (!quote.value) return
  busy.value = 'apercu'
  actionError.value = null
  try {
    await downloadEditionPreview(id.value, quote.value.reference)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}
async function downloadVersion(documentId: string, version: number) {
  if (!quote.value) return
  busy.value = documentId
  actionError.value = null
  try {
    await downloadEditionVersion(id.value, documentId, `${quote.value.reference}-v${version}`)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.lifecycle { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.bar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.title { .gsms-panel-title(); margin: 0; }
.muted { .gsms-muted(); margin: 0; }
.warn { color: var(--td-warning-color); }
.notice { .gsms-notice(); }
.text { margin: 0; white-space: pre-line; font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; }
.chip { .gsms-chip(); }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.row-main { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; flex: 1 1 200px; min-width: 0; color: var(--td-text-color-primary);
  font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.detail { flex-basis: 100%; font-weight: 400; white-space: pre-line; }
.amount { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.sha { font-family: var(--app-font-mono, monospace); }
.ko { color: var(--td-error-color); flex-shrink: 0; }
.timeline { .gsms-timeline(); }
.totals { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin: 4px 0 0;
  div { display: flex; gap: 16px; font-size: var(--app-text-md); }
  dt { color: var(--td-text-color-secondary); }
  dd { margin: 0; min-width: 110px; text-align: right; font-variant-numeric: tabular-nums; }
  .total { font-weight: 600; } }
</style>
