/**
 * Règles de pluriel spécifiques par langue. Le français et l'anglais utilisent
 * la règle par défaut de vue-i18n (« un » / « autre »).
 */
export const pluralRules: Record<string, (choice: number, choicesLength: number) => number> = {}
