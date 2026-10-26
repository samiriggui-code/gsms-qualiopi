/**
 * Mise en forme des cellules riches des listes (présentation seulement : aucun calcul de montant, aucune règle).
 * Montants reçus de l'API en centimes entiers ou en euros ; dates ISO.
 */
import i18n from '@/i18n'
import { fmtDate, fmtDateTime } from './format'

const locale = () => i18n.global.locale.value

/** 480000 → « 4 800,00 € ». */
export function fmtCentimes(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(n / 100) : String(value)
}

/** « 1200.00 » → « 1 200,00 € ». */
export function fmtEuros(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(n) : String(value)
}

function parse(value: string): Date | null {
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** « il y a 3 jours », « dans 2 h » ; la date exacte va dans l'infobulle (`exactDate`). */
export function fmtRelative(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '—'
  const d = parse(value)
  if (!d) return value
  const diff = (d.getTime() - now) / 1000
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' })
  if (value.length === 10) {
    const days = Math.round((d.getTime() - new Date(new Date(now).toDateString()).getTime()) / 86400000)
    if (Math.abs(days) < 7) return rtf.format(days, 'day')
    if (Math.abs(days) < 60) return rtf.format(Math.round(days / 7), 'week')
    if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month')
    return rtf.format(Math.round(days / 365), 'year')
  }
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), 'month')
  return rtf.format(Math.round(diff / (86400 * 365)), 'year')
}

/** Date exacte d'une valeur ISO (jour seul, ou jour et heure). */
export function exactDate(value: string | null | undefined): string {
  if (!value) return ''
  return value.length === 10 ? fmtDate(value) : fmtDateTime(value)
}

/** Une cellule CSV : séparateur « ; » (tableurs français), guillemets doublés, formules neutralisées. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Fichier CSV (UTF-8 avec BOM pour les tableurs) à partir de lignes déjà mises en texte. */
export function toCsv(header: string[], rows: string[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}
