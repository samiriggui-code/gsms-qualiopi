/**
 * API Émargement (handler/attendance.py).
 * Référence : docs/API.md (routes, droits).
 */
import { http } from './http'
import type { Capabilities } from './common'

export interface Presence {
  enrollment_id: string
  stagiaire: string
  stagiaire_photo_url?: string | null
  etat: string
  heure: string | null
  procede: string | null
  note: string | null
}

export interface HalfDay {
  id: string
  jour: string
  periode: string
  horaires: string | null
  fenetre_signature: [string, string] | null
  contre_validee: { le: string; par: string | null } | null
  code_actif: boolean
  presences: Presence[]
  capabilities: Capabilities
}

export interface AttendanceSheet {
  session: string
  demi_journees: HalfDay[]
  sign_path: string
}

const sid = (id: string) => encodeURIComponent(id)

export const getAttendanceSheet = (sessionId: string) => http.get<AttendanceSheet>(`/sessions/${sid(sessionId)}/emargement`)
export const planSlots = (sessionId: string) => http.post<{ crees: number }>(`/sessions/${sid(sessionId)}/creneaux`, {})
export const issueSlotCode = (slotId: string) => http.post<{ code: string; qr: string }>(`/creneaux/${sid(slotId)}/code`, {})
export const recordPresence = (slotId: string, enrollmentId: string, present: boolean, note?: string | null) =>
  http.put<{ present: boolean; procede: string | null }>(`/creneaux/${sid(slotId)}/presences/${sid(enrollmentId)}`, {
    present,
    note: note || null,
  })
export const validateSlot = (slotId: string) =>
  http.post<{ contre_validee_le: string; par: string }>(`/creneaux/${sid(slotId)}/validation`, {})
