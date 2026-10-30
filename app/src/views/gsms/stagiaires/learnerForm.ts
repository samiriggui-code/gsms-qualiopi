/**
 * Formulaire du stagiaire (schéma PersonIn de l'API : mêmes notions que la préinscription de la landing), au format
 * d'ActionDialog, partagé par la liste (création) et la fiche (modification). Aucune règle ici : l'API valide (date de
 * naissance plausible, code postal à 5 chiffres, longueurs) et ses refus s'affichent.
 */
import i18n from '@/i18n'
import type { ActionField } from '@/components/gsms/ActionDialog.vue'
import type { LearnerIn, LearnerRecord } from '@/api/gsms/sessions'
import type { Company } from '@/api/gsms/entreprises'

const t = (key: string) => i18n.global.t(key)
const c = (k: string) => t(`gsms.stagiaires.champs.${k}`)
const g = (k: string) => t(`gsms.stagiaires.groupes.${k}`)

const FRANCE = 'France'
const YES = 'oui'
const NO = 'non'

/** Né(e) en France : pays « France », ou département saisi sans pays (fiche reprise d'une préinscription). */
export function bornInFrance(row: Pick<LearnerRecord, 'birth_country' | 'birth_department'> | null): boolean {
  const country = (row?.birth_country ?? '').trim().toLowerCase()
  return country ? country === 'france' : !!row?.birth_department || !row
}

export function learnerFields(row: LearnerRecord | null, companies: Company[]): ActionField[] {
  const inFrance = (v: Record<string, unknown>) => v.born_in_france === YES
  return [
    { name: 'civility', label: c('civilite'), type: 'radio', section: g('identite'), initial: row?.civility ?? undefined,
      options: [{ value: 'M', label: c('M') }, { value: 'MME', label: c('MME') }] },
    { name: 'photo_url', label: t('gsms.photo.photo'), type: 'photo', section: g('identite'), initial: row?.photo_url ?? undefined,
      avatarFrom: ['first_name', 'last_name'] },
    { name: 'last_name', label: c('nom'), required: true, half: true, section: g('identite'), initial: row?.last_name, maxlength: 100 },
    { name: 'usage_name', label: c('nomUsage'), half: true, section: g('identite'), initial: row?.usage_name ?? undefined, maxlength: 100 },
    { name: 'first_name', label: c('prenom'), required: true, half: true, section: g('identite'), initial: row?.first_name, maxlength: 100 },

    { name: 'birth_date', label: c('dateNaissance'), type: 'date', half: true, section: g('naissance'), initial: row?.birth_date ?? undefined },
    { name: 'birth_city', label: c('villeNaissance'), half: true, section: g('naissance'), initial: row?.birth_city ?? undefined, maxlength: 120 },
    { name: 'born_in_france', label: c('neEnFrance'), type: 'radio', section: g('naissance'), initial: bornInFrance(row) ? YES : NO,
      options: [{ value: YES, label: c('oui') }, { value: NO, label: c('non') }] },
    { name: 'birth_department', label: c('departementNaissance'), half: true, section: g('naissance'), show: inFrance,
      initial: row?.birth_department ?? undefined, maxlength: 60 },
    { name: 'birth_country', label: c('paysNaissance'), half: true, section: g('naissance'), show: (v) => !inFrance(v),
      initial: bornInFrance(row) ? undefined : row?.birth_country ?? undefined, maxlength: 80 },

    { name: 'nationality', label: c('nationalite'), half: true, section: g('nationalite'), initial: row?.nationality ?? undefined, maxlength: 80 },

    { name: 'email', label: c('email'), half: true, section: g('coordonnees'), initial: row?.email ?? undefined, inputType: 'email', autocomplete: 'off' },
    { name: 'phone', label: c('telephone'), half: true, section: g('coordonnees'), initial: row?.phone ?? undefined, inputType: 'tel', autocomplete: 'off' },
    { name: 'address', label: c('adresse'), section: g('coordonnees'), initial: row?.address ?? undefined, maxlength: 300 },
    { name: 'postal_code', label: c('codePostal'), half: true, section: g('coordonnees'), initial: row?.postal_code ?? undefined,
      placeholder: c('codePostalAide'), maxlength: 10 },
    { name: 'city', label: c('ville'), half: true, section: g('coordonnees'), initial: row?.city ?? undefined, maxlength: 120 },

    { name: 'current_situation', label: c('situation'), section: g('situation'), initial: row?.current_situation ?? undefined,
      placeholder: c('situationAide'), maxlength: 300 },

    { name: 'company_id', label: c('entreprise'), type: 'select', section: g('entreprise'), initial: row?.company_id ?? undefined,
      options: companies.map((x) => ({ value: x.id, label: x.name })), help: c('aucuneEntreprise') },
  ]
}

/** Valeurs initiales de la fiche, aux noms du corps de requête (pour n'envoyer que les changements). */
export function learnerInitial(row: LearnerRecord): Record<string, unknown> {
  const keys: (keyof LearnerIn)[] = ['civility', 'photo_url', 'last_name', 'usage_name', 'first_name', 'birth_date', 'birth_city',
    'birth_department', 'birth_country', 'nationality', 'email', 'phone', 'address', 'postal_code', 'city', 'current_situation', 'company_id']
  return Object.fromEntries(keys.map((k) => [k, row[k as keyof LearnerRecord] ?? null]))
}

/**
 * Valeurs → corps de POST/PATCH /learners. Né(e) en France : pays « France » et département ; sinon pays saisi et
 * département vidé. Le choix « né(e) en France » n'est pas une donnée de l'API, il n'est pas envoyé.
 */
export function learnerPayload(v: Record<string, unknown>, initial: Record<string, unknown> | null): LearnerIn {
  const out: Record<string, unknown> = { ...v }
  const inFrance = out.born_in_france === YES
  delete out.born_in_france
  // Pays « France » seulement si la naissance est renseignée : un formulaire laissé vide n'invente rien.
  if (inFrance && (out.birth_department || out.birth_city || out.birth_date || initial?.birth_country)) {
    out.birth_country = FRANCE
  } else if (!inFrance && initial?.birth_department) {
    out.birth_department = null
  }
  if (!inFrance && out.birth_country === undefined && (initial?.birth_country ?? '').toString().toLowerCase() === 'france') {
    out.birth_country = null
  }
  if (!initial) return out as LearnerIn
  const changed: Record<string, unknown> = {}
  for (const [k, value] of Object.entries(out)) {
    if (JSON.stringify(value ?? null) !== JSON.stringify(initial[k] ?? null)) changed[k] = value
  }
  return changed as LearnerIn
}
