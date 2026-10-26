/**
 * Formulaires et listes de codes des pages RH. Les codes reprennent ceux que l'API accepte (app/types/training.py
 * QUALIFICATION_KINDS, app/types/hr.py) : aucune route ne les expose, l'API reste juge et refuse un code inconnu (422).
 * Libellés : gsms.rh.codes.<CODE>.
 */
import i18n from '@/i18n'
import type { ActionField } from '@/components/gsms/ActionDialog.vue'
import type { Trainer, TrainerIn } from '@/api/gsms/rh'

const t = (key: string) => i18n.global.t(key)

export const QUALIFICATION_KINDS = ['CARTE_PRO_FORMATEUR_CNAPS', 'SSIAP3', 'FORMATEUR_SST', 'HABILITATION_ELECTRIQUE', 'DIPLOME', 'AUTRE']
export const STAFF_KINDS = ['SALARIE', 'INDEPENDANT', 'SOUS_TRAITANT', 'INTERIMAIRE', 'STAGIAIRE']
export const CONTRACT_KINDS = ['CDI', 'CDD', 'INTERIM', 'STAGE', 'APPRENTISSAGE', 'PRESTATION', 'SOUS_TRAITANCE']
export const WORK_TIMES = ['TEMPS_PLEIN', 'TEMPS_PARTIEL']
export const ABSENCE_KINDS = ['CONGE', 'MALADIE', 'FORMATION', 'AUTRE']

/** Libellé d'un code RH (gsms.rh.codes.<CODE>), le code lui-même s'il est inconnu. */
export function codeLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const key = `gsms.rh.codes.${code}`
  return i18n.global.te(key) ? t(key) : code
}
export const codeOptions = (codes: string[]) => codes.map((value) => ({ value, label: codeLabel(value) }))

const EXTERNAL = 'externe'
const INTERNAL = 'interne'

/** Champs d'une fiche formateur (création ou modification). */
export function trainerFields(row: Trainer | null): ActionField[] {
  return [
    { name: 'first_name', label: `${t('gsms.rh.formateurs.prenom')} *`, initial: row?.first_name },
    { name: 'last_name', label: `${t('gsms.rh.formateurs.nom')} *`, initial: row?.last_name },
    { name: 'email', label: t('gsms.rh.formateurs.email'), initial: row?.email ?? undefined },
    { name: 'is_external', label: t('gsms.rh.formateurs.statut'), type: 'radio', initial: row?.is_external ? EXTERNAL : INTERNAL,
      options: [{ value: INTERNAL, label: t('gsms.rh.formateurs.interne') }, { value: EXTERNAL, label: t('gsms.rh.formateurs.externe') }] },
    { name: 'specialties', label: t('gsms.rh.formateurs.specialitesAide'), initial: row?.specialties.join(', ') || undefined },
  ]
}

/** Valeurs du formulaire → corps de la requête (statut en booléen, spécialités séparées par des virgules). */
export function trainerPayload(v: Record<string, unknown>): TrainerIn {
  const out: Record<string, unknown> = { ...v }
  if ('is_external' in v) out.is_external = v.is_external === EXTERNAL
  if ('specialties' in v) {
    out.specialties = typeof v.specialties === 'string' ? v.specialties.split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  return out as TrainerIn
}
