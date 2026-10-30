/** Coque sur téléphone : sous 768 px, le menu devient un tiroir ouvert par le bouton de la barre du haut. */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const MOBILE_QUERY = '(max-width: 767px)'

export const useGsmsShellStore = defineStore('gsmsShell', () => {
  const isMobile = ref(typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE_QUERY).matches)
  const navOpen = ref(false)

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia(MOBILE_QUERY)
    mq.addEventListener?.('change', (e) => {
      isMobile.value = e.matches
      if (!e.matches) navOpen.value = false
    })
  }

  return {
    isMobile,
    navOpen,
    openNav: () => { navOpen.value = true },
    closeNav: () => { navOpen.value = false },
  }
})
