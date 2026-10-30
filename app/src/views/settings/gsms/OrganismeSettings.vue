<template>
  <div class="gsms-settings">
    <div class="section-header">
      <div class="section-header__top">
        <h2>{{ t('gsms.parametres.sections.organisme') }}</h2>
        <t-button v-if="canEdit && org" theme="primary" :loading="saving" :disabled="!dirty" @click="save">
          {{ t('gsms.parametres.commun.enregistrer') }}
        </t-button>
      </div>
      <p class="section-description">{{ t('gsms.parametres.organisme.description') }}</p>
    </div>

    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <GsmsRefusal v-if="saveError" :error="saveError" inline />
    <t-alert v-if="org && !canEdit" theme="info" class="alert-gap"
      :message="t('gsms.parametres.organisme.lectureSeule')" />
    <t-alert v-if="org && !org.existe" theme="warning" class="alert-gap"
      :message="t('gsms.parametres.organisme.absent')" />

    <div v-if="loading" class="state-block"><t-loading size="small" /></div>

    <div v-else-if="org" class="settings-group">
      <div class="setting-row">
        <div class="setting-info">
          <label for="org-name">{{ t('gsms.parametres.organisme.nom') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.nomAide') }}</p>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-name" v-model="form.name" :disabled="!canEdit" :maxlength="200" />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label for="org-nda">{{ t('gsms.parametres.organisme.nda') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.ndaAide') }}</p>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-nda" v-model="form.nda_number" :disabled="!canEdit" :maxlength="40" />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label for="org-siret">{{ t('gsms.parametres.organisme.siret') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.siretAide') }}</p>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-siret" v-model="form.siret" :disabled="!canEdit" inputmode="numeric" />
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label>{{ t('gsms.parametres.organisme.categories') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.categoriesAide') }}</p>
        </div>
        <div class="setting-control">
          <t-checkbox-group v-model="form.action_categories" :disabled="!canEdit" class="categories">
            <t-checkbox v-for="c in org.categories_possibles" :key="c.code" :value="c.code">
              {{ c.libelle }}
            </t-checkbox>
          </t-checkbox-group>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <label>{{ t('gsms.parametres.organisme.nouvelEntrant') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.nouvelEntrantAide') }}</p>
        </div>
        <div class="setting-control">
          <t-switch v-model="form.is_new_entrant" :disabled="!canEdit" :aria-label="t('gsms.parametres.organisme.nouvelEntrant')" />
        </div>
      </div>

      <div class="group-title">{{ t('gsms.parametres.organisme.referents') }}</div>
      <div class="setting-row">
        <div class="setting-info">
          <label for="org-handi">{{ t('gsms.parametres.organisme.referentHandicap') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.referentAide') }}</p>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-handi" v-model="form.disability_referent_name" :disabled="!canEdit" :maxlength="200" />
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <label for="org-handi-mail">{{ t('gsms.parametres.organisme.referentHandicapEmail') }}</label>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-handi-mail" v-model="form.disability_referent_email" type="email" :disabled="!canEdit"
            :maxlength="200" />
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <label for="org-mob">{{ t('gsms.parametres.organisme.referentMobilite') }}</label>
          <p class="desc">{{ t('gsms.parametres.organisme.referentAide') }}</p>
        </div>
        <div class="setting-control">
          <t-input :placeholder="t('gsms.parametres.commun.nonRenseigne')" id="org-mob" v-model="form.mobility_referent_name" :disabled="!canEdit" :maxlength="200" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { getOrganisme, updateOrganisme, type Organisme, type OrganismePatch } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

const { t } = useI18n()
const access = useGsmsAccessStore()
const canEdit = computed(() => access.can('settings.manage'))

const org = ref<Organisme | null>(null)
const loading = ref(true)
const saving = ref(false)
const loadError = ref<unknown>(null)
const saveError = ref<unknown>(null)

type Form = {
  name: string
  nda_number: string
  siret: string
  action_categories: string[]
  is_new_entrant: boolean
  disability_referent_name: string
  disability_referent_email: string
  mobility_referent_name: string
}
const form = reactive<Form>(emptyForm())
let initial: Form = emptyForm()

function emptyForm(): Form {
  return {
    name: '', nda_number: '', siret: '', action_categories: [], is_new_entrant: false,
    disability_referent_name: '', disability_referent_email: '', mobility_referent_name: '',
  }
}

function fromOrg(o: Organisme): Form {
  return {
    name: o.name ?? '',
    nda_number: o.nda_number ?? '',
    siret: o.siret ?? '',
    action_categories: [...(o.action_categories ?? [])],
    is_new_entrant: o.is_new_entrant ?? false,
    disability_referent_name: o.disability_referent_name ?? '',
    disability_referent_email: o.disability_referent_email ?? '',
    mobility_referent_name: o.mobility_referent_name ?? '',
  }
}

function apply(o: Organisme) {
  org.value = o
  initial = fromOrg(o)
  Object.assign(form, fromOrg(o))
}

const changes = computed<OrganismePatch>(() => {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(form) as (keyof Form)[]) {
    const now = form[key]
    const before = initial[key]
    const same = Array.isArray(now) ? JSON.stringify([...now].sort()) === JSON.stringify([...(before as string[])].sort()) : now === before
    if (!same) patch[key] = typeof now === 'string' ? (now.trim() || null) : now
  }
  return patch as OrganismePatch
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    apply(await getOrganisme())
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    apply(await updateOrganisme(changes.value))
    MessagePlugin.success(t('gsms.parametres.organisme.succes'))
  } catch (err) {
    saveError.value = err
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.setting-control :deep(.t-input__wrap) {
  width: 280px;
  max-width: 100%;
}

.categories {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

@media (max-width: 720px) {
  .setting-control :deep(.t-input__wrap) {
    width: 100%;
  }
}
</style>
