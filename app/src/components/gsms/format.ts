/**
 * Mise en forme des réponses de l'API qualiopi pour l'affichage (pages métier GSMS).
 * Rien ici ne décide : états, refus et capacités viennent de l'API ; on ne fait que les présenter.
 * Textes : clés i18n gsms.commun.*, gsms.etats.*, gsms.saisies.*, gsms.etapes.*.
 */
import i18n from '@/i18n'
import { ApiError } from '@/api/gsms/http'

const t = (key: string, named?: Record<string, unknown>) => (named ? i18n.global.t(key, named) : i18n.global.t(key))
const te = (key: string) => i18n.global.te(key) || i18n.global.te(key, 'en-US')

/** 12/09/2026 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(i18n.global.locale.value, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** 12/09/2026 14:05 */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const loc = i18n.global.locale.value
  return `${d.toLocaleDateString(loc)} ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`
}

/** Libellé d'un code d'état renvoyé par l'API (gsms.etats.<CODE>) ; un jugement CONFORME s'affiche « Satisfait ». */
export function stateLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const key = `gsms.etats.${code}`
  return te(key) ? t(key) : code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ')
}

export type TagTheme = 'default' | 'primary' | 'success' | 'warning' | 'danger'

/** Couleur d'affichage d'un état (présentation seulement). */
const THEMES: Record<string, TagTheme> = {
  FAIT: 'success', DEMONTRABLE: 'success', CONFORME: 'success', VALIDEE: 'success', EXPLOITABLE: 'success', RECUE: 'success',
  PRESENT: 'success', TERMINEE: 'success', TERMINE: 'success', CLOTUREE: 'success', RESOLU: 'success',
  EN_RETARD: 'danger', PREUVES_INSUFFISANTES: 'danger', NC_MAJEURE: 'danger', REJETEE: 'danger', EXPIREE: 'danger',
  MANQUANTE: 'danger', MANQUANT: 'danger', ABSENT: 'danger', ANNULEE: 'danger', ANNULE: 'danger', ABANDON: 'danger',
  A_ECHEANCE: 'warning', A_RISQUE: 'warning', NC_MINEURE: 'warning', A_COMPLETER: 'warning', DEMANDEE: 'warning',
  OUVERT: 'warning', OUVERTE: 'warning', A_VERIFIER: 'warning', DETECTEE: 'warning', NON_EVALUABLE: 'warning',
  EN_COURS: 'primary', CONFIRMEE: 'primary', CONFIRME: 'primary', EN_TRAITEMENT: 'primary', DOCUMENTEE: 'primary',
  // Titres des formateurs (GET /rh/echeances), lieux et équipements (statuts des moyens)
  EXPIRE: 'danger', A_RENOUVELER: 'warning', EN_SERVICE: 'success', EN_MAINTENANCE: 'warning', HORS_SERVICE: 'danger',
}

export function stateTheme(code: string | null | undefined): TagTheme {
  return (code && THEMES[code]) || 'default'
}

/** Un détail de refus (chaîne ou objet) en une ligne lisible. */
function detailLine(d: unknown): string {
  if (d === null || d === undefined) return ''
  if (typeof d === 'string') return d
  if (typeof d === 'object') {
    return Object.entries(d as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')} : ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ')
  }
  return String(d)
}

export function detailLines(details: unknown): string[] {
  if (details === null || details === undefined) return []
  return (Array.isArray(details) ? details : [details]).map(detailLine).filter(Boolean)
}

export interface Refusal {
  status: number
  title: string
  message: string
  details: string[]
}

/** Refus de l'API prêt à afficher : 403 (droit ou module désactivé), 404, 409 (politique et ses détails), 422… */
export function toRefusal(err: unknown): Refusal {
  if (err instanceof ApiError) {
    const s = err.status
    let key = 'erreur'
    if (s === 0) key = 'apiMuette'
    else if (s === 403) key = /module/i.test(err.message) ? 'moduleDesactive' : 'accesRefuse'
    else if (s === 404) key = 'introuvable'
    else if (s === 409) key = 'actionRefusee'
    else if (s === 422) key = 'saisieIncomplete'
    else if (s >= 500) key = 'serveur'
    return { status: s, title: t(`gsms.commun.refus.${key}`), message: err.message, details: detailLines(err.details) }
  }
  return { status: -1, title: t('gsms.commun.refus.erreur'), message: err instanceof Error ? err.message : String(err), details: [] }
}

/** Une ligne, pour un message flottant. */
export function refusalText(err: unknown): string {
  const r = toRefusal(err)
  return [r.message, ...r.details].join(' — ')
}

/** Liens rendus par la feuille de route (anciens chemins du front) → pages de cette application, si elles existent. */
export function mapApiLink(link: string | null | undefined): string | null {
  if (!link) return null
  const session = /^\/formation\/sessions\/([^/?#]+)/.exec(link)
  if (session) return `/platform/sessions/${session[1]}`
  if (link.startsWith('/qualiopi/capa')) return '/platform/qualite/constats?onglet=actions'
  if (link.startsWith('/qualiopi/preuves')) return '/platform/qualite/preuves'
  return null
}

/** Libellé d'une saisie demandée par l'API (`a_saisir`). */
export function inputLabel(name: string): string {
  const key = `gsms.saisies.${name}`
  return te(key) ? t(key) : name
}

/** Libellé d'une étape du parcours (clés renvoyées par l'API). */
export function stepLabel(step: string): string {
  const key = `gsms.etapes.${step}`
  return te(key) ? t(key) : step
}
