/**
 * Une source de données de l'API pour une page : sa réponse, ou son refus (affiché tel quel, jamais remplacé par
 * une liste vide ou des compteurs à zéro), et l'état de chargement.
 */
import { reactive } from 'vue'

export interface ApiSource<T> {
  data: T | null
  error: unknown
  loading: boolean
}

export function useApiSource<T>(load: () => Promise<T>, immediate = true) {
  const state = reactive({ data: null, error: null, loading: false }) as ApiSource<T>
  async function run() {
    state.loading = true
    state.error = null
    try {
      state.data = await load()
    } catch (e) {
      state.error = e
      state.data = null
    } finally {
      state.loading = false
    }
  }
  if (immediate) void run()
  return { state, run }
}
