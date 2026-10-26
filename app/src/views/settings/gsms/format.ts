/** Mise en forme des valeurs renvoyées par l'API (affichage seul, aucune règle métier). */
import i18n from '@/i18n'

const t = (key: string) => i18n.global.t(key)

export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return t(v ? 'gsms.parametres.commun.oui' : 'gsms.parametres.commun.non')
  if (Array.isArray(v)) {
    if (!v.length) return t('gsms.parametres.commun.aucun')
    return v.map((x) => (x && typeof x === 'object' ? Object.values(x).map((y) => formatValue(y)).join(' ') : String(x))).join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
