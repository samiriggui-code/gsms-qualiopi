/**
 * API RH : formateurs et leurs titres (handler/training_resources.py, ressources CRUD /trainers,
 * /trainer-qualifications, /staff-development), personnel, contrats, absences, échéances des titres et liaison
 * des comptes (handler/hr.py, module `hr`). Référence : docs/API.md (routes, droits).
 */
import { http } from './http'

const enc = encodeURIComponent

// ── Formateurs (lecture `sessions.read`, écriture `trainers.write`) ──

export interface Trainer {
  id: string
  first_name: string
  last_name: string
  full_name: string
  email: string | null
  phone?: string | null
  /** Photo : chemin de la médiathèque (media/…), ou null (initiales). */
  photo_url?: string | null
  is_external: boolean
  specialties: string[]
  /** Présentation sur le site de l'organisme : fonction affichée et texte. */
  site_visible?: boolean
  site_title?: string | null
  site_bio?: string | null
  /** Compte GSMS relié (portée `sessions.read_own`). */
  user_id: string | null
  /** Nombre de sessions et de titres, comptés par l'API. */
  sessions: number
  qualifications: number
}

export interface TrainerIn {
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
  is_external?: boolean
  specialties?: string[]
  photo_url?: string | null
  site_visible?: boolean
  site_title?: string | null
  site_bio?: string | null
}

export const listTrainers = () => http.get<Trainer[]>('/trainers')
export const getTrainer = (id: string) => http.get<Trainer>(`/trainers/${enc(id)}`)
export const createTrainer = (body: TrainerIn) => http.post<Trainer>('/trainers', body)
export const updateTrainer = (id: string, body: TrainerIn) => http.patch<Trainer>(`/trainers/${enc(id)}`, body)
export const deleteTrainer = (id: string) => http.delete<void>(`/trainers/${enc(id)}`)

/** PUT /formateurs/{id}/compte (`users.manage`) : `null` délie le compte. */
export const linkTrainerAccount = (id: string, userId: string | null) =>
  http.put<{ formateur_id: string; compte_id: string | null }>(`/formateurs/${enc(id)}/compte`, { user_id: userId })

// ── Titres et qualifications (I21) ──

export interface TrainerQualification {
  id: string
  trainer_id: string
  trainer_name: string | null
  trainer_photo_url?: string | null
  /** CARTE_PRO_FORMATEUR_CNAPS, SSIAP3, FORMATEUR_SST, HABILITATION_ELECTRIQUE, DIPLOME, AUTRE (app/types/training.py). */
  kind: string
  label: string
  number: string | null
  obtained_on: string | null
  valid_until: string | null
  document_id: string | null
}

export interface QualificationIn {
  kind?: string
  label?: string
  number?: string | null
  obtained_on?: string | null
  valid_until?: string | null
}

/** Titres et qualifications ; `formateur` (id) limite la liste à un formateur. */
export const listQualifications = (formateur?: string) =>
  http.get<TrainerQualification[]>('/trainer-qualifications', { query: { formateur } })
/** POST /formateurs/{id}/titres (`trainers.write`) : type, numéro et dates du titre. */
export const addQualification = (trainerId: string, body: QualificationIn) =>
  http.post<{ id: string; type: string; fin: string | null }>(`/formateurs/${enc(trainerId)}/titres`, body)
/** PATCH /trainer-qualifications/{id} (`trainers.write`) : intitulé et dates seulement. */
export const updateQualification = (id: string, body: Pick<QualificationIn, 'label' | 'obtained_on' | 'valid_until'>) =>
  http.patch<TrainerQualification>(`/trainer-qualifications/${enc(id)}`, body)
export const deleteQualification = (id: string) => http.delete<void>(`/trainer-qualifications/${enc(id)}`)

/** Titre expiré ou expirant sous `jours` jours ; `etat` (EXPIRE ou A_RENOUVELER) est décidé par l'API. */
export interface TitleDeadline {
  /** Id du titre (GET /trainer-qualifications). */
  titre_id: string
  formateur: string
  formateur_id: string
  formateur_photo_url?: string | null
  type: string
  libelle: string
  fin: string
  etat: string
}

/** GET /rh/echeances (`staff.read`, module `hr`). */
export const listTitleDeadlines = (jours?: number) =>
  http.get<TitleDeadline[]>('/rh/echeances', { query: jours ? { jours } : undefined })

// ── Développement des compétences (I22) ──

export interface StaffDevelopment {
  id: string
  trainer_id: string | null
  trainer_name: string | null
  trainer_photo_url?: string | null
  label: string
  planned_on: string | null
  completed_on: string | null
}

export interface StaffDevelopmentIn {
  trainer_id?: string | null
  label?: string
  planned_on?: string | null
  completed_on?: string | null
}

/** Actions de développement des compétences ; `formateur` (id) limite la liste à un formateur. */
export const listStaffDevelopment = (formateur?: string) =>
  http.get<StaffDevelopment[]>('/staff-development', { query: { formateur } })
export const createStaffDevelopment = (body: StaffDevelopmentIn) => http.post<StaffDevelopment>('/staff-development', body)
export const updateStaffDevelopment = (id: string, body: StaffDevelopmentIn) =>
  http.patch<StaffDevelopment>(`/staff-development/${enc(id)}`, body)
export const deleteStaffDevelopment = (id: string) => http.delete<void>(`/staff-development/${enc(id)}`)

// ── Personnel, contrats, absences (module `hr` : `staff.read`, `staff.write`) ──

export interface StaffMember {
  id: string
  /** Nom complet ; `prenom` et `nom_de_famille` servent au formulaire. */
  nom: string
  prenom: string
  nom_de_famille: string
  email: string | null
  telephone: string | null
  photo_url?: string | null
  /** Code du service (GET /rh/personnel/services) et son libellé, ou null. */
  service: string | null
  service_libelle: string | null
  /** Présentation sur le site de l'organisme, dans le volet de son service. */
  site: { visible: boolean; fonction: string | null; bio: string | null }
  /** SALARIE, INDEPENDANT, SOUS_TRAITANT, INTERIMAIRE, STAGIAIRE. */
  statut: string
  fonction: string | null
  actif: boolean
  compte_id: string | null
  formateur_id: string | null
  /** Contrat qui couvre aujourd'hui, choisi par l'API. */
  contrat_en_cours: { type: string; fin: string | null } | null
  contrats: { id: string; type: string; debut: string; fin: string | null; temps: string | null }[]
  absences: { id: string; debut: string; fin: string; nature: string }[]
  /** Fiche seule (GET /rh/personnel/{id}) : titres de la fiche formateur liée. */
  titres?: { type: string; libelle: string; numero: string | null; fin: string | null }[]
}

/** Corps de POST /rh/personnel et PATCH /rh/personnel/{id} (`staff.write`) ; `active` en modification seulement. */
export interface StaffIn {
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
  kind?: string
  job_title?: string | null
  service?: string | null
  active?: boolean
  trainer_id?: string | null
  photo_url?: string | null
  site_visible?: boolean
  site_title?: string | null
  site_bio?: string | null
}

/** Effectif par service (`code` null : sans service), compté par l'API. */
export interface StaffService {
  code: string | null
  libelle: string
  effectif: number
}

export interface ContractIn {
  kind: string
  start_date: string
  end_date?: string | null
  work_time?: string | null
  note?: string | null
}

export interface AbsenceIn {
  kind: string
  start_date: string
  end_date: string
  note?: string | null
}

/** GET /rh/personnel ; `service` (code) limite la liste à un service. */
export const listStaff = (actifs = true, service?: string) => http.get<StaffMember[]>('/rh/personnel', { query: { actifs, service } })
/** GET /rh/personnel/services : volets de la page Personnel. */
export const listStaffServices = (actifs = true) => http.get<StaffService[]>('/rh/personnel/services', { query: { actifs } })
export const getStaff = (id: string) => http.get<StaffMember>(`/rh/personnel/${enc(id)}`)
export const createStaff = (body: StaffIn) => http.post<StaffMember>('/rh/personnel', body)
/** PATCH /rh/personnel/{id} : seuls les champs envoyés changent ; refus 409 lisibles (présentation sans fonction…). */
export const updateStaff = (id: string, body: StaffIn) => http.patch<StaffMember>(`/rh/personnel/${enc(id)}`, body)
export const addContract = (staffId: string, body: ContractIn) =>
  http.post<StaffMember>(`/rh/personnel/${enc(staffId)}/contrats`, body)
export const addAbsence = (staffId: string, body: AbsenceIn) =>
  http.post<StaffMember>(`/rh/personnel/${enc(staffId)}/absences`, body)
