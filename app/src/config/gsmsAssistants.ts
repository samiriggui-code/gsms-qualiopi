// Assistants Qualiopi préréglés dans l'espace du moteur IA par le backend
// (backend/app/application/service/ia/assistants.py, commande ia-preparer).
// Leur identifiant change d'une installation à l'autre : on les reconnaît à leur nom, identique à celui du backend.
// Un assistant absent (ia-preparer pas encore lancé, aucun modèle configuré) doit être signalé, jamais simulé.

export const GSMS_ASSISTANTS = {
  referentiel: 'Référentiel Qualiopi',
  preparationAudit: "Préparation d'audit",
  resultats: 'Résultats et satisfaction',
} as const

export type GsmsAssistantKey = keyof typeof GSMS_ASSISTANTS

/** L'assistant préréglé `key` dans une liste d'agents du moteur (`GET /api/v1/agents`), ou `undefined`. */
export function findGsmsAssistant<T extends { name?: string }>(agents: T[], key: GsmsAssistantKey): T | undefined {
  return agents.find((agent) => agent.name === GSMS_ASSISTANTS[key])
}
