<template>
  <GsmsRecordSheet :title="sheet?.program.title || t('gsms.formations.fiche')" icon="book" back="/platform/formations"
    :image="sheet?.program.image_url"
    :back-label="t('gsms.formations.titre')" :subtitle="sheet?.program.code || ''"
    :ready="!!sheet" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="sheet" #status><GsmsStatusTag :code="sheet.version_state.state" /></template>
    <template v-if="sheet" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>
    <template v-if="sheet" #side>
      <section class="side-section">
        <h3 class="side-head"><FormationThumb :image="sheet.program.image_url" :size="40" />{{ t('gsms.formations.infos') }}</h3>
        <dl>
          <div><dt>{{ t('gsms.formations.colCode') }}</dt><dd>{{ sheet.program.code }}</dd></div>
          <div><dt>{{ t('gsms.formations.colDuree') }}</dt><dd>{{ hours(sheet.program.duration_hours) }}</dd></div>
          <div><dt>{{ t('gsms.formations.prix') }}</dt><dd>{{ euros(sheet.program.price_eur) }}</dd></div>
          <div><dt>{{ t('gsms.formations.modalite') }}</dt><dd>{{ (sheet.program.delivery_mode && sheet.delivery_modes[sheet.program.delivery_mode]) || '—' }}</dd></div>
          <div><dt>{{ t('gsms.formations.relueLe') }}</dt><dd>{{ fmtDate(sheet.program.public_info_reviewed_on) }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.formations.etatFiche') }}</h3>
        <p class="muted">{{ versionText }}</p>
        <template v-if="sheet.missing.length">
          <p class="muted manque-titre">{{ t('gsms.formations.rubriquesManquantes') }}</p>
          <ul class="plain manque-liens">
            <li v-for="m in sheet.missing" :key="m.field">
              <button type="button" class="link-btn" @click="tab = voletOf(m.field)">{{ m.label }}</button>
            </li>
          </ul>
        </template>
        <div class="gates">
          <GsmsActionGate :decision="sheet.capabilities.validate" show-reason :pending="busy === 'validate'" @run="validateVisible = true">
            {{ t('gsms.formations.validerVersion') }}
          </GsmsActionGate>
          <GsmsActionGate :decision="sheet.capabilities.edit" variant="outline" @run="editVisible = true">
            {{ t('gsms.formations.completer') }}
          </GsmsActionGate>
        </div>
      </section>
      <section v-if="sheet.dossier || canCreateDossier" class="side-section">
        <h3>{{ t('gsms.edof.titre') }}</h3>
        <router-link v-if="sheet.dossier" :to="`/platform/edof/dossiers/${sheet.dossier.id}`" class="link">
          {{ t('gsms.edof.ouvrirDossier') }}<t-icon name="chevron-right" size="14px" />
        </router-link>
        <t-button v-else size="small" variant="outline" :loading="busy === 'dossier'" @click="createDossier">{{ t('gsms.edof.creerDossier') }}</t-button>
      </section>
    </template>

    <template v-if="sheet">
      <!-- Ce qui manque dans le volet affiché, d'après GET /fiches/{id} -->
      <div v-if="missingIn(tab).length" class="manques" role="note">
        <t-icon name="error-circle" size="16px" />
        <span>{{ t('gsms.formations.aCompleterIci') }} {{ missingIn(tab).map((m) => m.label).join(', ') }}</span>
        <button v-if="sheet.capabilities.edit?.allowed" type="button" class="link-btn" @click="editVisible = true">{{ t('gsms.formations.completer') }}</button>
      </div>

      <!-- Présentation, pédagogie, accès : rubriques rédigées de la fiche, chacune dans son volet -->
      <div v-if="VOLETS[tab]" class="rubriques">
        <section v-for="r in VOLETS[tab]" :key="r.field" class="panel rubrique" :class="{ 'rubrique--large': r.wide }">
          <h3 class="title">{{ t(`gsms.formations.champs.${r.field}`) }}</h3>
          <template v-if="r.list">
            <ul v-if="listOf(r.field).length" class="plain bullets rubrique-text"><li v-for="(x, i) in listOf(r.field)" :key="i">{{ x }}</li></ul>
            <p v-else class="rubrique-empty">{{ t('gsms.commun.nonRenseigne') }}</p>
          </template>
          <template v-else>
            <p v-if="sheet.program[r.field]" class="rubrique-text pre">{{ sheet.program[r.field] }}</p>
            <p v-else class="rubrique-empty">{{ t('gsms.commun.nonRenseigne') }}</p>
          </template>
        </section>
        <p v-if="tab === 'acces'" class="muted rubrique--large">{{ t('gsms.formations.accesAide') }}</p>
      </div>

      <!-- Programme : un module par carte -->
      <template v-else-if="tab === 'programme'">
        <p v-if="!sheet.program.modules.length" class="panel muted">{{ t('gsms.formations.aucunModule') }}</p>
        <ol v-else class="modules">
          <li v-for="(m, i) in sheet.program.modules" :key="i" class="panel module">
            <div class="module-head">
              <span v-if="m.code" class="module-code">{{ m.code }}</span>
              <span class="module-title">{{ m.title }}</span>
              <span v-if="m.hours" class="muted">{{ hours(Number(m.hours)) }}</span>
            </div>
            <ul v-if="m.details?.length" class="plain bullets"><li v-for="(d, j) in m.details" :key="j">{{ d }}</li></ul>
            <p v-else class="rubrique-empty">{{ t('gsms.formations.moduleSansDetail') }}</p>
          </li>
        </ol>
      </template>

      <!-- Points relevés à l'import : valeurs reprises ou rédigées à relire, écarts à arbitrer -->
      <section v-else-if="tab === 'relire'" class="panel">
        <p class="muted aide">{{ t('gsms.formations.aRelireAide') }}</p>
        <p v-if="!notes.length" class="muted">{{ t('gsms.formations.aucunPointARelire') }}</p>
        <div v-for="g in notes" :key="g.champ" class="note-groupe">
          <h3 class="title">{{ g.label }}</h3>
          <ul class="plain notes">
            <li v-for="(n, i) in g.items" :key="i">{{ n.message }}<span v-if="n.source" class="muted note-source">{{ n.source }}</span></li>
          </ul>
        </div>
      </section>

      <!-- Certification visée et vérifications attestées -->
      <section v-else-if="tab === 'certification'" class="panel">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.formations.certificationVisee') }}</h3>
          <GsmsActionGate :decision="sheet.capabilities.edit" variant="outline" @run="certVisible = true">{{ t('gsms.commun.modifier') }}</GsmsActionGate>
        </div>
        <p v-if="!cert" class="muted">{{ t('gsms.formations.certificationAbsente') }}</p>
        <template v-else>
          <dl class="kv">
            <div><dt>{{ t('gsms.formations.cert.basis') }}</dt><dd>{{ sheet.certification_bases[cert.basis] || cert.basis }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.code') }}</dt><dd>{{ cert.code || '—' }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.title') }}</dt><dd>{{ cert.title || '—' }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.certifier') }}</dt><dd>{{ cert.certifier || '—' }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.registration_end') }}</dt><dd>{{ fmtDate(cert.registration_end) }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.verifiee') }}</dt><dd>{{ cert.checked_on ? t('gsms.formations.leParPar', { le: fmtDate(cert.checked_on), par: cert.checked_by || '—' }) : t('gsms.formations.nonVerifiee') }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.habilitation') }}</dt><dd>{{ sheet.habilitations[cert.habilitation] || cert.habilitation }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.evaluator_name') }}</dt><dd>{{ cert.evaluator_name || '—' }}</dd></div>
            <div><dt>{{ t('gsms.formations.cert.habilitationVerifiee') }}</dt><dd>{{ cert.habilitation_checked_on ? t('gsms.formations.leParPar', { le: fmtDate(cert.habilitation_checked_on), par: cert.habilitation_checked_by || '—' }) : t('gsms.formations.nonVerifiee') }}</dd></div>
          </dl>
          <p v-if="cert.source_url" class="muted source">{{ t('gsms.formations.cert.source_url') }} : {{ cert.source_url }}</p>
          <h4 class="sous-titre">{{ t('gsms.formations.champs.certification_alignment') }}</h4>
          <p v-if="sheet.program.certification_alignment" class="rubrique-text pre">{{ sheet.program.certification_alignment }}</p>
          <p v-else class="rubrique-empty">{{ t('gsms.commun.nonRenseigne') }}</p>
          <div class="gates row-gates">
            <GsmsActionGate :decision="sheet.capabilities.verify" show-reason :pending="busy === 'certification'" @run="verify('certification')">
              {{ t('gsms.formations.attesterCertification') }}
            </GsmsActionGate>
            <GsmsActionGate :decision="sheet.capabilities.verify" show-reason variant="outline" :pending="busy === 'habilitation'" @run="verify('habilitation')">
              {{ t('gsms.formations.attesterHabilitation') }}
            </GsmsActionGate>
          </div>
        </template>
      </section>

      <!-- Contenus : intervenants et ressources pédagogiques -->
      <template v-else-if="tab === 'contenus'">
        <section class="panel">
          <h3 class="title">{{ t('gsms.formations.intervenants') }}</h3>
          <p v-if="!sheet.trainers.length" class="muted">{{ t('gsms.formations.aucunIntervenant') }}</p>
          <ul v-else class="rows">
            <li v-for="tr in sheet.trainers" :key="tr.id" class="row">
              <GsmsPersonAvatar :name="tr.name" :photo="tr.photo_url" />
              <span class="row-main">{{ tr.name }}</span>
              <span class="muted">{{ sheet.roles[tr.role] || tr.role }}<template v-if="tr.modules.length"> · {{ tr.modules.join(', ') }}</template></span>
            </li>
          </ul>
        </section>
        <section class="panel">
          <h3 class="title">{{ t('gsms.formations.ressources') }}</h3>
          <p v-if="!sheet.resources.length" class="muted">{{ t('gsms.formations.aucuneRessource') }}</p>
          <ul v-else class="rows">
            <li v-for="r in sheet.resources" :key="r.id" class="row">
              <span class="row-main">{{ r.title }}</span>
              <span class="muted">{{ [r.kind, r.module_code, r.origin].filter(Boolean).join(' · ') }}</span>
              <GsmsStatusTag :code="r.status" />
            </li>
          </ul>
        </section>
      </template>

      <!-- Versions validées : programme imprimable -->
      <section v-else-if="tab === 'versions'" class="panel">
        <p v-if="!sheet.versions.length" class="muted">{{ t('gsms.formations.aucuneVersion') }}</p>
        <ul v-else class="rows">
          <li v-for="v in sheet.versions" :key="v.id" class="row">
            <span class="row-main">{{ t('gsms.formations.versionN', { n: v.version }) }}</span>
            <span class="muted">{{ t('gsms.formations.leParPar', { le: fmtDateTime(v.validated_at), par: v.validated_by || '—' }) }}<template v-if="v.note"> · {{ v.note }}</template></span>
            <t-button size="small" variant="text" theme="primary" :loading="busy === v.id" @click="download(v.id, v.version)">
              <t-icon name="download" />{{ t('gsms.formations.programme') }}
            </t-button>
          </li>
        </ul>
      </section>

      <!-- Suivi pédagogique des sessions de la formation -->
      <section v-else class="panel">
        <GsmsRefusal v-if="pedagogyError" :error="pedagogyError" inline />
        <t-skeleton v-else-if="!pedagogy" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <template v-else>
          <p v-if="!pedagogy.sessions.length" class="muted">{{ t('gsms.formations.aucuneSession') }}</p>
          <ul v-else class="rows">
            <li v-for="s in pedagogy.sessions" :key="s.session_id">
              <router-link :to="`/platform/sessions/${s.session_id}`" class="row row--link">
                <span class="row-main">{{ s.reference }}</span>
                <span class="muted">{{ fmtDate(s.start_date) }} → {{ fmtDate(s.end_date) }}</span>
                <span class="muted">{{ t('gsms.formations.suiviLigne', { n: s.learners, att: s.attendance.rate ?? '—', cert: s.certificates, ab: s.abandons }) }}</span>
                <GsmsStatusTag :code="s.status" />
              </router-link>
            </li>
          </ul>
          <ul v-if="pedagogy.limits.length" class="plain limits"><li v-for="(l, i) in pedagogy.limits" :key="i"><t-icon name="info-circle" size="14px" /> {{ l }}</li></ul>
        </template>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="validateVisible" :title="t('gsms.formations.validerVersion')" :confirm-label="t('gsms.formations.valider')"
    danger :consequence="t('gsms.formations.validerAide')" :fields="[{ name: 'note', label: t('gsms.formations.noteVersion'), type: 'textarea' }]"
    :run="(v) => validateProgramVersion(id, v.note)" @done="done" />
  <ActionDialog v-if="sheet" v-model:visible="certVisible" :title="t('gsms.formations.certificationVisee')" :intro="t('gsms.formations.certAide')"
    :fields="certFields" :run="(v) => putProgramCertification(id, v)" @done="done" />
  <ActionDialog v-if="sheet" v-model:visible="editVisible" :title="t('gsms.formations.completer')" :intro="t('gsms.formations.completerAide')"
    :fields="editFields" :run="saveProgram" @done="done" />
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
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import FormationThumb from './FormationThumb.vue'
import {
  attestProgramVerification, getProgramPedagogy, getProgramSheet, programmePath, putProgramCertification, updateProgram,
  validateProgramVersion, type ProgramPedagogy, type ProgramSheet,
} from '@/api/gsms/training'
import { createEdofFormationDossier } from '@/api/gsms/edof'
import { downloadFile } from '@/api/gsms/files'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { fmtDate, fmtDateTime } from '@/components/gsms/format'
import { euros, hours } from './display'

type ListField = 'objectives' | 'skills' | 'prerequisites'
interface Rubrique { field: string, list?: boolean, wide?: boolean }
/** Rubriques rédigées, rangées par volet ; une rubrique `wide` prend toute la largeur. */
const VOLETS: Record<string, Rubrique[]> = {
  presentation: [
    { field: 'content', wide: true },
    { field: 'objectives', list: true },
    { field: 'skills', list: true },
    { field: 'audience' },
    { field: 'prerequisites', list: true },
  ],
  pedagogie: [{ field: 'teaching_methods' }, { field: 'evaluation_methods' }, { field: 'teaching_means', wide: true }],
  acces: [{ field: 'access_delay' }, { field: 'accessibility_info' }],
}
/** Volet où compléter une rubrique signalée manquante par l'API ; à défaut, la présentation. */
const VOLET_OF: Record<string, string> = {
  ...Object.fromEntries(Object.entries(VOLETS).flatMap(([v, rs]) => rs.map((r) => [r.field, v]))),
  modules: 'programme', certification_alignment: 'certification',
}
const TABS = ['presentation', 'programme', 'pedagogie', 'acces', 'certification', 'contenus', 'relire', 'versions', 'sessions']

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
const id = computed(() => String(route.params.programId || ''))
const sheet = ref<ProgramSheet | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'presentation')
const pedagogy = ref<ProgramPedagogy | null>(null)
const pedagogyError = ref<unknown>(null)
const validateVisible = ref(false)
const certVisible = ref(false)
const editVisible = ref(false)

const cert = computed(() => sheet.value?.certification ?? null)
// Affichage du bouton seulement : l'API revérifie le droit et refuse un second dossier (409).
const canCreateDossier = computed(() => access.hasFeature('edof') && access.can('edof.write'))
const tabs = computed(() => [
  { value: 'presentation', label: t('gsms.formations.ongletPresentation') },
  { value: 'programme', label: t('gsms.formations.ongletProgramme'), count: sheet.value?.program.modules.length },
  { value: 'pedagogie', label: t('gsms.formations.ongletPedagogie') },
  { value: 'acces', label: t('gsms.formations.ongletAcces') },
  { value: 'certification', label: t('gsms.formations.ongletCertification') },
  { value: 'contenus', label: t('gsms.formations.ongletContenus'), count: (sheet.value?.trainers.length ?? 0) + (sheet.value?.resources.length ?? 0) },
  { value: 'relire', label: t('gsms.formations.ongletARelire'), count: reviewNotes.value.length },
  { value: 'versions', label: t('gsms.formations.ongletVersions'), count: sheet.value?.versions.length },
  { value: 'sessions', label: t('gsms.formations.ongletSuivi') },
])
const voletOf = (field: string) => VOLET_OF[field] ?? 'presentation'
const missingIn = (volet: string) => (sheet.value?.missing ?? []).filter((m) => voletOf(m.field) === volet)
const listOf = (field: string) => (sheet.value?.program[field as ListField] as string[] | undefined) ?? []

interface ReviewNote { champ?: string, message: string, source?: string }
const reviewNotes = computed(() => (sheet.value?.program.review_notes as ReviewNote[] | undefined) ?? [])
/** Notes regroupées par rubrique, dans l'ordre où elles apparaissent. */
const notes = computed(() => {
  const groups = new Map<string, ReviewNote[]>()
  for (const n of reviewNotes.value) {
    const key = n.champ || ''
    groups.set(key, [...(groups.get(key) ?? []), n])
  }
  return [...groups].map(([champ, items]) => ({
    champ,
    label: champ && te(`gsms.formations.champs.${champ}`) ? t(`gsms.formations.champs.${champ}`) : t('gsms.formations.ficheEnGeneral'),
    items,
  }))
})
const versionText = computed(() => {
  const v = sheet.value?.version_state
  if (!v || v.version === null) return t('gsms.formations.jamaisValidee')
  return t(v.state === 'VALIDEE' ? 'gsms.formations.versionAJour' : 'gsms.formations.versionModifiee', { n: v.version })
})
const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
const certFields = computed<ActionField[]>(() => {
  const c = cert.value
  return [
    { name: 'basis', label: t('gsms.formations.cert.basis'), type: 'select', options: options(sheet.value?.certification_bases ?? {}), initial: c?.basis },
    { name: 'code', label: t('gsms.formations.cert.code'), initial: c?.code },
    { name: 'title', label: t('gsms.formations.cert.title'), initial: c?.title },
    { name: 'certifier', label: t('gsms.formations.cert.certifier'), initial: c?.certifier },
    { name: 'registration_end', label: t('gsms.formations.cert.registration_end'), type: 'date', initial: c?.registration_end },
    { name: 'source_url', label: t('gsms.formations.cert.source_url'), initial: c?.source_url },
    { name: 'habilitation', label: t('gsms.formations.cert.habilitation'), type: 'select', options: options(sheet.value?.habilitations ?? {}), initial: c?.habilitation },
    { name: 'evaluator_name', label: t('gsms.formations.cert.evaluator_name'), initial: c?.evaluator_name },
  ]
})
const editFields = computed<ActionField[]>(() => {
  const p = sheet.value?.program
  return [
    { name: 'content', label: t('gsms.formations.champs.content'), type: 'textarea', initial: p?.content },
    { name: 'objectives', label: t('gsms.formations.champs.objectivesUneParLigne'), type: 'textarea', initial: p?.objectives.join('\n') },
    { name: 'skills', label: t('gsms.formations.champs.skillsUneParLigne'), type: 'textarea', initial: p?.skills.join('\n') },
    { name: 'audience', label: t('gsms.formations.champs.audience'), type: 'textarea', initial: p?.audience },
    { name: 'prerequisites', label: t('gsms.formations.champs.prerequisitesUneParLigne'), type: 'textarea', initial: p?.prerequisites.join('\n') },
    { name: 'delivery_mode', label: t('gsms.formations.modalite'), type: 'select', options: options(sheet.value?.delivery_modes ?? {}), initial: p?.delivery_mode },
    { name: 'teaching_methods', label: t('gsms.formations.champs.teaching_methods'), type: 'textarea', initial: p?.teaching_methods },
    { name: 'teaching_means', label: t('gsms.formations.champs.teaching_means'), type: 'textarea', initial: p?.teaching_means },
    { name: 'evaluation_methods', label: t('gsms.formations.champs.evaluation_methods'), type: 'textarea', initial: p?.evaluation_methods },
    { name: 'access_delay', label: t('gsms.formations.champs.access_delay'), initial: p?.access_delay },
    { name: 'accessibility_info', label: t('gsms.formations.champs.accessibility_info'), type: 'textarea', initial: p?.accessibility_info },
    { name: 'certification_alignment', label: t('gsms.formations.champs.certification_alignment'), type: 'textarea', initial: p?.certification_alignment },
  ]
})

async function load() {
  const pid = id.value
  if (!pid) return
  loading.value = true
  error.value = null
  try {
    const res = await getProgramSheet(pid)
    if (pid === id.value) sheet.value = res
  } catch (e) {
    if (pid === id.value) { error.value = e; sheet.value = null }
  } finally {
    loading.value = false
  }
}

async function loadPedagogy() {
  const pid = id.value
  pedagogyError.value = null
  try {
    const res = await getProgramPedagogy(pid)
    if (pid === id.value) pedagogy.value = res
  } catch (e) { if (pid === id.value) pedagogyError.value = e }
}

watch(id, () => { actionError.value = null; pedagogy.value = null; load(); if (tab.value === 'sessions') loadPedagogy() }, { immediate: true })
watch(tab, (v) => {
  router.replace({ query: { ...route.query, onglet: v } })
  if (v === 'sessions' && !pedagogy.value) loadPedagogy()
})

async function done() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}

/** Objectifs, compétences et prérequis se saisissent un par ligne ; l'API attend des listes. */
function saveProgram(values: Record<string, unknown>) {
  const body = { ...values }
  for (const key of ['objectives', 'skills', 'prerequisites'] as const) {
    if (key in body) body[key] = String(body[key] ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  }
  return updateProgram(id.value, body)
}

async function verify(quoi: 'certification' | 'habilitation') {
  busy.value = quoi
  actionError.value = null
  try {
    await attestProgramVerification(id.value, quoi)
    await done()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function download(versionId: string, version: number) {
  busy.value = versionId
  actionError.value = null
  try {
    await downloadFile(programmePath(id.value, versionId), `programme-${sheet.value?.program.code ?? ''}-v${version}.html`)
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

async function createDossier() {
  busy.value = 'dossier'
  actionError.value = null
  try {
    const d = await createEdofFormationDossier(id.value)
    router.push(`/platform/edof/dossiers/${d.id}`)
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
.side-head { display: flex; align-items: center; gap: 10px; }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); }
.panel-bar { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; .title { margin: 0; } margin-bottom: 10px; }
.muted { .gsms-muted(); margin: 0; }
.kv { .gsms-kv(); }
.pre { white-space: pre-line; }
.rubriques {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
  @media (max-width: 720px) { grid-template-columns: minmax(0, 1fr); }
}
.rubrique .title { margin-bottom: 8px; }
.rubrique--large { grid-column: 1 / -1; }
.manques {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 16px; padding: 10px 14px;
  border: 1px solid var(--td-error-color-3); border-radius: var(--td-radius-medium); color: var(--td-text-color-primary);
  font-size: var(--app-text-sm); .t-icon { color: var(--td-error-color); }
}
.manque-titre { margin-top: 10px; }
.manque-liens { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 4px 0 0; }
.modules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none;
  @media (max-width: 720px) { grid-template-columns: minmax(0, 1fr); } }
.module-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 8px; }
.module-code { padding: 1px 8px; border-radius: var(--td-radius-small); background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary); font-size: var(--app-text-sm); font-weight: 600; }
.module .bullets { color: var(--td-text-color-primary); font-size: var(--app-text-md); line-height: 22px; }
.sous-titre { margin: 16px 0 6px; font-size: var(--app-text-md); font-weight: 600; color: var(--td-text-color-primary); }
.aide { margin-bottom: 12px; }
.note-groupe + .note-groupe { margin-top: 16px; }
.notes { display: flex; flex-direction: column; gap: 8px; li { line-height: 22px; } }
.note-source { display: block; font-size: var(--app-text-sm); }
.rubrique-text { margin: 0; max-width: 70ch; color: var(--td-text-color-primary); font-size: var(--app-text-md); line-height: 22px; overflow-wrap: break-word; }
.rubrique-empty { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; color: var(--td-text-color-placeholder); font-size: var(--app-text-sm); }
.link-btn { .gsms-link-button(); }
.plain { .gsms-plain(); }
.bullets { list-style: disc; padding-left: 18px; }
.gates { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.row-gates { flex-direction: row; flex-wrap: wrap; }
.source { margin-top: 10px; overflow-wrap: anywhere; }
.link { display: inline-flex; align-items: center; gap: 4px; color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
.module-title { font-weight: 600; font-size: var(--app-text-md); color: var(--td-text-color-primary); }
.rows { .gsms-rows(); }
.row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 10px 14px; color: inherit; text-decoration: none; }
.row--link { &:hover { background: var(--td-bg-color-container-hover); } &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere; }
.limits { margin-top: 10px; color: var(--td-text-color-secondary); }
</style>
