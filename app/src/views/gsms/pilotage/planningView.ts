/**
 * Planning : aides d'affichage seulement (dates de la grille, couleur d'une formation, écran d'une alerte, jauge).
 * Aucune règle métier : alertes, gravités, échéances et capacités viennent de GET /planning.
 */
import type { PlanningLink, PlanningSeverity } from '../../../api/gsms/pilotage'

const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string) => new Date(`${s}T00:00:00`)
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
export const todayIso = () => iso(new Date())
export const mondayOf = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7))
export const addMonths = (s: string, n: number) => { const d = parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return iso(d) }

/** Jours du lundi au dimanche qui couvrent le mois de `anchor` (5 ou 6 semaines, 42 jours au plus). */
export function monthGrid(anchor: string): { du: string; au: string; month: string; weeks: string[][] } {
  const d = parse(anchor)
  const first = iso(new Date(d.getFullYear(), d.getMonth(), 1))
  const last = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const du = mondayOf(first)
  const au = addDays(mondayOf(last), 6)
  const weeks: string[][] = []
  for (let w = du; w <= au; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)))
  return { du, au, month: first.slice(0, 7), weeks }
}

export type View = 'semaine' | 'mois' | 'liste'

/** Période demandée à l'API pour une vue (toujours ≤ 93 jours, la borne de l'API). Semaine : 7 ou 14 jours dès le lundi. */
export function rangeFor(view: View, anchor: string, span: number): { du: string; au: string } {
  if (view === 'mois') { const g = monthGrid(anchor); return { du: g.du, au: g.au } }
  if (view === 'liste') return { du: anchor, au: addDays(anchor, Math.min(span, 93) - 1) }
  const du = mondayOf(anchor)
  return { du, au: addDays(du, (span === 14 ? 14 : 7) - 1) }
}

/** Date d'ancrage après « précédent » / « suivant ». */
export function shiftAnchor(view: View, anchor: string, dir: number, span: number): string {
  if (view === 'mois') return addMonths(anchor, dir)
  if (view === 'liste') return addDays(anchor, dir * span)
  return addDays(anchor, dir * (span === 14 ? 14 : 7))
}

/** Créneau tel que le diagramme le place : ce qu'il faut de `PlanningSlot` (dates, demi-journée, horaires). */
export interface Placeable { debut: string; fin: string; periode: string | null; heure_debut: string | null; heure_fin: string | null }
/** Barre du diagramme : les créneaux d'une même session qui se suivent, d'une demi-journée `from` à `to` (exclue). */
export interface Placed<T> { items: T[]; from: number; to: number; lane: number }

/**
 * Place un créneau sur la grille en demi-journées (jour i : colonnes 2i matin, 2i + 1 après-midi) ; rien hors période.
 * Matin / après-midi tels que donnés ; avec des horaires, avant ou après 13 h ; sinon (session entière) des journées
 * pleines. Repère d'affichage seulement : les heures exactes restent dans le libellé du créneau.
 */
export function placeOnGrid(s: Placeable, du: string, au: string): { from: number; to: number } | null {
  if (s.fin < du || s.debut > au) return null
  const days = (a: string) => Math.round((parse(a).getTime() - parse(du).getTime()) / 86_400_000)
  let start = 0
  let end = 2
  if (s.periode === 'MATIN') end = 1
  else if (s.periode === 'APRES_MIDI') start = 1
  else if (s.heure_debut && s.heure_fin) { start = s.heure_debut >= '13:00' ? 1 : 0; end = s.heure_fin > '13:00' ? 2 : 1 }
  const from = s.debut < du ? 0 : days(s.debut) * 2 + start
  const to = s.fin > au ? (days(au) + 1) * 2 : days(s.fin) * 2 + Math.max(end, start + 1)
  return { from, to }
}

/**
 * Barres d'une ligne : les créneaux d'une même session (`key`) qui se suivent sans trou forment une barre, puis les
 * barres qui se chevauchent passent sur des couloirs différents pour ne pas se recouvrir à l'écran.
 */
export function packLanes<T extends Placeable>(slots: T[], du: string, au: string, key: (s: T) => string): { placed: Placed<T>[]; lanes: number } {
  const runs: Omit<Placed<T>, 'lane'>[] = []
  const last = new Map<string, Omit<Placed<T>, 'lane'>>()
  const items = slots.map((item) => ({ item, at: placeOnGrid(item, du, au) }))
    .filter((x): x is { item: T; at: { from: number; to: number } } => !!x.at)
    .sort((a, b) => a.at.from - b.at.from || b.at.to - a.at.to)
  for (const { item, at } of items) {
    const run = last.get(key(item))
    if (run && at.from <= run.to) { run.items.push(item); run.to = Math.max(run.to, at.to); continue }
    const next = { items: [item], from: at.from, to: at.to }
    runs.push(next)
    last.set(key(item), next)
  }
  const ends: number[] = []
  const placed = runs.map((run) => {
    let lane = ends.findIndex((e) => e <= run.from)
    if (lane < 0) { lane = ends.length; ends.push(0) }
    ends[lane] = run.to
    return { ...run, lane }
  })
  return { placed, lanes: Math.max(1, ends.length) }
}

/** Couleur stable d'une formation (8 teintes du thème) : repère visuel, sans signification métier. */
export const TONES = 8
export function formationTone(id: string | null | undefined): number {
  let h = 0
  for (const ch of id || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % TONES
}

/** Écran où agir pour une alerte (cible donnée par l'API). */
export function alertRoute(link: PlanningLink | null | undefined): string | null {
  if (!link) return null
  const q = link.onglet ? `?onglet=${encodeURIComponent(link.onglet)}` : ''
  switch (link.cible) {
    case 'SESSION': return link.id ? `/platform/sessions/${link.id}${q}` : null
    case 'EMARGEMENT': return link.id ? `/platform/emargement/${link.id}` : null
    case 'FORMATEUR': return link.id ? `/platform/formateurs/${link.id}` : null
    case 'SALLE': return '/platform/lieux'
    default: return null
  }
}

/** Jauge de remplissage : dessine inscrits / capacité reçus de l'API (au-delà de 100 %, la jauge est pleine). */
export function fill(inscrits: number, capacite: number | null | undefined): { pct: number; over: boolean } | null {
  if (capacite === null || capacite === undefined || capacite <= 0) return null
  return { pct: Math.min(100, Math.round((inscrits / capacite) * 100)), over: inscrits > capacite }
}

export const SEVERITIES: PlanningSeverity[] = ['HAUTE', 'MOYENNE', 'BASSE']
export const severityTheme = (g: string | null | undefined) => (g === 'HAUTE' ? 'danger' : g === 'MOYENNE' ? 'warning' : 'default')
