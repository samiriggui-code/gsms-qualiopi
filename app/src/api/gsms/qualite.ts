/**
 * API Qualité : évaluations du moteur, preuves, constats, actions correctives, audits internes, échéances, carnet,
 * réclamations et veille (handler/qualiopi.py, handler/qualiopi_ecrans.py, ressources CRUD). Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import { downloadFile } from './files'
import type { Capabilities, Capability } from './common'

const enc = encodeURIComponent

// ── Évaluations ────────────────────────────────────────────────────────────────

export interface EvaluationRun {
  id: string
  declencheur: string
  portee: string
  cible: string
  debut: string | null
  fin: string | null
  resultats: number
}

export interface IndicatorState {
  numero: number
  /** Nom d'usage (config/qualiopi/nomenclature.yaml), libellé officiel du référentiel à côté. */
  nom: string
  libelle_officiel: string | null
  critere: number
  critere_nom: string
  etat: string
  resultats: Record<string, number>
  controles: number
  ecarts_ouverts: number
}

export interface Evaluations {
  referentiel: string
  periode: { start: string | null; end: string | null; label: string }
  derniere: EvaluationRun | null
  evaluations: EvaluationRun[]
  indicateurs: IndicatorState[]
  capabilities: Capabilities
  avertissement: string
}

export interface ControlResult {
  id: string
  indicateur: number
  controle: string
  libelle: string
  cible: string
  type_cible: string
  session_id: string | null
  etat: string
  attendu: string | null
  constate: string | null
  explication: string | null
  manquants: { who: string; reason: string }[] | null
  revue_humaine: boolean
  evalue_le: string | null
  preuves: string[]
}

export const getEvaluations = () => http.get<Evaluations>('/qualiopi/evaluations')
export const getControlResults = () => http.get<{ total: number; resultats: ControlResult[] }>('/qualiopi/evaluations/resultats')
export const evaluateAll = () => http.post<Record<string, unknown>>('/qualiopi/evaluate', {})

export interface IndicatorChain {
  referentiel: { version: string; en_vigueur_le: string }
  critere: { numero: number; titre: string }
  indicateur: { numero: number; code: string; titre: string; portee: string; ponderation: string | null; exigences: { section: string; texte: string }[] }
  etat: string
  preuves_attendues: { type: string; libelle: string; disponibles: number; total: number }[]
  controles: { cle: string; libelle: string; gravite: string | null; remediation: string | null; resultats: { cible: string; etat: string; attendu: string | null; constate: string | null; explication: string | null }[] }[]
  preuves: { total: number; liste: { id: string; reference: string; libelle: string; statut: string; type_libelle: string }[] }
  ecarts: { id: string; reference: string; titre: string; statut: string; gravite: string | null; explication: string | null }[]
  historique: { le: string; type: string; libelle: string; par: string | null }[]
  avertissement: string
}

export const getIndicatorChain = (n: number) => http.get<IndicatorChain>(`/qualiopi/indicateurs/${n}`)

// ── Preuves ────────────────────────────────────────────────────────────────────

export interface EvidenceRow {
  id: string
  reference: string
  libelle: string
  type: string
  type_libelle: string
  statut: string
  statut_libelle: string
  portee: string
  portee_libelle: string
  cible: string | null
  session_id: string | null
  produite_le: string | null
  valide_jusqu_au: string | null
  par: string | null
  indicateurs: number[]
  problemes: string[]
  document_id: string | null
  detectee_le: string | null
  capabilities: Capabilities
}

export interface EvidenceList {
  total: number
  affichees: number
  par_statut: { statut: string; libelle: string; nombre: number }[]
  types: { type: string; libelle: string }[]
  preuves: EvidenceRow[]
}

export interface EvidenceDetail extends EvidenceRow {
  liens: { indicateur: number; titre: string | null; origine: string; statut: string; raison: string | null }[]
  grille: { code: string; question: string; exigence: string; sans_objet_possible: boolean }[]
  decisions: { decision: string; commentaire: string | null; par: string | null; le: string | null; auto_validee: boolean; grille: Record<string, string> }[]
  historique: { le: string | null; type: string; libelle: string; de: string | null; vers: string | null; detail: string | null; par: string | null }[]
}

export const listEvidence = (query: { statut?: string; type?: string; indicateur?: number | null; recherche?: string } = {}) =>
  http.get<EvidenceList>('/qualiopi/preuves', { query })
export const getEvidence = (id: string) => http.get<EvidenceDetail>(`/qualiopi/preuves/${enc(id)}`)
/** POST /evidence/{id}/validation : décision VALIDEE ou REJETEE, grille point → OUI | NON | SANS_OBJET. */
export const validateEvidence = (id: string, body: { decision: 'VALIDEE' | 'REJETEE'; comment?: string | null; checklist?: Record<string, string> | null }) =>
  http.post<Record<string, unknown>>(`/evidence/${enc(id)}/validation`, body)

// ── Constats, écarts, actions correctives ──────────────────────────────────────

export interface Finding {
  id: string
  reference: string
  origine: string
  indicateur: number | null
  titre: string
  explication: string | null
  a_faire?: string | null
  remediation?: string | null
  gravite: string | null
  etat_moteur?: string | null
  statut: string
  statut_libelle?: string
  cible?: string | null
  session?: string | null
  session_id?: string | null
  constate_le: string | null
  resolu_le?: string | null
  ouvrir_action?: Capability
}

export interface CapaRow {
  id: string
  reference: string
  type: string
  titre: string
  cause: string | null
  plan: string
  responsable: string
  echeance: string
  statut: string
  statut_libelle: string
  en_retard: boolean
  realisation: string | null
  realisee_le: string | null
  verification: string | null
  verifiee_par: string | null
  cloturee_le: string | null
  ecart: { id: string; reference: string; indicateur: number | null; titre: string } | null
  historique: { le: string; type: string; detail: string | null; par: string | null }[]
  capabilities: Capabilities
}

export interface CapaIn {
  titre: string
  plan: string
  responsable: string
  echeance: string
  cause?: string | null
  type?: string
}

export const listFindings = () => http.get<Finding[]>('/qualiopi/constats')
export const listOpenGaps = () => http.get<Finding[]>('/qualiopi/ecarts')
export const listCapa = () => http.get<CapaRow[]>('/qualiopi/actions')
export const openCapa = (findingId: string, body: CapaIn) => http.post<CapaRow>(`/qualiopi/ecarts/${enc(findingId)}/actions`, body)
export const capaStep = (capaId: string, action: string, body: { note?: string | null; motif?: string | null }) =>
  http.post<CapaRow>(`/qualiopi/actions/${enc(capaId)}/${enc(action)}`, body)

// ── Audits internes ────────────────────────────────────────────────────────────

export interface AuditSummary {
  id: string
  reference: string
  titre: string
  type: string
  type_libelle: string
  statut: string
  statut_libelle: string
  auditeur: string
  referentiel: string
  prevu_le: string | null
  photo_le: string | null
  clos_le: string | null
  periode: { du: string | null; au: string | null }
  echantillon: string[]
  progression: { juges: number; total: number }
  jugements: { jugement: string; libelle: string; nombre: number }[]
  conclusion: string | null
  capabilities: Capabilities
}

export interface AuditIndicator {
  numero: number
  titre: string
  critere: number | null
  etat_moteur: string | null
  jugement: string | null
  jugement_libelle: string | null
  commentaire: string | null
  par: string | null
  le: string | null
  resultats: Record<string, unknown>[]
  preuves: Record<string, unknown>[]
  ecarts_ouverts: Record<string, unknown>[]
  revue_humaine: unknown
  constat: string | null
}

export interface AuditDetail extends AuditSummary {
  jugements_possibles: { jugement: string; libelle: string; motif_obligatoire: boolean }[]
  indicateurs: AuditIndicator[]
  criteres: { numero: number; titre: string }[]
  avertissement: string
}

export interface AuditSample {
  periode: { label: string }
  sessions: { id: string; reference: string; formation: string | null; du: string; au: string; statut: string; proposee: boolean }[]
}

export const listAudits = () => http.get<{ audits: AuditSummary[]; capabilities: Capabilities; avertissement: string }>('/qualiopi/audits')
export const getAuditSample = () => http.get<AuditSample>('/qualiopi/audits/echantillon')
export const openAudit = (body: { titre: string; type: string; auditeur: string; prevu_le?: string | null; sessions?: string[] | null }) =>
  http.post<AuditDetail>('/qualiopi/audits', body)
export const getAudit = (id: string) => http.get<AuditDetail>(`/qualiopi/audits/${enc(id)}`)
export const judgeIndicator = (id: string, n: number, jugement: string, commentaire?: string | null) =>
  http.post<AuditDetail>(`/qualiopi/audits/${enc(id)}/indicateurs/${n}`, { jugement, commentaire: commentaire || null })
export const closeAudit = (id: string, conclusion: string) =>
  http.post<AuditDetail>(`/qualiopi/audits/${enc(id)}/cloture`, { conclusion })

// ── Échéances ──────────────────────────────────────────────────────────────────

export interface Milestone {
  session: string
  session_id: string
  key: string
  label: string
  owner: string | null
  due_on: string
  status: string
  done: number
  total: number
  missing: { who: string; enrollment_id?: string }[]
  indicators: number[]
  explanation: string
}

export const listMilestones = (days = 15) => http.get<Milestone[]>('/qualiopi/echeances', { query: { days } })

/** Jalon du circuit de session (backend/config/circuits/standard.yaml). */
export interface CircuitMilestone {
  cle: string
  libelle: string
  /** Date de référence : début (`start`) ou fin (`end`) de session. */
  ancre: 'start' | 'end' | string
  decalage_jours: number
  alerte_jours: number
  /** Type de preuve attendu. */
  preuve: string
  /** Filtre sur les faits de la preuve (ex. questionnaire à chaud ou à froid). */
  faits: Record<string, unknown>
  /** Statuts d'inscription concernés. */
  inscriptions: string[]
  responsable: string
  indicateurs: number[]
}

export interface Circuit {
  code: string
  titre: string
  jalons: CircuitMilestone[]
}

/** GET /qualiopi/circuit (`quality.read`) : circuit de session appliqué, en lecture seule. */
export const getCircuit = () => http.get<Circuit>('/qualiopi/circuit')

// ── Carnet d'audit ─────────────────────────────────────────────────────────────

export interface CarnetFiche {
  numero: number
  code: string
  titre: string
  nom: string
  critere: { numero: number; titre: string; nom: string }
  sans_objet: string | null
  ponderation: string | null
  etat: string
  revue_humaine: string | null
  enonce: string
  preuves_attendues: { type: string; libelle: string; disponibles: number }[]
  preuves: { total: number; exploitables: number; liste: { id: string; reference: string; libelle: string; statut: string }[] }
  ecarts: { id: string; reference: string; titre: string; gravite: string | null; statut: string }[]
  evolution: { type: string } | null
}

export interface Carnet {
  organisme: { nom: string; nda: string | null; siret: string | null }
  referentiel: { version: string; en_vigueur_le: string; source: string }
  prochaine_version: { version: string; en_vigueur_le: string } | null
  edite_le: string
  fiches: CarnetFiche[]
  avertissement: string
}

export const getCarnet = () => http.get<Carnet>('/qualiopi/carnet')
/** Version imprimable (HTML A4) : enregistrée comme fichier, jamais injectée dans la page. */
export const downloadCarnet = () => downloadFile('/qualiopi/carnet/impression', 'carnet-audit.html')

// ── Réclamations et veille (ressources CRUD, écriture `quality.write`) ──────────

export interface Complaint {
  id: string
  session_id: string | null
  session_reference: string | null
  kind: string
  stakeholder: string
  received_on: string
  description: string
  acknowledged_on: string | null
  answered_on: string | null
  resolved_on: string | null
  resolution: string | null
}

export type ComplaintIn = Partial<Omit<Complaint, 'id' | 'session_reference'>>

export interface WatchItem {
  id: string
  domain: string
  title: string
  source: string | null
  noted_on: string
  exploitation: string | null
  exploited_on: string | null
}

export type WatchIn = Partial<Omit<WatchItem, 'id'>>

export const listComplaints = () => http.get<Complaint[]>('/complaints')
export const createComplaint = (body: ComplaintIn) => http.post<Complaint>('/complaints', body)
export const updateComplaint = (id: string, body: ComplaintIn) => http.patch<Complaint>(`/complaints/${enc(id)}`, body)
export const deleteComplaint = (id: string) => http.delete<void>(`/complaints/${enc(id)}`)

export const listWatchItems = () => http.get<WatchItem[]>('/watch-items')
export const createWatchItem = (body: WatchIn) => http.post<WatchItem>('/watch-items', body)
export const updateWatchItem = (id: string, body: WatchIn) => http.patch<WatchItem>(`/watch-items/${enc(id)}`, body)
export const deleteWatchItem = (id: string) => http.delete<void>(`/watch-items/${enc(id)}`)

// ── Enquêtes de satisfaction (ressource CRUD /surveys, écriture `quality.write`) ──

export interface Survey {
  id: string
  session_id: string
  session_reference: string | null
  enrollment_id: string | null
  learner_name: string | null
  learner_photo_url?: string | null
  audience: string
  sent_on: string | null
  answered_on: string | null
  /** Note sur 5. */
  score: number | null
  comment: string | null
}

export type SurveyIn = Partial<Omit<Survey, 'id' | 'session_reference' | 'learner_name' | 'learner_photo_url'>>

export const listSurveys = () => http.get<Survey[]>('/surveys')
export const createSurvey = (body: SurveyIn) => http.post<Survey>('/surveys', body)
export const updateSurvey = (id: string, body: SurveyIn) => http.patch<Survey>(`/surveys/${enc(id)}`, body)
export const deleteSurvey = (id: string) => http.delete<void>(`/surveys/${enc(id)}`)
