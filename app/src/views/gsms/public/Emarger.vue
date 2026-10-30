<template>
  <PublicLinkPage :page-title="t('gsms.public.emarger.titrePage')">
    <section v-if="signedAt" class="public-card">
      <h1 ref="doneTitle" class="public-title" tabindex="-1">
        <t-icon name="check-circle-filled" class="public-ok" aria-hidden="true" />
        {{ t('gsms.public.emarger.signe') }}
      </h1>
      <p class="public-text">{{ signedText }}</p>
    </section>

    <template v-else>
      <section class="em-intro">
        <h1 class="public-title">{{ t('gsms.public.emarger.titre') }}</h1>
        <p class="public-text">{{ t('gsms.public.emarger.intro') }}</p>
      </section>

      <ol class="em-steps">
        <li class="public-card em-step" :class="{ 'is-done': !!token }">
          <h2 class="public-subtitle">
            <t-icon :name="token ? 'check-circle-filled' : 'link'" :class="{ 'public-ok': token }" aria-hidden="true" />
            {{ t('gsms.public.emarger.etapeLien') }}
          </h2>
          <template v-if="token">
            <p class="em-flush">{{ stored ? t('gsms.public.emarger.lienGarde') : t('gsms.public.emarger.lienLu') }}</p>
            <button type="button" class="em-forget public-link" @click="forget">{{ t('gsms.public.emarger.oublier') }}</button>
          </template>
          <form v-else class="em-paste" novalidate @submit.prevent="savePasted">
            <p class="em-flush">{{ t('gsms.public.emarger.lienManquant') }}</p>
            <label for="em-lien" class="em-label">{{ t('gsms.public.emarger.collerLabel') }}</label>
            <input id="em-lien" v-model="pasted" class="em-input" type="url" inputmode="url" autocomplete="off"
                   autocapitalize="off" spellcheck="false" :aria-invalid="pasteError ? 'true' : undefined"
                   :aria-describedby="pasteError ? 'em-lien-erreur' : 'em-lien-aide'" />
            <p v-if="pasteError" id="em-lien-erreur" class="em-error">{{ pasteError }}</p>
            <p v-else id="em-lien-aide" class="public-small em-flush">{{ t('gsms.public.emarger.collerAide') }}</p>
            <button type="submit" class="public-btn public-btn--ghost em-paste-btn">{{ t('gsms.public.emarger.collerBouton') }}</button>
          </form>
        </li>

        <li class="public-card em-step" :class="{ 'is-done': !!code }">
          <h2 class="public-subtitle">
            <t-icon :name="code ? 'check-circle-filled' : 'qrcode'" :class="{ 'public-ok': code }" aria-hidden="true" />
            {{ t('gsms.public.emarger.etapeCode') }}
          </h2>
          <p class="em-flush">{{ code ? t('gsms.public.emarger.codeLu') : t('gsms.public.emarger.codeManquant') }}</p>
        </li>
      </ol>

      <div v-if="refusal" ref="alertEl" class="public-alert" role="alert" tabindex="-1">
        <p class="em-alert-title">{{ refusal.title }}</p>
        <p class="em-flush">{{ refusal.text }}</p>
      </div>

      <button type="button" class="public-btn em-sign" :disabled="!token || !code || signing" @click="sign">
        {{ signing ? t('gsms.public.emarger.signature') : t('gsms.public.emarger.signer') }}
      </button>
      <p v-if="!token || !code" class="public-small em-why">{{ t('gsms.public.emarger.deuxElements') }}</p>
    </template>
  </PublicLinkPage>
</template>

<script setup lang="ts">
/**
 * Émargement du stagiaire (`/emarger`) : `?code=` vient du QR code de la salle, `?jeton=` du lien personnel
 * envoyé avec la convocation. Il faut les deux pour POST /api/v1/emargement/signer ; l'API décide (fenêtre
 * horaire, session en cours, déjà signé…) et motive chaque refus (409), affiché tel quel.
 * Le lien personnel peut rester sur l'appareil (stockage local) pour les demi-journées suivantes.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PublicLinkPage from '@/components/gsms/PublicLinkPage.vue'
import { signAttendance } from '@/api/gsms/public'
import { extractSignToken, publicError } from './publicLinks'

const STORAGE_KEY = 'gsms_emargement_lien'
const CODE = /^[A-Za-z0-9_-]{6,64}$/

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const token = ref<string | null>(null)
const stored = ref(false)
const code = ref<string | null>(null)
const pasted = ref('')
const pasteError = ref<string | null>(null)
const signing = ref(false)
const signedAt = ref<string | null>(null)
const refusal = ref<{ title: string; text: string } | null>(null)
const alertEl = ref<HTMLElement | null>(null)
const doneTitle = ref<HTMLElement | null>(null)

function remember(value: string) {
  token.value = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
    stored.value = true
  } catch {
    stored.value = false // navigation privée : le lien sert pour cette page seulement
  }
}

function forget() {
  token.value = null
  stored.value = false
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* rien à oublier */
  }
}

onMounted(() => {
  const q = route.query
  const fromUrl = typeof q.jeton === 'string' ? extractSignToken(q.jeton) : null
  if (fromUrl) {
    remember(fromUrl)
  } else {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && extractSignToken(saved)) {
        token.value = saved
        stored.value = true
      }
    } catch {
      /* stockage indisponible */
    }
  }
  code.value = typeof q.code === 'string' && CODE.test(q.code) ? q.code : null
  // Le jeton personnel ne reste pas dans la barre d'adresse ni dans l'historique (capture, partage d'écran).
  if (q.jeton !== undefined) {
    router.replace({ query: code.value ? { code: code.value } : {} })
  }
})

function savePasted() {
  const value = extractSignToken(pasted.value)
  if (!value) {
    pasteError.value = t('gsms.public.emarger.collerInvalide')
    return
  }
  pasteError.value = null
  pasted.value = ''
  remember(value)
}

const signedText = computed(() => {
  if (!signedAt.value) return ''
  const d = new Date(signedAt.value)
  return t('gsms.public.emarger.signeTexte', {
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    heure: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  })
})

async function sign() {
  if (!token.value || !code.value) return
  signing.value = true
  refusal.value = null
  try {
    const r = await signAttendance(code.value, token.value)
    signedAt.value = r.signe_le || new Date().toISOString()
    router.replace({ query: {} }) // le code de salle ne resservira pas : rien à garder dans l'adresse
    await nextTick()
    doneTitle.value?.focus()
  } catch (err) {
    const e = publicError(err)
    const kind = e.kind === 'refus' ? 'refus' : e.kind
    refusal.value = {
      title: kind === 'refus' ? t('gsms.public.emarger.refus') : t(`gsms.public.commun.erreurs.${kind}.titre`),
      text: e.detail || t(`gsms.public.commun.erreurs.${kind}.texte`),
    }
    await nextTick()
    alertEl.value?.focus()
  } finally {
    signing.value = false
  }
}
</script>

<style scoped>
.em-intro {
  display: flex;
  flex-direction: column;
}

.em-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.em-step.is-done {
  border-color: var(--td-success-color-3);
}

.em-flush {
  margin: 0;
}

.em-forget {
  margin-top: 10px;
  padding: 8px 0;
  min-height: 44px;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--app-text-base);
  cursor: pointer;
}

.em-paste {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.em-label {
  margin-top: 10px;
  font-weight: 700;
}

.em-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--app-radius-md);
  background: var(--td-bg-color-container);
  color: inherit;
  font: inherit;
  font-size: var(--app-text-xl);
}

.em-input:focus-visible {
  outline: 3px solid var(--td-brand-color);
  outline-offset: 1px;
  border-color: var(--td-brand-color);
}

.em-input[aria-invalid='true'] {
  border-color: var(--td-error-color-7);
}

.em-error {
  margin: 0;
  font-size: var(--app-text-base);
  font-weight: 700;
  color: var(--td-error-color-8);
}

.em-paste-btn {
  margin-top: 6px;
  align-self: flex-start;
}

.em-alert-title {
  margin: 0 0 4px;
  font-weight: 700;
}

.em-sign {
  width: 100%;
}

.em-why {
  margin: -6px 0 0;
  text-align: center;
}

@media (min-width: 600px) {
  .em-sign {
    width: auto;
    align-self: flex-start;
  }

  .em-why {
    text-align: left;
  }
}
</style>
