// Réglages propres à GSMS sur les écrans du moteur IA (WeKnora 0.8.3).
// Toutes les fonctions de WeKnora sont disponibles dans le back-office : fournisseurs de modèles, de recherche web,
// moteurs d'analyse (dont WeKnora Cloud), messageries, sources de données, moteurs vectoriels, stockages, compétences,
// bac à sable… Ce qui envoie des données hors de la machine ou donne un accès à la machine reste éteint tant qu'un
// administrateur ne l'a pas configuré : rien n'est activé d'office par ce fichier.
// Seules exceptions ci-dessous : ce qui contournerait la connexion unique GSMS, et l'assistant interne de l'API.

/**
 * Sections des paramètres masquées. Aucune aujourd'hui : chaque section reste soumise au rôle WeKnora
 * (`settingsAccess.ts`) et aux capacités du déploiement (`deploymentCapabilities.ts`).
 */
export const HIDDEN_SETTINGS_SECTIONS = new Set<string>()

/**
 * Section « Membres » en lecture seule. Les comptes du moteur IA sont créés par GSMS, un par personne, à sa première
 * session (`POST /ia/session`, rôle contributeur) ; ils suivent les droits de Paramètres › Équipe et accès.
 * Inviter, partager un lien d'inscription, changer un rôle ou retirer quelqu'un depuis le moteur IA contournerait GSMS :
 * la liste des membres et le journal d'audit restent consultables, sans ces actions.
 */
export const MEMBERS_READ_ONLY = true

/**
 * Section « Bac à sable » : visible pour les administrateurs (rôle exigé par `settingsAccess.ts`), sauf si le moteur IA
 * déclare n'avoir aucun bac à sable (`settings.sandbox` à `supported: false`). Voir la section n'active rien :
 * le bac à sable Docker (accès root à la machine par docker.sock) reste coupé tant que le moteur ne l'autorise pas
 * (`WEKNORA_SANDBOX_DOCKER_ENABLED`, seulement dans docker-compose.dev.yml) ; la page le signale alors.
 */
export function sandboxSectionVisible(capabilities: Record<string, { supported?: boolean } | undefined>): boolean {
  return capabilities['settings.sandbox']?.supported !== false
}

/**
 * Guides d'accueil de WeKnora (dialogue « Bienvenue », visites guidées des bases de connaissances, des agents,
 * des modèles…) : traduits en français (`newUserGuide`, `contextualGuide` dans fr-FR.ts), donc actifs.
 */
export const WEKNORA_GUIDES_ENABLED = true

/**
 * Agents du moteur IA cachés partout dans le back-office (liste, sélecteur, discussion) : seulement l'assistant
 * interne « Analyse documentaire (GSMS) », réservé au contrat d'analyse de l'API (jamais une discussion).
 */
export const HIDDEN_AGENT_IDS = new Set<string>()
export const HIDDEN_AGENT_NAMES = new Set(['Analyse documentaire (GSMS)'])

/** Noms français des agents intégrés (WeKnora les livre en anglais, sans traduction française). */
export const BUILTIN_AGENT_NAMES: Record<string, string> = {
  'builtin-quick-answer': 'Réponse rapide',
  'builtin-smart-reasoning': 'Raisonnement',
  'builtin-deep-researcher': 'Recherche approfondie',
  'builtin-data-analyst': 'Analyse de données',
  'builtin-knowledge-graph-expert': 'Graphe de connaissances',
  'builtin-document-assistant': 'Assistant documentaire',
  'builtin-wiki-researcher': 'Questions sur le wiki',
  'builtin-wiki-fixer': 'Correction du wiki',
  'builtin-skill-installer': 'Installation de compétences',
  'builtin-weknora-assistant': 'Assistant du moteur IA',
}

/** Descriptions françaises des agents intégrés déclarés par le moteur (ia/moteur/config/builtin_agents.yaml). */
export const BUILTIN_AGENT_DESCRIPTIONS: Record<string, string> = {
  'builtin-quick-answer': 'Questions-réponses (RAG) sur les bases de connaissances, pour des réponses rapides et précises',
  'builtin-smart-reasoning': 'Raisonnement ReAct : réflexion en plusieurs étapes et appel d\'outils',
  'builtin-data-analyst': 'Analyse des fichiers CSV et Excel : requêtes SQL et statistiques',
  'builtin-wiki-researcher': 'Répond aux questions à partir des bases de connaissances de type wiki',
  'builtin-wiki-fixer': 'Corrige les pages wiki d\'après les problèmes relevés par l\'inspection',
  'builtin-skill-installer': 'Agent interne : installe une compétence téléversée et ses dépendances dans l\'image du bac à sable',
  'builtin-weknora-assistant': 'Explique le fonctionnement du moteur IA et gère votre espace : analyse des documents, activité des bases, santé et réparations du wiki',
}

/** Agents visibles dans le back-office, sous leur nom (et leur description) en français. */
export function visibleAgents<T extends { id: string; name: string; description?: string }>(agents: T[]): T[] {
  return agents
    .filter((a) => !HIDDEN_AGENT_IDS.has(a.id) && !HIDDEN_AGENT_NAMES.has(a.name))
    .map((a) => {
      const name = BUILTIN_AGENT_NAMES[a.id]
      if (!name) return a
      const description = BUILTIN_AGENT_DESCRIPTIONS[a.id]
      return { ...a, name, ...(description && a.description !== undefined ? { description } : {}) }
    })
}
