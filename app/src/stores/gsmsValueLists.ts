/**
 * Listes de valeurs de l'API (GET /api/v1/listes-de-valeurs) : codes acceptés en saisie et leurs libellés.
 * Chargées une fois par session ; le front n'en recopie aucune, l'API reste juge et refuse un code inconnu.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listValueLists, type ValueList, type ValueListCode } from '@/api/gsms/platform'

interface ValueOption {
  value: string
  label: string
}

export const useGsmsValueListsStore = defineStore('gsmsValueLists', () => {
  const lists = ref<ValueList[] | null>(null)
  const error = ref<unknown>(null)
  let pending: Promise<void> | null = null

  const byCode = computed(() => new Map((lists.value ?? []).map((l) => [l.code, l])))

  function load(force = false): Promise<void> {
    if (pending) return pending
    if (lists.value && !force) return Promise.resolve()
    pending = listValueLists()
      .then((l) => {
        lists.value = l
        error.value = null
      })
      .catch((e) => {
        error.value = e
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  /** Valeurs d'une liste, dans l'ordre de l'API (vide tant que la liste n'est pas chargée). */
  const options = (code: ValueListCode): ValueOption[] =>
    (byCode.value.get(code)?.valeurs ?? []).map((v) => ({ value: v.code, label: v.libelle }))

  /** Libellé d'un code ; le code lui-même s'il est inconnu de la liste, « — » s'il est vide. */
  const label = (code: ValueListCode, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—'
    return byCode.value.get(code)?.valeurs.find((v) => v.code === value)?.libelle ?? String(value)
  }

  return { lists, error, load, options, label }
})
