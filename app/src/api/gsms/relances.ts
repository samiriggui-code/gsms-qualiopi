/**
 * API Relances et communications (handler/relances.py).
 * Référence : docs/API.md (routes, droits). Rangé par domaine, comme api/<domaine>/ du template.
 */
import { http } from './http'
import { downloadFile } from './files'

export interface RelanceRule {
  cle: string
  libelle: string
  portee: string
  destinataire?: string | null
  ancre?: string | null
  decalages?: number[] | null
  jour?: string | null
  modele?: string | null
  externe?: boolean
  /** Indicateurs Qualiopi que la règle aide à démontrer. */
  indicateurs?: number[]
  [extra: string]: unknown
}

export const listRelanceRules = () => http.get<RelanceRule[]>('/communications/regles')

/** Statuts d'un message (app/types/relances.py, MESSAGE_STATUSES). */
export type MessageStatus = 'A_VALIDER' | 'PREVU' | 'ENVOYE' | 'ECHEC' | 'ANNULE' | 'SANS_ADRESSE'

export interface MessageRow {
  id: string
  reference: string
  regle: string
  modele: string
  version_modele: number
  externe: boolean
  destinataire: { type: string; nom: string | null; email: string | null }
  objet: string
  statut: MessageStatus | string
  prevu_le: string
  session_id: string | null
  inscription_id: string | null
  indicateurs: number[]
  valide_par: string | null
  valide_le: string | null
  envoye_le: string | null
  identifiant_envoi: string | null
  tentatives: number
  erreur: string | null
  motif_annulation: string | null
  empreinte: string | null
  cree_le: string | null
}

/** GET /communications/{id} : le message et son contenu (texte brut affiché, HTML seulement téléchargé). */
export interface MessageDetail extends MessageRow {
  html: string
  texte: string
}

/** État de l'envoi : OK, A_VERIFIER (réglage incomplet) ou EN_PANNE (dernier échec venu du serveur d'envoi). */
export interface DeliveryStatus {
  etat: 'OK' | 'A_VERIFIER' | 'EN_PANNE' | string
  motif: string | null
  dernier_envoi: string | null
}

export interface MessageList {
  compteurs: Record<string, number>
  envoi: DeliveryStatus
  messages: MessageRow[]
}

/** POST /communications/planifier : messages créés par le planificateur, puis envoyés, annulés ou en échec. */
export interface PlannerRun {
  crees?: number
  envoyes?: number
  annules?: number
  echecs?: number
  en_erreur?: number
  inactif?: boolean
}

const enc = encodeURIComponent

export const listMessages = (query: { statut?: string; session_id?: string; limite?: number } = {}, signal?: AbortSignal) =>
  http.get<MessageList>('/communications', { query, signal })
export const getMessage = (id: string) => http.get<MessageDetail>(`/communications/${enc(id)}`)
/** Aperçu HTML tel qu'envoyé : téléchargé avec le jeton (fetch + blob), jamais injecté dans la page. */
export const downloadMessagePreview = (id: string, reference: string) =>
  downloadFile(`/communications/${enc(id)}/apercu`, `${reference}-apercu.html`)
export const validateMessage = (id: string) => http.post<MessageRow>(`/communications/${enc(id)}/valider`)
export const cancelMessage = (id: string, motif: string) => http.post<MessageRow>(`/communications/${enc(id)}/annuler`, { motif })
export const retryMessage = (id: string) => http.post<MessageRow>(`/communications/${enc(id)}/renvoyer`)
export const runPlanner = () => http.post<PlannerRun>('/communications/planifier')
