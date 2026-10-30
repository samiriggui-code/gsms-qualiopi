<template>
  <div class="public-page">
    <main class="public-page__col" :aria-busy="loading ? 'true' : undefined">
      <header class="public-page__brand">
        {{ organisme || t('gsms.public.commun.organismeDefaut') }}
      </header>

      <section v-if="loading" class="public-card public-page__loading" role="status">
        <t-loading size="small" />
        <span>{{ t('gsms.public.commun.chargement') }}</span>
      </section>

      <section v-else-if="error" class="public-card public-card--refus" role="alert">
        <h1 ref="titleEl" class="public-title" tabindex="-1">{{ errorTitleText }}</h1>
        <p class="public-text">{{ errorText }}</p>
        <button v-if="retry && (error.kind === 'reseau' || error.kind === 'indisponible' || error.kind === 'limite')"
                type="button" class="public-btn public-btn--ghost" @click="retry">
          {{ t('gsms.public.commun.reessayer') }}
        </button>
      </section>

      <slot v-else />

      <p v-if="$slots.footer" class="public-page__footer"><slot name="footer" /></p>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * Coque des pages ouvertes par un lien signé (questionnaire, espace du stagiaire, émargement) :
 * ni menu, ni compte, ni panneau Paramètres. Une colonne lisible à 390 px, aux couleurs de l'interface.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PublicError } from '@/views/gsms/public/publicLinks'

const props = withDefaults(defineProps<{
  /** Titre de l'onglet du navigateur. */
  pageTitle: string
  organisme?: string | null
  loading?: boolean
  error?: PublicError | null
  /** Titre affiché pour un lien fermé (410). */
  closedTitle?: string
  retry?: (() => void) | null
}>(), { organisme: null, loading: false, error: null, closedTitle: '', retry: null })

const { t } = useI18n()
const titleEl = ref<HTMLElement | null>(null)

const errorTitleText = computed(() => {
  const kind = props.error?.kind
  if (kind === 'ferme') return props.closedTitle || t('gsms.public.commun.erreurs.ferme.titre')
  if (kind === 'refus') return t('gsms.public.commun.erreurs.refus.titre')
  return kind ? t(`gsms.public.commun.erreurs.${kind}.titre`) : ''
})
const errorText = computed(() => {
  const e = props.error
  if (!e) return ''
  if (e.detail && (e.kind === 'ferme' || e.kind === 'refus' || e.kind === 'limite')) return e.detail
  return t(`gsms.public.commun.erreurs.${e.kind}.texte`)
})
watch(() => props.error, async (e) => {
  if (!e) return
  await nextTick()
  titleEl.value?.focus()
})

// Lien personnel : jamais indexé, jamais transmis en référent à un autre site.
const metas: HTMLMetaElement[] = []
function addMeta(name: string, content: string) {
  const m = document.createElement('meta')
  m.name = name
  m.content = content
  document.head.appendChild(m)
  metas.push(m)
}
watch(() => props.pageTitle, (v) => { document.title = v }, { immediate: true })
onMounted(() => {
  addMeta('robots', 'noindex, nofollow')
  addMeta('referrer', 'no-referrer')
})
onBeforeUnmount(() => metas.forEach((m) => m.remove()))
</script>

<style scoped>
.public-page {
  min-height: 100%;
  background: var(--td-bg-color-page);
  color: var(--td-text-color-primary);
  -webkit-text-size-adjust: 100%;
}

.public-page__col {
  box-sizing: border-box;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 20px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: var(--app-text-lg);
  line-height: 1.5;
}

.public-page__brand {
  font-family: var(--app-font-family-display);
  font-weight: 700;
  font-size: var(--app-text-md);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--td-text-color-secondary);
}

.public-page__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--td-text-color-secondary);
}

.public-page__footer {
  margin: 4px 0 0;
  text-align: center;
  font-size: var(--app-text-md);
  color: var(--td-text-color-secondary);
}

@media (min-width: 768px) {
  .public-page__col {
    padding-top: 40px;
  }
}
</style>

<style>
/* Briques communes des pages publiques (non scopées : partagées par les trois pages). */
.public-card {
  box-sizing: border-box;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-xl);
  padding: 20px 16px;
  min-width: 0;
}

@media (min-width: 768px) {
  .public-card {
    padding: 24px;
  }
}

.public-title {
  margin: 0;
  font-family: var(--app-font-family-display);
  font-size: var(--app-text-4xl);
  line-height: 1.3;
  font-weight: 700;
  text-wrap: balance;
  outline: none;
}

/* Refus ou erreur de l'API : titre d'alerte en rouge (teinte 7 : contraste AA sur fond clair). */
.public-card--refus .public-title {
  color: var(--td-error-color-7);
}

.public-subtitle {
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--app-text-xl);
  font-weight: 700;
}

.public-subtitle .t-icon {
  color: var(--td-text-color-secondary);
  font-size: var(--app-text-2xl);
}

.public-subtitle .t-icon.public-ok,
.public-title .t-icon.public-ok {
  color: var(--td-success-color-7);
}

.public-text {
  margin: 8px 0 0;
  color: var(--td-text-color-secondary);
}

.public-small {
  font-size: var(--app-text-md);
  color: var(--td-text-color-secondary);
}

.public-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 20px;
  border-radius: var(--app-radius-md);
  border: 1px solid var(--td-brand-color);
  background: var(--td-brand-color);
  color: #fff;
  font: inherit;
  font-size: var(--app-text-xl);
  font-weight: 700;
  cursor: pointer;
}

.public-btn:hover:not(:disabled) {
  background: var(--td-brand-color-active);
  border-color: var(--td-brand-color-active);
}

.public-btn:disabled {
  opacity: 0.7;
  cursor: progress;
}

.public-btn--ghost {
  margin-top: 16px;
  background: transparent;
  color: var(--td-brand-color);
}

.public-btn--ghost:hover:not(:disabled) {
  background: var(--td-bg-color-container-hover);
  color: var(--td-brand-color);
}

.public-btn:focus-visible,
.public-link:focus-visible,
.public-row:focus-visible {
  outline: 3px solid var(--td-brand-color);
  outline-offset: 2px;
}

.public-link {
  color: var(--td-brand-color);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

.public-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 10px 14px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--app-radius-lg);
  color: inherit;
  text-decoration: none;
}

.public-row:hover {
  border-color: var(--td-text-color-placeholder);
  background: var(--td-bg-color-container-hover);
}

.public-row__body {
  min-width: 0;
  flex: 1;
}

.public-row__title {
  display: block;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.public-row__detail {
  display: block;
  font-size: var(--app-text-md);
  color: var(--td-text-color-secondary);
}

.public-row .t-icon {
  flex: none;
  color: var(--td-text-color-secondary);
}

.public-alert {
  border: 1px solid var(--td-error-color-7);
  background: var(--td-error-color-1);
  color: var(--td-error-color-8);
  border-radius: var(--app-radius-lg);
  padding: 12px 14px;
  outline: none;
}

.public-alert a {
  color: inherit;
}

.public-ok {
  color: var(--td-success-color-7);
}
</style>
