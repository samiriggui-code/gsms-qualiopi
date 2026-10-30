/** Valeurs des réglages (affichage seul, aucune règle métier). Dates : fmtDate de @/components/gsms/format. */
import i18n from '@/i18n'

const t = (key: string) => i18n.global.t(key)

export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
