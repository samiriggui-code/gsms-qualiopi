/**
 * Présentation de la réponse de POST /ia/analyses (fiche indicateur, onglet « Analyse documentaire »).
 * Mise en forme seulement : aucune règle métier, aucun calcul de conformité. Les passages gardent l'ordre rendu par
 * l'API (déjà trié par la recherche) ; leur score n'est jamais exposé.
 */

/** Champs d'une référence utiles au regroupement (sous-ensemble d'`AnalysisReference`). */
export interface GroupableReference {
  base: string
  passage_id: string
}

export interface ReferenceGroup<R extends GroupableReference> {
  base: string
  references: R[]
}

/** Ordre d'affichage des bases connues ; une base inconnue suit, dans l'ordre où elle apparaît. */
export const BASE_ORDER = ['referentiel', 'organisme'] as const

/** Regroupe les passages par base, sans réordonner les passages à l'intérieur d'une base. Groupes vides omis. */
export function groupReferencesByBase<R extends GroupableReference>(references: readonly R[]): ReferenceGroup<R>[] {
  const groups = new Map<string, R[]>()
  for (const r of references) {
    const list = groups.get(r.base)
    if (list) list.push(r)
    else groups.set(r.base, [r])
  }
  const known = BASE_ORDER.filter((b) => groups.has(b)) as string[]
  const others = [...groups.keys()].filter((b) => !known.includes(b))
  return [...known, ...others].map((base) => ({ base, references: groups.get(base)! }))
}

/** Question envoyée à l'API : espaces retirés, vide → absente (l'API part alors de l'énoncé de l'indicateur). */
export function cleanQuestion(question: string | null | undefined, max = 500): string | undefined {
  const q = (question ?? '').trim()
  return q ? q.slice(0, max) : undefined
}
