/**
 * API Facturation : factures, avoirs et encaissements (handler/invoicing.py, module `invoicing`).
 * Référence : docs/API.md (routes, droits) et docs/facturation/SOURCES.md (fondements).
 * Montants en centimes entiers (`*_centimes`) : le front les met en forme, il ne calcule ni TVA ni total.
 */
import { http } from './http'
import type { Capability } from './common'

const enc = encodeURIComponent

export interface InvoiceReferences {
  types: Record<string, string>
  statuts: Record<string, string>
  clients: Record<string, string>
  modes_paiement: Record<string, string>
  unites: Record<string, string>
}

/** GET /factures/references (`invoices.read`). */
export const getInvoiceReferences = () => http.get<InvoiceReferences>('/factures/references')

export interface InvoiceClient {
  type: string
  type_libelle: string
  nom: string
  entreprise_id: string | null
  stagiaire_id: string | null
}

/** Ligne de la liste (et en-tête de la fiche). */
export interface InvoiceSummary {
  id: string
  type: 'FACTURE' | 'AVOIR'
  type_libelle: string
  numero: string | null
  titre: string
  statut: string
  statut_libelle: string
  client: InvoiceClient
  emise_le: string | null
  echeance: string | null
  en_retard: boolean
  facture_origine_id: string | null
  total_ht_centimes: number
  total_tva_centimes: number
  total_ttc_centimes: number
  avoirs_centimes: number
  encaisse_centimes: number
  reste_du_centimes: number
  trop_percu_centimes: number
  cree_le: string
  par: string | null
}

export interface InvoiceListQuery {
  type?: 'FACTURE' | 'AVOIR'
  statut?: string
  en_retard?: boolean
  q?: string
}

/** GET /factures (`invoices.read`). */
export const listInvoices = (query: InvoiceListQuery = {}) =>
  http.get<InvoiceSummary[]>('/factures', { query: { ...query, en_retard: query.en_retard || undefined } })

export interface InvoiceAlert {
  niveau: 'danger' | 'warning' | 'info'
  id: string
  message: string
}

export interface InvoiceOverview {
  brouillons: number
  statuts: Record<string, number>
  a_encaisser_centimes: number
  en_retard_centimes: number
  encaisse_ce_mois_centimes: number
  alertes: InvoiceAlert[]
}

/** GET /factures/synthese (`invoices.read`) : chiffres de l'accueil, comptés par l'API. */
export const getInvoiceOverview = () => http.get<InvoiceOverview>('/factures/synthese')

export interface InvoiceLine {
  id: string
  libelle: string
  detail: string | null
  quantite: string
  unite: string
  prix_unitaire_centimes: number
  remise_pct: string
  tva_taux: string | null
  exoneree: boolean
  montant_ht_centimes: number
  formation_id: string | null
  session_id: string | null
  inscription_id: string | null
  ligne_facture_id: string | null
  credite_centimes: number
}

/** Vérification avant émission : `bloquant` empêche l'émission ; `fondement` cite le texte ou le choix de GSMS. */
export interface InvoiceCheck {
  code: string
  message: string
  cible: string
  id: string | null
  fondement: string
  bloquant: boolean
}

export interface Payment {
  id: string
  facture_id: string
  montant_centimes: number
  date: string
  mode: string
  mode_libelle: string
  reference: string | null
  note: string | null
  par: string | null
  annule: boolean
  annule_le: string | null
  annule_par: string | null
  motif_annulation: string | null
  /** Fiche facture seulement. */
  capabilities?: { annuler: Capability }
  /** Liste GET /encaissements seulement. */
  facture?: { numero: string | null; client: string }
}

export interface InvoiceHistoryEntry {
  action: string
  le: string | null
  par: string | null
  numero?: string | null
  montant_centimes?: number
  motif?: string | null
}

export type InvoiceCapabilityName = 'modifier' | 'supprimer' | 'emettre' | 'avoir' | 'encaisser'

export interface InvoiceDetail extends InvoiceSummary {
  client: InvoiceClient & { adresse: string | null; code_postal: string | null; ville: string | null; siret: string | null }
  bon_commande: string | null
  prestation_du: string | null
  prestation_au: string | null
  note: string | null
  motif: string | null
  devis_id: string | null
  financement_source_id: string | null
  lignes: InvoiceLine[]
  tva: { taux: string | null; base_centimes: number; tva_centimes: number }[]
  mention_tva: string | null
  verifications: InvoiceCheck[]
  avoirs: InvoiceSummary[]
  encaissements: Payment[]
  document: { id: string; sha256: string; emis_le: string } | null
  historique: InvoiceHistoryEntry[]
  capabilities: Record<InvoiceCapabilityName, Capability>
}

/** GET /factures/{id} (`invoices.read`). */
export const getInvoice = (id: string) => http.get<InvoiceDetail>(`/factures/${enc(id)}`)

/** Aperçu A4 (brouillon avec filigrane, ou pièce émise archivée) : téléchargé, jamais injecté dans la page. */
export const invoicePreviewPath = (id: string) => `/factures/${enc(id)}/apercu`

export interface InvoiceCreate {
  client_type: 'ENTREPRISE' | 'STAGIAIRE' | 'FINANCEUR'
  entreprise_id?: string
  stagiaire_id?: string
  financeur?: { nom: string; adresse?: string; code_postal?: string; ville?: string; siret?: string }
  titre?: string
  devis_id?: string
  session_id?: string
  inscription_ids?: string[]
  financement_source_id?: string
}

/** POST /factures (`invoices.write`) : brouillon sans numéro. */
export const createInvoice = (body: InvoiceCreate) => http.post<InvoiceDetail>('/factures', body)

export interface InvoiceUpdate {
  titre?: string
  client_nom?: string
  client_adresse?: string | null
  client_code_postal?: string | null
  client_ville?: string | null
  client_siret?: string | null
  bon_commande?: string | null
  prestation_du?: string | null
  prestation_au?: string | null
  echeance?: string | null
  note?: string | null
}

/** PATCH /factures/{id} (`invoices.write`, brouillon seulement). */
export const updateInvoice = (id: string, body: InvoiceUpdate) => http.patch<InvoiceDetail>(`/factures/${enc(id)}`, body)

export interface InvoiceLineInput {
  libelle: string
  detail?: string | null
  quantite: string
  unite: string
  prix_unitaire_centimes: number
  remise_pct: string
  tva_taux: string | null
  exoneree: boolean
  formation_id?: string | null
  session_id?: string | null
  inscription_id?: string | null
}

/** PUT /factures/{id}/lignes (`invoices.write`) : remplace toutes les lignes ; l'API recalcule les totaux. */
export const putInvoiceLines = (id: string, lines: InvoiceLineInput[]) =>
  http.put<InvoiceDetail>(`/factures/${enc(id)}/lignes`, lines)

/** DELETE /factures/{id} (`invoices.write`, brouillon seulement). */
export const deleteInvoice = (id: string) => http.delete<void>(`/factures/${enc(id)}`)

/** POST /factures/{id}/emettre (`invoices.issue`) : numéro définitif, pièce figée. */
export const issueInvoice = (id: string) => http.post<InvoiceDetail>(`/factures/${enc(id)}/emettre`)

/** POST /factures/{id}/avoirs (`invoices.issue`) : sans lignes, avoir de tout le restant. Renvoie l'avoir. */
export const creditInvoice = (id: string, motif: string, lignes?: { ligne_id: string; montant_ht_centimes: number }[]) =>
  http.post<InvoiceDetail>(`/factures/${enc(id)}/avoirs`, { motif, lignes: lignes?.length ? lignes : undefined })

export interface PaymentInput {
  montant_centimes: number
  recu_le: string
  mode: string
  reference?: string | null
  note?: string | null
}

/** POST /factures/{id}/encaissements (`payments.write`). */
export const addPayment = (id: string, body: PaymentInput) =>
  http.post<InvoiceDetail>(`/factures/${enc(id)}/encaissements`, body)

/** GET /encaissements (`invoices.read`) : `annules` inclut les encaissements annulés. */
export const listPayments = (query: { du?: string; au?: string; annules?: boolean } = {}) =>
  http.get<Payment[]>('/encaissements', { query: { ...query, annules: query.annules || undefined } })

/** POST /encaissements/{id}/annulation (`payments.write`) : l'encaissement n'est jamais effacé. */
export const cancelPayment = (id: string, motif: string) =>
  http.post<InvoiceDetail>(`/encaissements/${enc(id)}/annulation`, { motif })
