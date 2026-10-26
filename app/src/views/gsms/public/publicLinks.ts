/**
 * Présentation des pages publiques par lien signé (questionnaire, espace, émargement).
 * Rien ici ne décide : l'API valide les réponses (422 détaillé), ferme les liens (410) et autorise la signature
 * (409 motivé). On ne fait qu'afficher, guider la saisie et traduire les statuts en messages lisibles.
 */
import type { AnswerValue, PublicQuestion } from '@/api/gsms/public'

export type Answers = Record<string, AnswerValue>

/** Question affichée : sans condition, ou toutes les réponses de sa condition `si` correspondent (comme l'API). */
export function isShown(q: PublicQuestion, answers: Answers): boolean {
  return !q.si || Object.entries(q.si).every(([k, v]) => answers[k] === v)
}

export function isEmpty(v: AnswerValue | undefined): boolean {
  return v === undefined || (typeof v === 'string' && !v.trim())
}

/** Questions obligatoires affichées et laissées vides (aide à la saisie ; l'API refait le contrôle). */
export function missingRequired(shown: PublicQuestion[], answers: Answers): string[] {
  return shown.filter((q) => q.requis && isEmpty(answers[q.id])).map((q) => q.id)
}

/** Réponses envoyées : seulement celles des questions affichées, sans les champs vides. */
export function answersToSend(shown: PublicQuestion[], answers: Answers): Answers {
  const out: Answers = {}
  for (const q of shown) {
    const v = answers[q.id]
    if (!isEmpty(v)) out[q.id] = typeof v === 'string' ? v.trim() : (v as AnswerValue)
  }
  return out
}

/** 12 septembre 2026 (date ISO AAAA-MM-JJ, sans décalage de fuseau). */
export function longDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', opts)
}

/** « le 12 septembre 2026 » ou « du 12 au 14 septembre 2026 » (forme complète des deux dates). */
export function period(debut: string, fin: string): string {
  return debut === fin ? `le ${longDate(debut)}` : `du ${longDate(debut)} au ${longDate(fin)}`
}

/** Lien renvoyé par l'API affiché tel quel, à condition d'être http(s) ou relatif (jamais `javascript:`). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/** Jeton du lien personnel d'émargement : le lien entier collé (`…/emarger?jeton=…`) ou le jeton seul. */
export function extractSignToken(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const fromQuery = /[?&]jeton=([^&#\s]+)/.exec(text)
  const raw = fromQuery ? decodeURIComponent(fromQuery[1]) : text
  return /^[A-Za-z0-9_-]{16,128}$/.test(raw) ? raw : null
}

export type PublicErrorKind = 'reseau' | 'invalide' | 'ferme' | 'limite' | 'refus' | 'indisponible'

export interface PublicError {
  kind: PublicErrorKind
  /** Message de l'API quand il est destiné à la personne (410, 409, 429, 422), sinon null. */
  detail: string | null
}

/** Erreur d'appel → genre d'erreur affiché. 404 : on ne reprend pas « Lien invalide », trop sec, on guide. */
export function publicError(err: unknown): PublicError {
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : -1
  const message = err instanceof Error && err.message ? err.message : null
  if (status === 0) return { kind: 'reseau', detail: null }
  if (status === 404) return { kind: 'invalide', detail: null }
  if (status === 410) return { kind: 'ferme', detail: message }
  if (status === 429) return { kind: 'limite', detail: message }
  if (status === 409 || status === 422) return { kind: 'refus', detail: message }
  return { kind: 'indisponible', detail: null }
}

/** Erreurs par question renvoyées par l'API (422 `details: [{question, message}]`). */
export function questionErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!Array.isArray(details)) return out
  for (const d of details) {
    if (d && typeof d === 'object' && typeof d.question === 'string' && typeof d.message === 'string') out[d.question] = d.message
  }
  return out
}
