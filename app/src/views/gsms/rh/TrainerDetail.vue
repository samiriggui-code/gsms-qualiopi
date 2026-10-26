<template>
  <GsmsRecordSheet :title="trainer?.full_name || t('gsms.rh.fiche.formateur')" icon="user-talk" back="/platform/formateurs"
    :avatar-name="trainer?.full_name" :avatar-email="trainer?.email"
    :back-label="t('gsms.rh.formateurs.titre')" :subtitle="trainer?.specialties.join(' · ') || ''"
    :ready="!!trainer" :loading="loading" :error="error" :tabs="tabs" :tab="tab" @update:tab="(v) => (tab = v)" @retry="load">
    <template v-if="trainer" #status>
      <t-tag variant="light" size="small">{{ trainer.is_external ? t('gsms.rh.formateurs.externe') : t('gsms.rh.formateurs.interne') }}</t-tag>
    </template>
    <template v-if="trainer && canWrite" #actions>
      <t-button size="small" variant="outline" @click="editVisible = true">{{ t('gsms.commun.modifier') }}</t-button>
      <t-button size="small" variant="outline" theme="danger" @click="remove">{{ t('gsms.commun.supprimer') }}</t-button>
    </template>
    <template v-if="trainer" #before><GsmsRefusal v-if="actionError" :error="actionError" inline /></template>

    <template v-if="trainer" #side>
      <section class="side-section">
        <div class="identity">
          <GsmsPersonAvatar :name="trainer.full_name" :size="48" />
          <span class="identity-name">{{ trainer.full_name }}</span>
        </div>
        <dl>
          <div><dt>{{ t('gsms.rh.formateurs.email') }}</dt><dd>{{ trainer.email || '—' }}</dd></div>
          <div><dt>{{ t('gsms.rh.formateurs.statut') }}</dt><dd>{{ trainer.is_external ? t('gsms.rh.formateurs.externe') : t('gsms.rh.formateurs.interne') }}</dd></div>
          <div><dt>{{ t('gsms.rh.formateurs.specialites') }}</dt><dd>{{ trainer.specialties.join(', ') || '—' }}</dd></div>
          <div><dt>{{ t('gsms.rh.formateurs.sessions') }}</dt><dd>{{ trainer.sessions }}</dd></div>
          <div><dt>{{ t('gsms.rh.formateurs.titres') }}</dt><dd>{{ trainer.qualifications }}</dd></div>
        </dl>
      </section>
      <section class="side-section">
        <h3>{{ t('gsms.rh.fiche.compte') }}</h3>
        <p class="muted">{{ t('gsms.rh.fiche.compteAide') }}</p>
        <dl>
          <div><dt>{{ t('gsms.rh.fiche.compteRelie') }}</dt><dd>{{ accountText }}</dd></div>
        </dl>
        <div v-if="canManageUsers" class="side-actions">
          <t-button size="small" variant="outline" @click="openAccount">{{ trainer.user_id ? t('gsms.rh.fiche.changerCompte') : t('gsms.rh.fiche.relierCompte') }}</t-button>
          <t-button v-if="trainer.user_id" size="small" variant="text" theme="danger" :loading="busy === 'unlink'" @click="unlink">{{ t('gsms.rh.fiche.delier') }}</t-button>
        </div>
      </section>
    </template>

    <template v-if="trainer">
      <!-- Titres et habilitations : échéances (état décidé par GET /rh/echeances) -->
      <section v-if="tab === 'titres'" class="panel">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.rh.fiche.titres') }}</h3>
          <t-button v-if="canWrite" size="small" @click="openTitle(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.rh.fiche.ajouterTitre') }}</t-button>
        </div>
        <GsmsRefusal v-if="titlesError" :error="titlesError" inline />
        <t-skeleton v-else-if="!titles" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!titles.length" class="muted">{{ t('gsms.rh.fiche.aucunTitre') }}</p>
        <ul v-else class="rows">
          <li v-for="q in titles" :key="q.id" class="row">
            <div class="row-head">
              <span class="row-main">{{ q.label }}</span>
              <GsmsStatusTag v-if="deadlineOf(q)" :code="deadlineOf(q)!.etat" />
            </div>
            <p class="muted">
              {{ kindLabel(q.kind) }}<template v-if="q.number"> · {{ t('gsms.rh.fiche.numero', { n: q.number }) }}</template>
              <template v-if="q.obtained_on"> · {{ t('gsms.rh.fiche.obtenuLe', { date: fmtDate(q.obtained_on) }) }}</template>
            </p>
            <p class="deadline" :class="{ 'deadline--late': deadlineOf(q)?.etat === 'EXPIRE' }">
              <t-icon name="time" />{{ q.valid_until ? t('gsms.rh.fiche.valableJusquau', { date: fmtDate(q.valid_until) }) : t('gsms.rh.fiche.sansEcheance') }}
            </p>
            <div class="row-actions">
              <t-button v-if="q.document_id" size="small" variant="text" theme="primary" @click="downloadProof(q)">{{ t('gsms.rh.fiche.justificatif') }}</t-button>
              <GsmsRowActions v-if="canWrite" :delete-title="t('gsms.rh.fiche.supprimerTitre')" @edit="openTitle(q)" :remove="() => removeTitle(q)" />
            </div>
          </li>
        </ul>
        <GsmsRefusal v-if="deadlinesError" :error="deadlinesError" inline />
        <p v-else-if="titles?.length" class="muted legend">{{ t('gsms.rh.fiche.echeancesAide') }}</p>
      </section>

      <TrainerDossier v-else-if="tab === 'dossier'" :trainer-id="id" :can-write="canWrite" />

      <section v-else-if="tab === 'sessions'" class="panel">
        <h3 class="title">{{ t('gsms.rh.fiche.sessions') }}</h3>
        <GsmsRefusal v-if="sessionsError" :error="sessionsError" inline />
        <t-skeleton v-else-if="!sessions" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!sessions.length" class="muted">{{ t('gsms.rh.fiche.aucuneSession') }}</p>
        <ul v-else class="rows">
          <li v-for="s in sessions" :key="s.id">
            <router-link :to="`/platform/sessions/${s.id}`" class="row row--link">
              <span class="row-main">{{ s.reference }}<span class="muted"> · {{ s.program_title || s.program_code }}</span></span>
              <span class="muted">{{ fmtDate(s.start_date) }} → {{ fmtDate(s.end_date) }}</span>
              <GsmsStatusTag :code="s.status" />
              <t-icon name="chevron-right" class="row-chevron" />
            </router-link>
          </li>
        </ul>
      </section>

      <section v-else class="panel">
        <div class="panel-bar">
          <h3 class="title">{{ t('gsms.rh.fiche.developpement') }}</h3>
          <router-link to="/platform/developpement" class="more">{{ t('gsms.rh.fiche.voirDeveloppement') }}</router-link>
        </div>
        <GsmsRefusal v-if="devError" :error="devError" inline />
        <t-skeleton v-else-if="!dev" animation="gradient" :row-col="[{ width: '100%' }, { width: '100%' }]" />
        <p v-else-if="!dev.length" class="muted">{{ t('gsms.rh.developpement.aucune') }}</p>
        <ul v-else class="rows">
          <li v-for="d in dev" :key="d.id" class="row">
            <div class="row-head">
              <span class="row-main">{{ d.label }}</span>
              <t-tag :theme="d.completed_on ? 'success' : 'default'" variant="light" size="small">
                {{ d.completed_on ? t('gsms.rh.developpement.realiseeLe', { date: fmtDate(d.completed_on) }) : t('gsms.rh.developpement.nonRealisee') }}
              </t-tag>
            </div>
            <p class="muted">{{ t('gsms.rh.developpement.prevueLe', { date: fmtDate(d.planned_on) }) }}</p>
          </li>
        </ul>
      </section>
    </template>
  </GsmsRecordSheet>

  <ActionDialog v-model:visible="editVisible" :title="t('gsms.rh.fiche.modifier')" :fields="trainerFields(trainer)"
    :run="(v) => updateTrainer(id, trainerPayload(v))" @done="saved" />
  <ActionDialog v-model:visible="titleForm.visible" :title="titleForm.row ? t('gsms.rh.fiche.modifierTitre') : t('gsms.rh.fiche.ajouterTitre')"
    :intro="titleForm.row ? t('gsms.rh.fiche.modifierTitreAide') : ''" :fields="titleFields" :run="saveTitle" @done="titleSaved" />
  <ActionDialog v-model:visible="accountVisible" :title="t('gsms.rh.fiche.relierCompte')" :intro="t('gsms.rh.fiche.compteAide')"
    :fields="[{ name: 'user_id', label: t('gsms.rh.fiche.compte'), type: 'select', options: userOptions, initial: trainer?.user_id ?? undefined }]"
    :run="(v) => linkTrainerAccount(id, v.user_id ?? null)" @done="saved">
    <GsmsRefusal v-if="usersError" :error="usersError" inline />
  </ActionDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { confirmCritical } from '@/components/gsms/critical'
import GsmsRecordSheet from '@/components/gsms/GsmsRecordSheet.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsStatusTag from '@/components/gsms/GsmsStatusTag.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import TrainerDossier from './TrainerDossier.vue'
import {
  addQualification, deleteQualification, deleteTrainer, getTrainer, linkTrainerAccount, listQualifications,
  listStaffDevelopment, listTitleDeadlines, updateQualification, updateTrainer,
  type StaffDevelopment, type TitleDeadline, type Trainer, type TrainerQualification,
} from '@/api/gsms/rh'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { listUsers, type UserOut } from '@/api/gsms/auth'
import { downloadDocument } from '@/api/gsms/dossiers'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'
import { fmtDate, refusalText } from '@/components/gsms/format'
import { trainerFields, trainerPayload } from './forms'

const TABS = ['titres', 'dossier', 'sessions', 'developpement']

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const access = useGsmsAccessStore()
// Types de titre acceptés par l'API (GET /listes-de-valeurs) ; c'est elle qui les vérifie.
const valueLists = useGsmsValueListsStore()
const kindLabel = (kind: string) => valueLists.label('types_de_titre', kind)
const id = computed(() => String(route.params.trainerId || ''))
// Ressources sans `capabilities` : les boutons suivent les permissions des routes (trainers.write, users.manage).
const canWrite = computed(() => access.can('trainers.write'))
const canManageUsers = computed(() => access.can('users.manage'))

const trainer = ref<Trainer | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const busy = ref('')
const tab = ref(TABS.includes(String(route.query.onglet)) ? String(route.query.onglet) : 'titres')

const titles = ref<TrainerQualification[] | null>(null)
const titlesError = ref<unknown>(null)
const deadlines = ref<TitleDeadline[]>([])
const deadlinesError = ref<unknown>(null)
const sessions = ref<SessionRow[] | null>(null)
const sessionsError = ref<unknown>(null)
const dev = ref<StaffDevelopment[] | null>(null)
const devError = ref<unknown>(null)
const users = ref<UserOut[] | null>(null)
const usersError = ref<unknown>(null)

const tabs = computed(() => [
  { value: 'titres', label: t('gsms.rh.fiche.titres'), count: titles.value?.length },
  { value: 'dossier', label: t('gsms.rh.fiche.dossier') },
  { value: 'sessions', label: t('gsms.rh.fiche.sessions'), count: trainer.value?.sessions },
  { value: 'developpement', label: t('gsms.rh.fiche.developpement') },
])

async function load() {
  const tid = id.value
  if (!tid) return
  loading.value = true
  error.value = null
  try {
    const res = await getTrainer(tid)
    if (tid === id.value) trainer.value = res
  } catch (e) {
    if (tid === id.value) { error.value = e; trainer.value = null }
  } finally {
    loading.value = false
  }
}

// Une réponse arrivée après un changement de formateur est ignorée (elle concerne l'ancienne fiche).
async function loadTitles() {
  const tid = id.value
  titlesError.value = null
  deadlinesError.value = null
  const [q, d] = await Promise.allSettled([listQualifications(tid), listTitleDeadlines()])
  if (tid !== id.value) return
  if (q.status === 'fulfilled') titles.value = q.value
  else { titles.value = null; titlesError.value = q.reason }
  if (d.status === 'fulfilled') deadlines.value = d.value.filter((x) => x.formateur_id === tid)
  else { deadlines.value = []; deadlinesError.value = d.reason }
}
async function loadTab(v: string) {
  const tid = id.value
  if (v === 'titres') await loadTitles()
  else if (v === 'sessions') {
    sessionsError.value = null
    try {
      const res = await listSessions({ formateur: tid })
      if (tid === id.value) sessions.value = res
    } catch (e) { if (tid === id.value) sessionsError.value = e }
  } else if (v === 'developpement') {
    devError.value = null
    try {
      const res = await listStaffDevelopment(tid)
      if (tid === id.value) dev.value = res
    } catch (e) { if (tid === id.value) devError.value = e }
  }
}
async function loadUsers() {
  if (!canManageUsers.value || users.value) return
  usersError.value = null
  try { users.value = await listUsers() } catch (e) { usersError.value = e }
}

watch(id, () => {
  actionError.value = null
  titles.value = null
  sessions.value = null
  dev.value = null
  load()
  loadTab(tab.value)
}, { immediate: true })
watch(tab, (v) => {
  router.replace({ query: { ...route.query, onglet: v } })
  loadTab(v)
})
watch(canManageUsers, loadUsers, { immediate: true })
access.load()
valueLists.load()

// Échéance d'un titre : la ligne de GET /rh/echeances qui porte son id.
const deadlineOf = (q: TrainerQualification) => deadlines.value.find((d) => d.titre_id === q.id) ?? null

const accountText = computed(() => {
  const uid = trainer.value?.user_id
  if (!uid) return t('gsms.rh.fiche.aucunCompte')
  const u = users.value?.find((x) => x.id === uid)
  return u ? `${u.full_name} · ${u.email}` : t('gsms.rh.formateurs.compteRelie')
})
const userOptions = computed(() => (users.value ?? []).filter((u) => u.is_active).map((u) => ({ value: u.id, label: `${u.full_name} · ${u.email}` })))
const accountVisible = ref(false)
async function openAccount() {
  await loadUsers()
  accountVisible.value = true
}
async function unlink() {
  busy.value = 'unlink'
  actionError.value = null
  try {
    await linkTrainerAccount(id.value, null)
    await saved()
  } catch (e) {
    actionError.value = e
  } finally {
    busy.value = ''
  }
}

const editVisible = ref(false)
async function saved() {
  MessagePlugin.success(t('gsms.commun.misAJour'))
  await load()
}

async function remove() {
  const done = await confirmCritical({
    title: t('gsms.rh.fiche.supprimer'), consequence: t('gsms.commun.suppressionDefinitive'), confirmLabel: t('gsms.commun.supprimer'),
    confirmText: trainer.value?.full_name || undefined, run: () => deleteTrainer(id.value).then(() => true),
  })
  if (done) router.push('/platform/formateurs')
}

// Titres : ajout par POST /formateurs/{id}/titres (type, numéro) ; modification limitée par l'API à l'intitulé et aux dates.
const titleForm = ref<{ visible: boolean; row: TrainerQualification | null }>({ visible: false, row: null })
const titleFields = computed<ActionField[]>(() => {
  const r = titleForm.value.row
  const dates: ActionField[] = [
    { name: 'label', label: `${t('gsms.rh.fiche.intitule')} *`, initial: r?.label },
    { name: 'obtained_on', label: t('gsms.rh.fiche.obtention'), type: 'date', initial: r?.obtained_on ?? undefined },
    { name: 'valid_until', label: t('gsms.rh.fiche.finValidite'), type: 'date', initial: r?.valid_until ?? undefined },
  ]
  return r ? dates : [
    { name: 'kind', label: t('gsms.rh.fiche.type'), type: 'select', options: valueLists.options('types_de_titre') },
    ...dates.slice(0, 1),
    { name: 'number', label: t('gsms.rh.fiche.numeroChamp') },
    ...dates.slice(1),
  ]
})
function openTitle(row: TrainerQualification | null) {
  titleForm.value = { visible: true, row }
}
const saveTitle = (v: Record<string, any>) => {
  const r = titleForm.value.row
  return r ? updateQualification(r.id, v) : addQualification(id.value, v)
}
async function titleSaved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await Promise.all([loadTitles(), load()])
}
async function removeTitle(q: TrainerQualification) {
  await deleteQualification(q.id)
  actionError.value = null
  void Promise.all([loadTitles(), load()])
}
async function downloadProof(q: TrainerQualification) {
  if (!q.document_id) return
  try { await downloadDocument(q.document_id, q.label) } catch (e) { MessagePlugin.error(refusalText(e)) }
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.side-section { .gsms-side-section(); }
.panel { .gsms-panel(); }
.title { .gsms-panel-title(); margin: 0; }
section.panel > .title { margin-bottom: 10px; }
.panel-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.muted { .gsms-muted(); margin: 4px 0 0; overflow-wrap: anywhere; }
.legend { margin-top: 8px; }
.identity { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.identity-name { font-size: var(--app-text-lg, 16px); font-weight: 600; color: var(--td-text-color-primary); overflow-wrap: anywhere; min-width: 0; }
.side-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.rows { .gsms-rows(); }
.row { padding: 10px 14px; }
.row--link { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; color: inherit; text-decoration: none;
  &:hover { background: var(--td-bg-color-container-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; } }
.row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.row-main { flex: 1 1 160px; min-width: 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500; overflow-wrap: anywhere;
  .muted { font-weight: 400; } }
.row-chevron { color: var(--td-text-color-placeholder); }
.row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 6px; }
.deadline { display: flex; align-items: center; gap: 4px; margin: 6px 0 0; color: var(--td-text-color-primary); font-size: var(--app-text-md); font-weight: 500;
  &.deadline--late { color: var(--td-error-color); } }
.more { color: var(--td-brand-color); font-size: var(--app-text-sm); text-decoration: none; &:hover { text-decoration: underline; } }
</style>
