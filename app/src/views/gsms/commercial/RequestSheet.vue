<template>
  <GsmsRecordSheet :title="request ? fullName : t('gsms.commercial.demandes.fiche')" icon="user-add" back="/platform/demandes"
    :avatar-name="request ? fullName : null" :avatar-photo="candidatePhoto"
    :back-label="t('gsms.commercial.demandes.titre')" :subtitle="request ? `${request.reference} · ${request.formation.nom || '—'}` : ''"
    :ready="!!request" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="request" #status><GsmsStatusTag :code="request.statut" :label="request.statut_libelle" /></template>
    <template v-if="request && canWrite && actions.length" #actions>
      <GsmsActionGate v-for="a in actions" :key="a" :decision="request.capabilities[a]" :pending="busy === a"
        :theme="a === 'REFUSEE' ? 'danger' : 'primary'" :variant="a === 'convertir' ? 'base' : 'outline'" @run="run(a)" />
    </template>
    <template v-if="request" #before>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
      <p v-if="request.conversion" class="notice">
        <t-icon name="check-circle" size="14px" />
        <span>
          {{ t('gsms.commercial.demandes.convertieLe', { date: fmtDateTime(request.conversion.le) }) }}
          <router-link v-if="request.conversion.stagiaire" :to="`/platform/stagiaires/${request.conversion.stagiaire.id}`">{{ request.conversion.stagiaire.nom }}</router-link>
          <template v-if="request.conversion.session">
            · <router-link :to="request.conversion.inscription_id ? `/platform/sessions/${request.conversion.session.id}/inscriptions/${request.conversion.inscription_id}` : `/platform/sessions/${request.conversion.session.id}`">
              {{ t('gsms.commercial.demandes.inscritA', { session: request.conversion.session.reference }) }}</router-link>
          </template>
          <template v-else> · {{ t('gsms.commercial.demandes.sansInscription') }}</template>
        </span>
      </p>
      <p v-if="request.stagiaire_existant" class="notice">
        <t-icon name="info-circle" size="14px" />
        <span>{{ t('gsms.commercial.demandes.stagiaireExistant') }}
          <router-link :to="`/platform/stagiaires/${request.stagiaire_existant.id}`">{{ request.stagiaire_existant.nom }}</router-link></span>
      </p>
      <p v-if="request.motif_refus" class="notice notice--danger">
        <t-icon name="close-circle" size="14px" /><span>{{ t('gsms.commercial.demandes.motifRefus', { motif: request.motif_refus }) }}</span>
      </p>
    </template>

    <template v-if="request" #side>
      <section class="side-section">
        <h3 class="side-head"><GsmsPersonAvatar :name="fullName" :photo="candidatePhoto" :size="40" />{{ t('gsms.commercial.demandes.candidat') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.commercial.demandes.civilite') }}</dt><dd>{{ request.civilite_libelle || '—' }}</dd></div>
          <div v-if="request.nom_usage"><dt>{{ t('gsms.commercial.demandes.nomNaissance') }}</dt><dd>{{ request.nom }}</dd></div>
          <div><dt>{{ t('gsms.parcours.email') }}</dt><dd>{{ request.email }}</dd></div>
          <div><dt>{{ t('gsms.parcours.telephone') }}</dt><dd>{{ request.telephone || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.adresse') }}</dt><dd>{{ address || '—' }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.demandes.naissance') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.commercial.demandes.neLe') }}</dt><dd>{{ fmtDate(request.naissance.date) }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.lieuNaissance') }}</dt><dd>{{ birthPlace || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.nationalite') }}</dt><dd class="with-flag"><img v-if="nationalityFlag(request.nationalite)" :src="nationalityFlag(request.nationalite)!" alt="" class="flag" />{{ request.nationalite || '—' }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.commercial.demandes.suivi') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.commercial.demandes.colRecue') }}</dt><dd>{{ fmtDateTime(request.recue_le) }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.origine') }}</dt><dd>{{ request.origine || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.statutChangeLe') }}</dt><dd>{{ fmtDateTime(request.statut_change_le) }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.traiteePar') }}</dt><dd>{{ request.traitee_par || '—' }}</dd></div>
        </dl>
      </section>
    </template>

    <template v-if="request">
      <!-- Demande telle que saisie sur le site -->
      <section v-if="tab === 'demande'" class="panel">
        <h3 class="title">{{ t('gsms.commercial.demandes.formationSouhaitee') }}</h3>
        <dl class="kv">
          <div><dt>{{ t('gsms.commercial.demandes.colFormation') }}</dt><dd>
            <router-link v-if="request.formation.id" :to="`/platform/formations/${request.formation.id}`" class="link">{{ request.formation.nom }}</router-link>
            <template v-else>{{ request.formation.nom || '—' }}</template></dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.sessionSouhaitee') }}</dt><dd>{{ request.session_souhaitee || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.colFinancement') }}</dt><dd>{{ request.financement || '—' }}</dd></div>
          <div><dt>{{ t('gsms.commercial.demandes.situation') }}</dt><dd>{{ request.situation || '—' }}</dd></div>
        </dl>
        <template v-if="request.experience">
          <h3 class="title">{{ t('gsms.commercial.demandes.experience') }}</h3>
          <p class="text">{{ request.experience }}</p>
        </template>
        <template v-if="request.motivation">
          <h3 class="title">{{ t('gsms.commercial.demandes.motivation') }}</h3>
          <p class="text">{{ request.motivation }}</p>
        </template>
      </section>

      <!-- Déclarations cochées sur le formulaire, avec leur horodatage -->
      <section v-else-if="tab === 'declarations'" class="panel">
        <p class="muted">{{ t('gsms.commercial.demandes.declarationsLe', { date: fmtDateTime(request.declarations_le) }) }}</p>
        <ul class="rows">
          <li v-for="d in request.declarations" :key="d.code" class="row">
            <t-icon :name="d.cochee ? 'check-circle-filled' : 'close-circle'" :class="d.cochee ? 'ok' : 'ko'" size="16px" />
            <span class="row-main">{{ d.libelle }}</span>
            <span class="muted">{{ d.cochee ? t('gsms.commercial.demandes.cochee') : t('gsms.commercial.demandes.nonCochee') }}</span>
          </li>
        </ul>
      </section>

      <!-- Sessions inscriptibles de la formation, avec la décision d'inscription de l'API -->
      <section v-else class="panel">
        <p v-if="!request.sessions_proposees.length" class="muted">{{ t('gsms.commercial.demandes.aucuneSession') }}</p>
        <ul v-else class="rows">
          <li v-for="s in request.sessions_proposees" :key="s.id" class="row">
            <router-link :to="`/platform/sessions/${s.id}`" class="row-main link">{{ s.reference }}</router-link>
            <span class="muted">{{ fmtDate(s.debut) }} → {{ fmtDate(s.fin) }}<template v-if="s.lieu"> · {{ s.lieu }}</template></span>
            <span class="muted">{{ s.places ? t('gsms.commercial.demandes.inscritsPlaces', { n: s.inscrits, total: s.places }) : t('gsms.commercial.demandes.inscrits', { n: s.inscrits }) }}</span>
            <GsmsStatusTag :code="s.statut" />
            <span v-if="!s.inscription.allowed" class="refused">{{ s.inscription.message }}</span>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="refuseVisible" :title="t('gsms.commercial.demandes.refuser')" :confirm-label="t('gsms.commercial.demandes.refuser')" danger
    :consequence="t('gsms.commercial.demandes.refuserAide')" :fields="request?.capabilities.REFUSEE.a_saisir ?? ['motif']"
    :run="(v) => setPreinscriptionStatus(id, 'REFUSEE', v.motif)" @done="refresh" />

  <t-dialog v-model:visible="convertVisible" :header="t('gsms.commercial.demandes.convertir')" width="min(560px, calc(100vw - 32px))" attach="body" destroy-on-close
    :confirm-btn="{ content: t('gsms.commercial.demandes.convertir'), loading: converting }" :cancel-btn="{ content: t('gsms.commun.annuler') }"
    :close-on-overlay-click="!converting" @confirm="convert" @close="closeConvert" @cancel="closeConvert">
    <div v-if="request" class="convert">
      <p class="muted">{{ request.stagiaire_existant ? t('gsms.commercial.demandes.convertirExistant', { nom: request.stagiaire_existant.nom }) : t('gsms.commercial.demandes.convertirNouveau') }}</p>
      <GsmsRefusal v-if="convertError" :error="convertError" inline />
      <t-radio-group v-model="chosen" class="choices">
        <t-radio v-for="s in request.sessions_proposees" :key="s.id" :value="s.id" :disabled="!s.inscription.allowed" class="choice">
          <span class="choice-title">{{ s.reference }} · {{ fmtDate(s.debut) }} → {{ fmtDate(s.fin) }}</span>
          <span class="muted">{{ [s.lieu, s.places ? t('gsms.commercial.demandes.inscritsPlaces', { n: s.inscrits, total: s.places }) : null].filter(Boolean).join(' · ') }}</span>
          <span v-if="!s.inscription.allowed" class="refused">{{ s.inscription.message }}</span>
        </t-radio>
        <t-radio value="" class="choice"><span class="choice-title">{{ t('gsms.commercial.demandes.sansInscription') }}</span>
          <span class="muted">{{ t('gsms.commercial.demandes.sansInscriptionAide') }}</span></t-radio>
      </t-radio-group>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsActionGate from '@/components/gsms/GsmsActionGate.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog from '@/components/gsms/ActionDialog.vue'
import { convertPreinscription, getPreinscription, setPreinscriptionStatus, type PreinscriptionDetail } from '@/api/gsms/preinscriptions'
import type { Capability } from '@/api/gsms/common'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'
import { nationalityFlag } from '@/components/gsms/media'

type Action = keyof PreinscriptionDetail['capabilities']
const ACTIONS: Action[] = ['EN_COURS', 'REFUSEE', 'convertir']
const TABS = ['demande', 'declarations', 'sessions']

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const id = computed(() => String(route.params.requestId || ''))
const request = ref<PreinscriptionDetail | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'demande')
const refuseVisible = ref(false)
const convertVisible = ref(false)
const converting = ref(false)
const convertError = ref<unknown>(null)
const chosen = ref('')

// Traitement réservé à `leads.write` : sans ce droit, aucun bouton (l'API refuserait de toute façon).
const canWrite = computed(() => access.can('leads.write'))
// Les actions que l'état de la demande rend sans objet (refus INVALID_TRANSITION de l'API, seul ou parmi les
// raisons d'un refus de conversion) ne sont pas proposées.
const STATE_REFUSAL = 'INVALID_TRANSITION'
const isStateRefusal = (d: Capability | undefined) => d?.code === STATE_REFUSAL
  || (Array.isArray(d?.details) && d.details.some((x) => (x as { code?: string })?.code === STATE_REFUSAL))
const actions = computed(() => ACTIONS.filter((a) => !isStateRefusal(request.value?.capabilities[a])))

const fullName = computed(() => {
  const r = request.value
  return r ? [r.prenom, r.nom_usage || r.nom].filter(Boolean).join(' ') : ''
})
// Photo du stagiaire déjà enregistré (converti ou reconnu par l'API) ; un candidat seul garde ses initiales.
const candidatePhoto = computed(() => request.value?.conversion?.stagiaire?.photo_url ?? request.value?.stagiaire_existant?.photo_url ?? null)
const address = computed(() => {
  const a = request.value?.adresse
  return a ? [a.adresse, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : ''
})
const birthPlace = computed(() => {
  const n = request.value?.naissance
  return n ? [n.ville, n.departement ? `(${n.departement})` : null, n.pays].filter(Boolean).join(' ') : ''
})
const tabs = computed(() => [
  { value: 'demande', label: t('gsms.commercial.demandes.ongletDemande') },
  { value: 'declarations', label: t('gsms.commercial.demandes.ongletDeclarations'), count: request.value?.declarations.length },
  { value: 'sessions', label: t('gsms.commercial.demandes.ongletSessions'), count: request.value?.sessions_proposees.length },
])

async function load() {
  const asked = id.value
  if (!asked) return
  loading.value = true
  error.value = null
  try {
    const res = await getPreinscription(asked)
    if (asked !== id.value) return // réponse d'une fiche quittée entre-temps
    request.value = res
  } catch (e) {
    if (asked !== id.value) return
    error.value = e
    request.value = null
  } finally {
    loading.value = false
  }
}
watch(id, () => { actionError.value = null; access.load(); load() }, { immediate: true })
watch(tab, (v) => router.replace({ query: { ...route.query, onglet: v } }))

async function run(action: Action) {
  actionError.value = null
  if (action === 'REFUSEE') { refuseVisible.value = true; return }
  if (action === 'convertir') { openConvert(); return }
  busy.value = action
  try {
    request.value = await setPreinscriptionStatus(id.value, 'EN_COURS')
    MessagePlugin.success(t('gsms.commun.misAJour'))
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

function openConvert() {
  convertError.value = null
  // Première session que l'API accepte ; sinon, stagiaire sans inscription.
  chosen.value = request.value?.sessions_proposees.find((s) => s.inscription.allowed)?.id ?? ''
  convertVisible.value = true
}
function closeConvert() {
  if (!converting.value) convertVisible.value = false
}
async function convert() {
  converting.value = true
  convertError.value = null
  try {
    const res = await convertPreinscription(id.value, chosen.value || null)
    request.value = res
    convertVisible.value = false
    MessagePlugin.success(res.resultat.inscription_id ? t('gsms.commercial.demandes.convertieInscrit') : t('gsms.commercial.demandes.convertieSeule'))
  } catch (e) {
    convertError.value = e
  } finally {
    converting.value = false
  }
}

async function refresh() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}
</script>

<style scoped lang="less">
.with-flag { display: flex; align-items: center; gap: 6px; }
.flag { width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; }
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.side-head { display: flex; align-items: center; gap: 10px; }
.panel { .gsms-panel(); display: flex; flex-direction: column; gap: 10px; }
.title { .gsms-panel-title(); margin: 0; }
.kv { .gsms-kv(); }
.text { margin: 0; white-space: pre-line; font-size: var(--app-text-md); line-height: 20px; overflow-wrap: anywhere; }
.muted { .gsms-muted(); margin: 0; }
.notice { .gsms-notice(); a { color: var(--td-brand-color); } }
.notice--danger .t-icon { color: var(--td-error-color); }
.link { color: var(--td-brand-color); text-decoration: none; &:hover { text-decoration: underline; } }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.row-main.link { color: var(--td-brand-color); }
.ok { color: var(--td-success-color); flex-shrink: 0; }
.ko { color: var(--td-error-color); flex-shrink: 0; }
.refused { flex-basis: 100%; color: var(--td-warning-color); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.convert { display: flex; flex-direction: column; gap: 12px; }
.choices { display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: 100%; }
.choice { display: flex; align-items: flex-start; width: 100%; margin: 0; padding: 8px 10px; border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md); box-sizing: border-box;
  :deep(.t-radio__input) { flex-shrink: 0; margin-top: 3px; }
  :deep(.t-radio__label) { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; white-space: normal; } }
.choice-title { color: var(--td-text-color-primary); font-weight: 500; overflow-wrap: anywhere; }
</style>
