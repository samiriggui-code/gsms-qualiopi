/**
 * Droits GSMS du compte connecté, tels que les décide GET /api/v1/bootstrap :
 * entrées de navigation (fonctionnalité active ET permission détenue), modules actifs et permissions effectives.
 * Le menu n'affiche que ce que ces décisions ouvrent ; l'API reste seule juge à chaque appel.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getBootstrap, type Bootstrap } from '@/api/gsms/platform'
import { tokenStorage } from '@/api/gsms/http'

export const useGsmsAccessStore = defineStore('gsmsAccess', () => {
  const bootstrap = ref<Bootstrap | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let pending: Promise<void> | null = null

  const navKeys = computed(() => new Set((bootstrap.value?.navigation ?? []).map((n) => n.key)))
  const features = computed(() => new Set(bootstrap.value?.features ?? []))
  const permissions = computed(() => new Set(bootstrap.value?.permissions ?? []))

  const hasNav = (...keys: string[]) => keys.some((k) => navKeys.value.has(k))
  const hasFeature = (code: string) => features.value.has(code)
  const can = (permission: string) => permissions.value.has(permission)

  function load(force = false): Promise<void> {
    if (!tokenStorage.get()) {
      bootstrap.value = null
      return Promise.resolve()
    }
    if (pending && !force) return pending
    if (bootstrap.value && !force) return Promise.resolve()
    loading.value = true
    pending = getBootstrap()
      .then((b) => {
        bootstrap.value = b
        error.value = null
      })
      .catch((e) => {
        error.value = e
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }

  function reset() {
    bootstrap.value = null
    error.value = null
  }

  return { bootstrap, loading, error, hasNav, hasFeature, can, load, reset }
})
