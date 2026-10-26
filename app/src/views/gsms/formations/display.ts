/** Mise en forme propre aux pages « Offre de formation » (présentation seulement). */
import i18n from '@/i18n'

/** Durée en heures renvoyée par l'API (« 70.00 » ou 70) → « 70 h ». */
export function hours(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isNaN(n) ? String(value) : i18n.global.t('gsms.formations.nHeures', { n: n.toLocaleString(i18n.global.locale.value) })
}

/** Montant en euros renvoyé par l'API → « 1 200 € ». */
export function euros(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  return Number.isNaN(n) ? String(value)
    : n.toLocaleString(i18n.global.locale.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
}
