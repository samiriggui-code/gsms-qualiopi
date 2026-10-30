<template>
  <section v-if="cards.length" class="help" :aria-label="t('gsms.aide.titre')">
    <article v-for="c in cards" :key="c.key" class="help-card">
      <div class="help-text">
        <h2>{{ c.title }}</h2>
        <p>{{ c.text }}</p>
        <t-button size="small" variant="outline" @click="c.go">{{ c.cta }}<template #suffix><t-icon name="chevron-right" /></template></t-button>
      </div>
      <GsmsIllustration :n="c.illus" :height="130" class="help-illus" />
    </article>
  </section>
</template>

<script lang="ts">
// Recherche de la base faite une fois par chargement de l'application (partagée entre les pages).
let lookup: Promise<string | null> | null = null
</script>

<script setup lang="ts">
/**
 * Cartes d'aide en bas des vues d'ensemble et des listes (repris de l'ancienne application, `help.tsx`/`engage.tsx`).
 * Seulement ce qui existe : l'assistant IA (écran de conversation du moteur IA) et la base de connaissances
 * « Référentiel Qualiopi » préparée par l'API (`ia/espace.py`), ou à défaut la liste des bases de connaissances.
 * Sans la permission `ia.use`, le bloc n'apparaît pas (l'assistant ne serait pas ouvert à ce compte).
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import GsmsIllustration from './GsmsIllustration.vue'
import { useGsmsAccessStore } from '@/stores/gsmsAccess'
import { listKnowledgeBases } from '@/api/knowledge-base'

const REFERENTIEL_NAME = 'Référentiel Qualiopi'

const props = withDefaults(defineProps<{ context?: string }>(), { context: '' })
const { t, te } = useI18n()
const router = useRouter()
const access = useGsmsAccessStore()
const canIa = computed(() => access.can('ia.use'))

const kbId = ref<string | null>(null)
async function findReferentiel(): Promise<string | null> {
  try {
    const res = (await listKnowledgeBases()) as { data?: { id: string; name: string }[] }
    return (res?.data ?? []).find((kb) => kb.name === REFERENTIEL_NAME)?.id ?? null
  } catch {
    return null
  }
}
onMounted(async () => {
  await access.load()
  if (!canIa.value) return
  lookup ??= findReferentiel()
  kbId.value = await lookup
  if (!kbId.value) lookup = null // base absente ou moteur muet : on réessaiera sur la page suivante
})

const questionText = computed(() => {
  const key = `gsms.aide.questionTexteSection.${props.context}`
  return props.context && te(key) ? t(key) : t('gsms.aide.questionTexte')
})

const cards = computed(() => {
  if (!canIa.value) return []
  const list = [{
    key: 'assistant', illus: 2, title: t('gsms.aide.questionTitre'), text: questionText.value, cta: t('gsms.aide.questionAction'),
    go: () => router.push({ name: 'globalCreatChat' }),
  }]
  // Toujours la seconde carte : la base « Référentiel Qualiopi » si le moteur IA la donne, sinon la liste des bases.
  const id = kbId.value
  list.push(id
    ? { key: 'referentiel', illus: 4, title: t('gsms.aide.referentielTitre'), text: t('gsms.aide.referentielTexte'),
      cta: t('gsms.aide.referentielAction'), go: () => router.push(`/platform/knowledge-bases/${id}`) }
    : { key: 'bases', illus: 4, title: t('gsms.aide.basesTitre'), text: t('gsms.aide.basesTexte'),
      cta: t('gsms.aide.basesAction'), go: () => router.push('/platform/knowledge-bases') })
  return list
})
</script>

<style scoped lang="less">
.help {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  // Suit le contenu avec un espacement fixe : jamais repoussé en bas de la fenêtre sous une liste courte.
  margin-top: 40px;
  @media (max-width: 767px) { grid-template-columns: minmax(0, 1fr); }
}
.help-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--app-radius-lg);
  background: var(--td-bg-color-container);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--td-text-color-primary) 5%, transparent),
    0 6px 16px -8px color-mix(in srgb, var(--td-text-color-primary) 14%, transparent);
  @media (max-width: 520px) { flex-direction: column-reverse; align-items: stretch; text-align: left; padding: 16px; }
}
.help-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  flex: 1;
  min-width: 0;
  h2 { margin: 0; font-family: var(--app-font-family-display); color: var(--td-text-color-primary); font-size: var(--app-text-xl); font-weight: 600; line-height: 26px; }
  p { margin: 0 0 4px; color: var(--td-text-color-secondary); font-size: var(--app-text-md); line-height: 20px; }
}
.help-illus { flex-shrink: 0; max-width: 42%; @media (max-width: 520px) { max-width: 100%; } }
</style>
