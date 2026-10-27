// Fonctions de WeKnora gardées pour Global-IT-SS.
// Les listes ci-dessous viennent de l'API du backend : tout ce qui n'y est pas listé
// est masqué dans le back-office (fournisseurs chinois, moteurs inutilisés, services
// qui envoient les documents chez Tencent…). Le code front des autres fonctions
// abandonnées (messageries, sources de données, WeKnora Cloud…) a été supprimé.

/** Fournisseurs de modèles (`value` de /models/providers). */
export const ENABLED_MODEL_PROVIDERS = new Set([
  'openrouter', 'anthropic', 'openai', 'azure_openai', 'gemini', 'deepseek', 'nvidia',
  'litellm', 'generic', 'cohere', 'jina', 'pinecone', 'huggingface_tei',
])

/** Recherche web (`id` de /web-search-providers/types). */
export const ENABLED_WEB_SEARCH_PROVIDERS = new Set([
  'duckduckgo', 'searxng', 'google', 'bing', 'brave', 'tavily', 'exa',
])

/** Moteurs d'analyse de documents (`Name` de /system/parser-engines). */
export const DISABLED_PARSER_ENGINES = new Set(['weknoracloud'])

/**
 * Sections des paramètres masquées (le code reste).
 * GSMS : `members` (les comptes sont ceux de l'API Qualiopi, voir Paramètres › Équipe et accès),
 * `envvars` (secrets des skills), `integration-im` (messageries) et `integration-cli` (outil en ligne de commande du
 * moteur IA) n'ont pas de sens pour un organisme de formation.
 * `sandbox` n'est pas dans la liste : voir `sandboxSectionVisible`.
 */
export const HIDDEN_SETTINGS_SECTIONS = new Set([
  'members', 'envvars', 'integration-im', 'integration-cli',
])

/**
 * Section « sandbox » : visible seulement si le moteur IA déclare explicitement le sandbox Docker actif
 * (`settings.sandbox.docker` à `supported: true`). Il ne l'est que sur un poste de développement
 * (docker-compose.dev-sandbox.yml) : le sandbox Docker donne au moteur l'accès root à la machine, il reste éteint
 * en production. Un échec de la détection laisse la section masquée.
 */
export function sandboxSectionVisible(capabilities: Record<string, { supported?: boolean } | undefined>): boolean {
  return capabilities['settings.sandbox.docker']?.supported === true
}

/**
 * Guides d'accueil de WeKnora (dialogue « Bienvenue », visites guidées des bases de connaissances, des agents,
 * des modèles…). Ils recouvrent l'écran au premier passage et ne présentent que des fonctions du moteur IA :
 * désactivés dans le back-office GSMS, qui n'a pas (encore) de guide propre à ses écrans. Le code est gardé.
 */
export const WEKNORA_GUIDES_ENABLED = false

/**
 * Agents du moteur IA cachés partout dans le back-office (liste, sélecteur, discussion) :
 * - les agents intégrés de WeKnora sans usage Qualiopi (les assistants GSMS les remplacent) ;
 * - l'assistant interne « Analyse documentaire (GSMS) », réservé au contrat d'analyse de l'API (jamais une discussion).
 * « Réponse rapide » et « Raisonnement » restent : ce sont les agents par défaut de la discussion.
 */
export const HIDDEN_AGENT_IDS = new Set([
  'builtin-deep-researcher', 'builtin-data-analyst', 'builtin-knowledge-graph-expert',
  'builtin-document-assistant', 'builtin-wiki-researcher', 'builtin-wiki-fixer',
])
export const HIDDEN_AGENT_NAMES = new Set(['Analyse documentaire (GSMS)'])

/** Noms français des agents intégrés gardés (WeKnora les livre en anglais). */
export const BUILTIN_AGENT_NAMES: Record<string, string> = {
  'builtin-quick-answer': 'Réponse rapide',
  'builtin-smart-reasoning': 'Raisonnement',
}

/** Agents visibles dans le back-office, sous leur nom français. */
export function visibleAgents<T extends { id: string; name: string }>(agents: T[]): T[] {
  return agents
    .filter((a) => !HIDDEN_AGENT_IDS.has(a.id) && !HIDDEN_AGENT_NAMES.has(a.name))
    .map((a) => (BUILTIN_AGENT_NAMES[a.id] ? { ...a, name: BUILTIN_AGENT_NAMES[a.id] } : a))
}
