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

/** Identifiant HTML d'un passage du bloc « Passages retrouvés », cible des renvois depuis l'analyse par l'IA. */
export function passageAnchor(passageId: string): string {
  return `passage-${passageId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

/**
 * Repère « P1 », « P2 »… de chaque passage, dans l'ordre des références rendues par l'API : c'est la numérotation
 * avec laquelle l'IA cite les passages (`CitedPassage.passage`), reprise pour que les renvois se lisent.
 */
export function referenceLabels(references: readonly { passage_id: string }[]): Map<string, string> {
  return new Map(references.map((r, i) => [r.passage_id, `P${i + 1}`]))
}

/**
 * Remplace une proposition par la version rendue par l'API après décision (statut, date, motif viennent de l'API ;
 * rien n'est calculé ici). Liste inchangée si la proposition n'y figure pas.
 */
export function withDecision<P extends { id: string }, D extends { id: string }>(list: readonly P[], decided: D): (P | (P & D))[] {
  return list.map((p) => (p.id === decided.id ? { ...p, ...decided } : p))
}
