/** Types communs aux réponses de l'API qualiopi (décisions motivées). */

/** Décision de l'API sur une action : autorisée, ou refusée avec un code, un message et parfois des détails. */
export interface Capability {
  allowed: boolean
  code?: string
  message?: string
  details?: unknown
  libelle?: string
  /** Saisies que l'API exigera au moment de l'action (date, motif, note…). */
  a_saisir?: string[]
}

export type Capabilities = Record<string, Capability>
