/**
 * Confirmation renforcée des opérations irréversibles ou lourdes de conséquences (émettre, supprimer, désactiver…),
 * affichée par `GsmsCriticalHost` (monté une fois dans App.vue) avec le même dialogue que `ActionDialog danger`.
 * L'opération (`run`) est appelée par le dialogue : en cas de refus de l'API, le motif s'affiche et le dialogue reste
 * ouvert. La promesse rend le résultat de l'opération, ou `undefined` si l'utilisateur a renoncé.
 */
import { reactive } from 'vue'
import type { ActionField } from './ActionDialog.vue'

export interface CriticalOptions {
  title: string
  /** Rappel de la conséquence (texte de l'API s'il existe, sinon texte fixe exact). */
  consequence?: string
  intro?: string
  confirmLabel: string
  /** Référence à ressaisir (facture, session…) pour les opérations les plus graves. */
  confirmText?: string
  fields?: (ActionField | string)[]
  run: (values: Record<string, any>) => Promise<unknown>
}

interface CriticalState {
  visible: boolean
  options: CriticalOptions | null
  resolve: ((v: unknown) => void) | null
  done: boolean
}

export const criticalState = reactive<CriticalState>({ visible: false, options: null, resolve: null, done: false })

export function confirmCritical<R = unknown>(options: CriticalOptions): Promise<R | undefined> {
  criticalState.resolve?.(undefined)
  return new Promise((resolve) => {
    criticalState.options = options
    criticalState.done = false
    criticalState.resolve = resolve as (v: unknown) => void
    criticalState.visible = true
  })
}

export function settleCritical(result: unknown, done: boolean): void {
  const r = criticalState.resolve
  criticalState.resolve = null
  criticalState.visible = false
  r?.(done ? result : undefined)
}
