<template>
  <GsmsListPage :title="t('gsms.satisfaction.titre')" icon="star" :subtitle="t('gsms.satisfaction.sousTitre')"
    :items="rows" :loading="loading" :error="error" :columns="columns"
    :empty-title="items?.length ? t('gsms.commun.aucunResultat') : t('gsms.satisfaction.vide')"
    :empty-description="items?.length ? t('gsms.commun.aucunResultatFiltres') : t('gsms.satisfaction.videAide')" @retry="load">
    <template #actions>
      <t-button v-if="canWrite" size="small" @click="openForm(null)"><template #icon><t-icon name="add" /></template>{{ t('gsms.satisfaction.nouvelle') }}</t-button>
    </template>
    <template #toolbar>
      <GsmsFilterTabs v-model="audience" :options="audienceTabs" :label="t('gsms.satisfaction.public')" />
      <t-input v-model="query" class="search" :placeholder="t('gsms.commun.rechercher')" :aria-label="t('gsms.commun.rechercher')" clearable>
        <template #prefix-icon><t-icon name="search" size="16px" /></template>
      </t-input>
    </template>
    <template #before>
      <p class="notice"><t-icon name="info-circle" size="14px" /> {{ t('gsms.satisfaction.aide') }}</p>
      <GsmsRefusal v-if="actionError" :error="actionError" inline />
    </template>

    <template #cell-session_reference="{ row }">
      <router-link :to="`/platform/sessions/${row.session_id}`" class="cell-link" @click.stop>{{ row.session_reference || '—' }}</router-link>
    </template>
    <template #cell-audience="{ row }">{{ audienceLabel(row.audience) }}</template>
    <template #cell-learner_name="{ row }">
      <span v-if="row.learner_name" class="person-cell"><GsmsPersonAvatar :name="row.learner_name" :photo="row.learner_photo_url" :size="24" />{{ row.learner_name }}</span>
      <template v-else>—</template>
    </template>
    <template #cell-sent_on="{ row }">{{ fmtDate(row.sent_on) }}</template>
    <template #cell-answered_on="{ row }">{{ row.answered_on ? fmtDate(row.answered_on) : t('gsms.satisfaction.sansReponse') }}</template>
    <template #cell-score="{ row }"><span class="score">{{ scoreText(row.score) }}</span></template>
    <template #cell-comment="{ row }"><span class="comment">{{ row.comment || '—' }}</span></template>
    <template #cell-actions="{ row }"><GsmsRowActions v-if="canWrite" :delete-title="t('gsms.satisfaction.supprimer')" @edit="openForm(row)" :remove="() => remove(row)" /></template>

    <template #card="{ item }">
      <div class="card card--static">
        <div class="card-header">
          <div class="card-header-left"><span class="card-title">{{ audienceLabel(item.audience) }}</span></div>
          <span class="score">{{ scoreText(item.score) }}</span>
        </div>
        <div v-if="item.comment" class="card-content"><p class="card-description">{{ item.comment }}</p></div>
        <div class="card-meta">
          <router-link :to="`/platform/sessions/${item.session_id}`" class="meta-link"><t-icon name="calendar-1" size="14px" />{{ item.session_reference || '—' }}</router-link>
          <span v-if="item.learner_name" class="person-cell"><GsmsPersonAvatar :name="item.learner_name" :photo="item.learner_photo_url" :size="18" />{{ item.learner_name }}</span>
          <span>{{ t('gsms.satisfaction.envoyeeLe', { date: fmtDate(item.sent_on) }) }}</span>
          <span>{{ item.answered_on ? t('gsms.satisfaction.reponduLe', { date: fmtDate(item.answered_on) }) : t('gsms.satisfaction.sansReponse') }}</span>
        </div>
        <GsmsRowActions v-if="canWrite" class="card-actions" :delete-title="t('gsms.satisfaction.supprimer')" @edit="openForm(item)" :remove="() => remove(item)" />
      </div>
    </template>
  </GsmsListPage>

  <ActionDialog v-model:visible="form.visible" :title="form.id ? t('gsms.satisfaction.modifier') : t('gsms.satisfaction.nouvelle')"
    :fields="formFields" :run="save" @done="saved" />
</template>

<script setup lang="ts">
/**
 * Satisfaction (page 15) : enquêtes de GET /surveys (à chaud, à froid, entreprise, formateur, financeur). Aucune
 * moyenne n'est calculée ici. Écriture : permission `quality.write` de la route ; l'API vérifie et refuse en clair.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import GsmsListPage, { type ListColumn } from '@/components/gsms/GsmsListPage.vue'
import GsmsFilterTabs from '@/components/gsms/GsmsFilterTabs.vue'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsRowActions from '@/components/gsms/GsmsRowActions.vue'
import GsmsPersonAvatar from '@/components/gsms/GsmsPersonAvatar.vue'
import ActionDialog, { type ActionField } from '@/components/gsms/ActionDialog.vue'
import { createSurvey, deleteSurvey, listSurveys, updateSurvey, type Survey, type SurveyIn } from '@/api/gsms/qualite'
import { listSessions, type SessionRow } from '@/api/gsms/sessions'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { useGsmsValueListsStore } from '@/stores/gsmsValueLists'
import { fmtDate } from '@/components/gsms/format'

const { t, locale } = useI18n()
const access = useGsmsAccessStore()
// Publics acceptés par l'API (GET /listes-de-valeurs) ; c'est elle qui les vérifie.
const valueLists = useGsmsValueListsStore()
const audiences = computed(() => valueLists.options('publics_d_enquete'))
// Aucune `capabilities` sur les ressources CRUD : l'écriture suit la permission de la route (quality.write), l'API tranche.
const canWrite = computed(() => access.can('quality.write'))

const items = ref<Survey[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const actionError = ref<unknown>(null)
const audience = ref('all')
const query = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await listSurveys()
  } catch (e) {
    error.value = e
    items.value = null
  } finally {
    loading.value = false
  }
}
onMounted(() => { access.load(); valueLists.load(); load() })

const audienceLabel = (a: string) => valueLists.label('publics_d_enquete', a)
const audienceTabs = computed(() => [{ value: 'all', label: t('gsms.commun.toutes') },
  ...audiences.value])
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value?.filter((s) => (audience.value === 'all' || s.audience === audience.value)
    && (!q || [s.session_reference, s.learner_name, s.comment].some((v) => v?.toLowerCase().includes(q)))) ?? null
})
const scoreText = (score: number | null) => (score === null ? '—'
  : t('gsms.satisfaction.note', { note: score.toLocaleString(locale.value, { maximumFractionDigits: 2 }) }))

const columns = computed<ListColumn[]>(() => [
  { colKey: 'session_reference', title: t('gsms.sessions.session'), width: 160 },
  { colKey: 'audience', title: t('gsms.satisfaction.public'), width: 150 },
  { colKey: 'learner_name', title: t('gsms.sessions.stagiaire') },
  { colKey: 'sent_on', title: t('gsms.satisfaction.colEnvoi'), width: 110 },
  { colKey: 'answered_on', title: t('gsms.satisfaction.colReponse'), width: 120 },
  { colKey: 'score', title: t('gsms.satisfaction.colNote'), width: 90 },
  { colKey: 'comment', title: t('gsms.satisfaction.colCommentaire') },
  ...(canWrite.value ? [{ colKey: 'actions', title: '', width: 150 }] : []),
])

// Formulaire : la session est proposée parmi les sessions visibles (GET /sessions) ; le stagiaire éventuel est conservé.
const sessions = ref<SessionRow[]>([])
const form = reactive<{ visible: boolean; id: string | null; initial: Partial<Survey> }>({ visible: false, id: null, initial: {} })
const formFields = computed<ActionField[]>(() => [
  ...(form.id ? [] : [{ name: 'session_id', label: t('gsms.sessions.session'), type: 'select' as const, initial: '',
    options: sessions.value.map((s) => ({ value: s.id, label: `${s.reference} · ${fmtDate(s.start_date)}` })) }]),
  { name: 'audience', label: t('gsms.satisfaction.public'), type: 'select', initial: form.initial.audience ?? audiences.value[0]?.value,
    options: audiences.value },
  { name: 'sent_on', label: t('gsms.satisfaction.colEnvoi'), type: 'date', initial: form.initial.sent_on ?? '' },
  { name: 'answered_on', label: t('gsms.satisfaction.colReponse'), type: 'date', initial: form.initial.answered_on ?? '' },
  { name: 'score', label: t('gsms.satisfaction.noteSur5'), type: 'number', initial: form.initial.score ?? undefined },
  { name: 'comment', label: t('gsms.satisfaction.colCommentaire'), type: 'textarea', initial: form.initial.comment ?? '' },
])
async function openForm(s: Survey | null) {
  actionError.value = null
  if (!s && !sessions.value.length) {
    try { sessions.value = await listSessions() } catch (e) { actionError.value = e; return }
  }
  Object.assign(form, { visible: true, id: s?.id ?? null, initial: s ?? {} })
}
const save = (v: Record<string, any>) => (form.id ? updateSurvey(form.id, v as SurveyIn) : createSurvey(v as SurveyIn))
async function saved() {
  MessagePlugin.success(t('gsms.commun.enregistre'))
  await load()
}

async function remove(s: Survey) {
  await deleteSurvey(s.id)
  actionError.value = null
  void load()
}
</script>

<style scoped lang="less">
@import (reference) '@/components/gsms/gsms-list.less';
.search { .gsms-search(); }
.notice { .gsms-notice(); }
.card { .gsms-card(); }
.person-cell { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.card--static { cursor: default; }
.card .card-content { overflow: visible; }
.card .card-description { -webkit-line-clamp: 4; line-clamp: 4; }
.card-actions { margin-top: 8px; }
.score { flex-shrink: 0; color: var(--td-text-color-primary); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.comment { color: var(--td-text-color-secondary); font-size: var(--app-text-sm); overflow-wrap: anywhere; }
.cell-link { color: var(--td-text-color-primary); font-weight: 500; text-decoration: none; &:hover { color: var(--td-brand-color); } }
.meta-link { color: inherit; text-decoration: none; &:hover { color: var(--td-brand-color); } }
</style>
