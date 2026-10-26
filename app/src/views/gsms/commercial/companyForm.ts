/**
 * Formulaire d'une entreprise cliente (schéma CompanyIn de l'API), au format d'ActionDialog, partagé par la liste et
 * la fiche. Aucune règle ici : l'API valide (code client, SIRET…) et refuse avec un message affiché.
 */
import i18n from '@/i18n'
import type { ActionField } from '@/components/gsms/ActionDialog.vue'
import { COMPANY_FIELDS, type Company } from '@/api/gsms/entreprises'

const t = (key: string) => i18n.global.t(key)

export const companyLabel = (key: string) => t(`gsms.commercial.entreprises.champs.${key}`)

export function companyFields(row: Company | null): ActionField[] {
  return COMPANY_FIELDS.map((key) => ({
    name: key,
    label: key === 'name' ? `${companyLabel(key)} *` : companyLabel(key),
    initial: row?.[key] ?? undefined,
  }))
}
