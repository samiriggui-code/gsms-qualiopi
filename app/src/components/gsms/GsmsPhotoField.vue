<template>
  <div class="photo-field">
    <div class="pf-row">
      <GsmsPersonAvatar :name="name" :photo="modelValue" :size="72" />
      <div class="pf-side">
        <div class="pf-actions">
          <t-button size="small" variant="outline" :loading="uploading" :disabled="disabled" @click="pick">
            <template #icon><t-icon name="upload" /></template>{{ t('gsms.photo.televerser') }}
          </t-button>
          <t-button size="small" variant="outline" :disabled="disabled || uploading" :aria-expanded="libraryOpen" :aria-controls="gridId"
            @click="libraryOpen = !libraryOpen">
            <template #icon><t-icon name="image" /></template>{{ t('gsms.photo.mediatheque') }}
          </t-button>
          <t-button v-if="modelValue" size="small" variant="text" theme="danger" :disabled="disabled || uploading" @click="set(null)">
            {{ t('gsms.photo.retirer') }}
          </t-button>
        </div>
        <p class="pf-help">{{ t('gsms.photo.aide') }}</p>
      </div>
      <input ref="fileInput" type="file" class="pf-input" :accept="PHOTO_TYPES.join(',')" tabindex="-1" aria-hidden="true" @change="onFile" />
    </div>
    <p v-if="localProblem" class="pf-error" role="alert">{{ localProblem }}</p>
    <GsmsRefusal v-if="error" :error="error" inline />
    <div v-if="libraryOpen" :id="gridId" class="pf-grid" role="listbox" :aria-label="t('gsms.photo.mediatheque')">
      <button v-for="p in AVATAR_LIBRARY" :key="p" type="button" role="option" class="pf-item" :class="{ 'is-selected': p === modelValue }"
        :aria-selected="p === modelValue" :aria-label="t('gsms.photo.choisirN', { n: p.split('/').pop() })" @click="choose(p)">
        <img :src="mediaSrc(p) || ''" alt="" loading="lazy" decoding="async" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Champ photo d'une fiche (stagiaire, formateur, personnel) : aperçu rond, téléversement (POST /medias/photos),
 * choix dans la médiathèque du back-office, retrait. La valeur est le chemin de la médiathèque (`photo_url`).
 * Le contrôle du type et du poids n'est qu'un confort : l'API vérifie le fichier et ses refus s'affichent.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GsmsPersonAvatar from './GsmsPersonAvatar.vue'
import GsmsRefusal from './GsmsRefusal.vue'
import { mediaSrc } from './media'
import { AVATAR_LIBRARY, PHOTO_TYPES, photoProblem } from './photo'
import { uploadPhoto } from '@/api/gsms/medias'

withDefaults(defineProps<{ modelValue?: string | null; name?: string | null; disabled?: boolean }>(),
  { modelValue: null, name: null, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [string | null]; busy: [boolean] }>()
const { t } = useI18n()

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref<unknown>(null)
const localProblem = ref('')
const libraryOpen = ref(false)
const gridId = `pf-grid-${Math.random().toString(36).slice(2, 9)}`

function set(v: string | null) {
  error.value = null
  localProblem.value = ''
  emit('update:modelValue', v)
}
function choose(p: string) {
  set(p)
  libraryOpen.value = false
}
function pick() {
  fileInput.value?.click()
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = null
  localProblem.value = ''
  const problem = photoProblem(file)
  if (problem) {
    localProblem.value = t(problem === 'type' ? 'gsms.photo.typeRefuse' : 'gsms.photo.tropLourde')
    return
  }
  uploading.value = true
  emit('busy', true)
  try {
    const res = await uploadPhoto(file)
    emit('update:modelValue', res.chemin)
    libraryOpen.value = false
  } catch (e) {
    error.value = e
  } finally {
    uploading.value = false
    emit('busy', false)
  }
}

</script>

<style scoped lang="less">
.photo-field { display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; }
.pf-row { display: flex; align-items: center; gap: 14px; min-width: 0; }
.pf-side { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
.pf-actions { display: flex; flex-wrap: wrap; gap: 6px 8px; }
.pf-help { margin: 0; color: var(--td-text-color-secondary); font-size: var(--app-text-xs); line-height: 16px; }
.pf-error { margin: 0; color: var(--td-error-color); font-size: var(--app-text-sm); line-height: 18px; }
.pf-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.pf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  max-height: 232px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);
}
.pf-item {
  aspect-ratio: 1;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--td-bg-color-secondarycontainer);
  cursor: pointer;
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  &:hover { border-color: var(--td-brand-color-hover); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
  &.is-selected { border-color: var(--td-brand-color); }
}
@media (max-width: 479.98px) {
  .pf-row { align-items: flex-start; }
}
</style>
