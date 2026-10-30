<template>
  <div class="gsms-settings">
    <div class="section-header">
      <h2>{{ t('gsms.parametres.sections.communications') }}</h2>
      <p class="section-description">{{ t('gsms.parametres.communications.description') }}</p>
    </div>

    <GsmsFileNote file="backend/config/relances/standard.yaml" />
    <GsmsRefusal v-if="loadError" :error="loadError" inline />
    <div class="table-frame">
      <t-table row-key="cle" :data="rows" :columns="columns" :loading="loading" size="medium" :empty="t('gsms.parametres.communications.aucuneRegle')">
        <template #libelle="{ row }">
          <div class="cell-main">{{ row.libelle }}
            <t-tag v-if="disabled.has(row.cle)" size="small" variant="light" theme="default">{{ t('gsms.parametres.communications.desactivee') }}</t-tag>
          </div>
          <div class="cell-sub"><code>{{ row.cle }}</code> · {{ t('gsms.parametres.communications.modele', { name: row.modele }) }}</div>
        </template>
        <template #quand="{ row }">{{ when(row) }}</template>
        <template #externe="{ row }">{{ t(row.externe ? 'gsms.parametres.communications.externe' : 'gsms.parametres.communications.interne') }}</template>
      </t-table>
    </div>
    <p class="meta">{{ t('gsms.parametres.communications.modelesNote') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listRelanceRules, type RelanceRule } from '@/api/gsms/relances'
import { listSettings } from '@/api/gsms/platform'
import GsmsRefusal from '@/components/gsms/GsmsRefusal.vue'
import GsmsFileNote from './GsmsFileNote.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'

const { t } = useI18n()
const access = useGsmsAccessStore()
const rows = ref<RelanceRule[]>([])
const disabled = ref(new Set<string>())
const loading = ref(true)
const loadError = ref<unknown>(null)

const columns = computed(() => [
  { colKey: 'libelle', title: t('gsms.parametres.communications.colRegle'), minWidth: 260 },
  { colKey: 'destinataire', title: t('gsms.parametres.communications.colDestinataire'), width: 150 },
  { colKey: 'quand', title: t('gsms.parametres.communications.colQuand'), width: 200 },
  { colKey: 'externe', title: t('gsms.parametres.communications.colEnvoi'), width: 100 },
])

function when(r: RelanceRule): string {
  if (r.portee === 'HEBDO') return t('gsms.parametres.communications.hebdo', { day: r.jour ?? '—' })
  if (r.portee === 'JALON') return t('gsms.parametres.communications.jalon')
  const offsets = (r.decalages ?? []).map((d) => (d === 0 ? 'J' : d < 0 ? `J${d}` : `J+${d}`)).join(', ')
  return `${offsets} (${t(r.ancre === 'fin' ? 'gsms.parametres.communications.fin' : 'gsms.parametres.communications.debut')})`
}

onMounted(async () => {
  try {
    rows.value = await listRelanceRules()
    if (access.can('settings.manage')) {
      const s = (await listSettings()).find((x) => x.key === 'relances.regles_desactivees')
      disabled.value = new Set(Array.isArray(s?.value) ? (s.value as string[]) : [])
    }
  } catch (err) {
    loadError.value = err
  } finally {
    loading.value = false
  }
})
</script>

<style lang="less" scoped>
@import (reference) './gsms-section.less';

.gsms-settings {
  .gsms-section();
}

.cell-main {
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.cell-sub {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-sm);

  code {
    font-family: var(--app-font-family-mono);
  }
}
</style>
