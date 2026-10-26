/**
 * Formulaires et listes de codes des pages RH. Les codes du personnel reprennent ceux que l'API accepte
 * (app/types/hr.py) : aucune route ne les expose, l'API reste juge et refuse un code inconnu (422).
 * Libellés : gsms.rh.codes.<CODE>. Les types de titre des formateurs viennent de GET /listes-de-valeurs.
 */
import i18n from '@/i18n'
import type { ActionField } from '@/components/gsms/ActionDialog.vue'
import type { StaffIn, StaffMember, StaffService, Trainer, TrainerIn } from '@/api/gsms/rh'

const t = (key: string) => i18n.global.t(key)

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

/** Présentation sur le site : la fonction affichée est demandée quand la personne est visible (l'API tranche). */
const visibleOnSite = (v: Record<string, unknown>) => v.site_visible === true

/** Champs d'une fiche formateur (création ou modification), groupés. */
export function trainerFields(row: Trainer | null): ActionField[] {
  const g = (k: string) => t(`gsms.rh.formateurs.groupes.${k}`)
  return [
    { name: 'photo_url', label: t('gsms.photo.photo'), type: 'photo', section: g('identite'), initial: row?.photo_url ?? undefined,
      avatarFrom: ['first_name', 'last_name'] },
    { name: 'first_name', label: t('gsms.rh.formateurs.prenom'), required: true, half: true, section: g('identite'), initial: row?.first_name, maxlength: 100 },
    { name: 'last_name', label: t('gsms.rh.formateurs.nom'), required: true, half: true, section: g('identite'), initial: row?.last_name, maxlength: 100 },
    { name: 'email', label: t('gsms.rh.formateurs.email'), half: true, section: g('coordonnees'), initial: row?.email ?? undefined,
      inputType: 'email', autocomplete: 'off' },
    { name: 'phone', label: t('gsms.rh.formateurs.telephone'), half: true, section: g('coordonnees'), initial: row?.phone ?? undefined,
      inputType: 'tel', maxlength: 40, autocomplete: 'off' },
    { name: 'is_external', label: t('gsms.rh.formateurs.statut'), type: 'radio', section: g('activite'), initial: row?.is_external ? EXTERNAL : INTERNAL,
      options: [{ value: INTERNAL, label: t('gsms.rh.formateurs.interne') }, { value: EXTERNAL, label: t('gsms.rh.formateurs.externe') }] },
    { name: 'specialties', label: t('gsms.rh.formateurs.specialitesAide'), section: g('activite'), initial: row?.specialties.join(', ') || undefined },
    { name: 'site_visible', label: t('gsms.rh.formateurs.visibleSite'), type: 'switch', section: g('site'), initial: !!row?.site_visible },
    { name: 'site_title', label: t('gsms.rh.formateurs.fonctionSite'), section: g('site'), initial: row?.site_title ?? undefined,
      required: visibleOnSite, help: t('gsms.rh.formateurs.fonctionSiteAide'), maxlength: 200 },
    { name: 'site_bio', label: t('gsms.rh.formateurs.bioSite'), type: 'textarea', section: g('site'), initial: row?.site_bio ?? undefined,
      help: t('gsms.rh.formateurs.bioSiteAide'), maxlength: 1000 },
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

/** Champs d'une fiche du personnel (création ou modification), groupés ; services lus dans GET /rh/personnel/services. */
export function staffFields(row: StaffMember | null, services: StaffService[], trainers: Trainer[]): ActionField[] {
  const g = (k: string) => t(`gsms.rh.personnel.groupes.${k}`)
  const fields: ActionField[] = [
    { name: 'photo_url', label: t('gsms.photo.photo'), type: 'photo', section: g('identite'), initial: row?.photo_url ?? undefined,
      avatarFrom: ['first_name', 'last_name'] },
    { name: 'first_name', label: t('gsms.rh.formateurs.prenom'), required: true, half: true, section: g('identite'), initial: row?.prenom, maxlength: 100 },
    { name: 'last_name', label: t('gsms.rh.formateurs.nom'), required: true, half: true, section: g('identite'), initial: row?.nom_de_famille, maxlength: 100 },
    { name: 'email', label: t('gsms.rh.formateurs.email'), half: true, section: g('coordonnees'), initial: row?.email ?? undefined,
      inputType: 'email', maxlength: 200, autocomplete: 'off' },
    { name: 'phone', label: t('gsms.rh.personnel.telephone'), half: true, section: g('coordonnees'), initial: row?.telephone ?? undefined,
      inputType: 'tel', maxlength: 40, autocomplete: 'off' },
    { name: 'kind', label: t('gsms.rh.personnel.statut'), type: 'select', half: true, section: g('poste'), options: codeOptions(STAFF_KINDS),
      initial: row?.statut ?? 'SALARIE', required: true },
    { name: 'job_title', label: t('gsms.rh.personnel.fonction'), half: true, section: g('poste'), initial: row?.fonction ?? undefined, maxlength: 150 },
    { name: 'service', label: t('gsms.rh.personnel.service'), type: 'select', half: true, section: g('poste'), initial: row?.service ?? undefined,
      options: services.filter((s) => s.code).map((s) => ({ value: s.code!, label: s.libelle })) },
    { name: 'trainer_id', label: t('gsms.rh.personnel.ficheFormateur'), type: 'select', half: true, section: g('poste'),
      initial: row?.formateur_id ?? undefined, options: trainers.map((f) => ({ value: f.id, label: f.full_name })) },
  ]
  if (row) {
    fields.push({ name: 'active', label: t('gsms.rh.personnel.actif'), type: 'switch', section: g('poste'), initial: row.actif,
      help: t('gsms.rh.personnel.actifAide') })
  }
  fields.push(
    { name: 'site_visible', label: t('gsms.rh.formateurs.visibleSite'), type: 'switch', section: g('site'), initial: !!row?.site.visible },
    { name: 'site_title', label: t('gsms.rh.formateurs.fonctionSite'), section: g('site'), initial: row?.site.fonction ?? undefined,
      required: visibleOnSite, help: t('gsms.rh.formateurs.fonctionSiteAide'), maxlength: 200 },
    { name: 'site_bio', label: t('gsms.rh.formateurs.bioSite'), type: 'textarea', section: g('site'), initial: row?.site.bio ?? undefined,
      help: t('gsms.rh.formateurs.bioSiteAide'), maxlength: 1000 },
  )
  return fields
}

/**
 * Valeurs → corps de la requête. En modification, seuls les champs changés partent (PATCH partiel de l'API) : une fiche
 * reprise de la landing n'est pas réécrite à l'identique.
 */
export function changedOnly<T extends object>(v: Record<string, unknown>, initial: Record<string, unknown> | null): T {
  if (!initial) return v as T
  const out: Record<string, unknown> = {}
  for (const [k, value] of Object.entries(v)) {
    const before = initial[k] ?? null
    if (JSON.stringify(value ?? null) !== JSON.stringify(before)) out[k] = value
  }
  return out as T
}

/** Valeurs initiales d'une fiche du personnel, aux noms du corps de requête (pour `changedOnly`). */
export function staffInitial(row: StaffMember): Record<string, unknown> {
  return {
    photo_url: row.photo_url ?? null, first_name: row.prenom, last_name: row.nom_de_famille, email: row.email, phone: row.telephone,
    kind: row.statut, job_title: row.fonction, service: row.service, trainer_id: row.formateur_id, active: row.actif,
    site_visible: row.site.visible, site_title: row.site.fonction, site_bio: row.site.bio,
  } satisfies Record<keyof StaffIn, unknown> as Record<string, unknown>
}
