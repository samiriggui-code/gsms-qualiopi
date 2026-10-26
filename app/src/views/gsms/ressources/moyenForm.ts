/**
 * Formulaire d'une ressource « Moyens et partenaires » pour les pages Lieux, Équipements, Sous-traitants et
 * Partenaires : mêmes champs, mêmes codes et mêmes libellés que le panneau Paramètres (views/settings/gsms/moyens.ts),
 * mis au format d'ActionDialog. Aucune règle ici : l'API valide et refuse (422, 409) avec un message affiché.
 */
import i18n from '@/i18n'
import type { ActionField } from '@/components/gsms/ActionDialog.vue'
import type { RessourceKind } from '@/api/gsms/ressources'
import { MOYENS } from '@/views/settings/gsms/moyens'

const t = (key: string) => i18n.global.t(key)
const YES = 'oui'
const NO = 'non'

const defOf = (kind: RessourceKind) => MOYENS.find((d) => d.resource === kind)!

/** Libellé d'un code accepté par l'API (gsms.parametres.moyens.valeurs.<code>). */
export const moyenValue = (code: unknown) => (code == null || code === '' ? '—' : t(`gsms.parametres.moyens.valeurs.${String(code)}`))
export const moyenLabel = (key: string) => t(`gsms.parametres.moyens.champs.${key}`)
/** Codes acceptés par l'API pour un champ (repris du panneau Paramètres). */
export const moyenOptions = (kind: RessourceKind, key: string) =>
  (defOf(kind).fields.find((f) => f.key === key)?.options ?? []).map((value) => ({ value, label: moyenValue(value) }))
/** Droit d'écriture exigé par la route. */
export const moyenWrite = (kind: RessourceKind) => defOf(kind).write

/** Champs du formulaire, préremplis par la ligne modifiée ; `premises` : lieux proposés comme rattachement. */
export function moyenFields(kind: RessourceKind, row: Record<string, unknown> | null,
  premises: { value: string; label: string }[] = []): ActionField[] {
  return defOf(kind).fields.map((f) => {
    const label = `${moyenLabel(f.key)}${f.required ? ' *' : ''}`
    const initial = row?.[f.key] ?? undefined
    switch (f.type) {
      case 'select': return { name: f.key, label, type: 'select', options: moyenOptions(kind, f.key), initial }
      case 'premises': return { name: f.key, label, type: 'select', options: premises.filter((p) => p.value !== row?.id), initial }
      case 'bool': return { name: f.key, label, type: 'radio', initial: initial === true ? YES : initial === false ? NO : undefined,
        options: [{ value: YES, label: t('gsms.parametres.commun.oui') }, { value: NO, label: t('gsms.parametres.commun.non') }] }
      case 'int': return { name: f.key, label, type: 'number', initial }
      default: return { name: f.key, label, type: f.type, initial }
    }
  })
}

/** Valeurs du formulaire → corps de la requête (oui/non redevient un booléen). */
export function moyenPayload(kind: RessourceKind, values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values }
  for (const f of defOf(kind).fields) {
    if (f.type === 'bool' && f.key in out && out[f.key] !== null) out[f.key] = out[f.key] === YES
  }
  return out
}
