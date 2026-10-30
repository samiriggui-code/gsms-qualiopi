/**
 * API Entreprises clientes : ressource CRUD /companies (handler/training_resources.py, fabrique crud.py).
 * Lecture `sessions.read`, écriture `sessions.write` ; suppression refusée (409) si l'entreprise est encore utilisée.
 * Référence : docs/API.md, « Ressources CRUD du domaine formation et qualité ».
 */
import { http } from './http'

export interface Company {
  id: string
  name: string
  siret: string | null
  contact_name: string | null
  contact_email: string | null
  contact_role: string | null
  /** Code court du client (2 à 12 lettres ou chiffres) : suite de numéros de ses devis. */
  code: string | null
  address: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  created_at: string | null
  updated_at: string | null
  /** Nombre de stagiaires rattachés et d'inscriptions portées par l'entreprise, comptés par l'API. */
  learners: number
  enrollments: number
}

/** Champs acceptés par POST et PATCH (schéma CompanyIn). */
export const COMPANY_FIELDS = ['name', 'code', 'siret', 'address', 'postal_code', 'city', 'phone',
  'contact_name', 'contact_role', 'contact_email'] as const

const path = (id: string) => `/companies/${encodeURIComponent(id)}`

export const listCompanies = () => http.get<Company[]>('/companies')
export const getCompany = (id: string) => http.get<Company>(path(id))
export const createCompany = (data: Record<string, unknown>) => http.post<Company>('/companies', data)
export const updateCompany = (id: string, data: Record<string, unknown>) => http.patch<Company>(path(id), data)
export const deleteCompany = (id: string) => http.delete<void>(path(id))
