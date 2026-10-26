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
 * Sections des paramètres masquées (le code reste : les skills dépendent du sandbox).
 * GSMS : `members` (les comptes sont ceux de l'API Qualiopi, voir Paramètres › Équipe et accès),
 * `envvars` (secrets des skills, sans objet sans sandbox), `integration-im` (messageries) et
 * `integration-cli` (outil en ligne de commande du moteur IA) n'ont pas de sens pour un organisme de formation.
 */
export const HIDDEN_SETTINGS_SECTIONS = new Set([
  'sandbox', 'members', 'envvars', 'integration-im', 'integration-cli',
])
