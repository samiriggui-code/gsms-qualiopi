/**
 * Sons discrets des opérations critiques, synthétisés par Web Audio (aucun fichier audio, aucune licence).
 * - avertissement : à l'ouverture d'une confirmation critique ;
 * - succès / erreur : après l'opération.
 * Jamais au chargement d'une page. Désactivables par l'utilisateur (Paramètres › Profil, mémorisé localement pour
 * ce compte) et coupés d'office si le système demande moins d'animations (prefers-reduced-motion).
 * Le son n'est jamais la seule information : chaque son accompagne un message ou un bandeau visible.
 */
import { ref } from 'vue'
import { loadPreference, savePreference } from '@/composables/preferenceStorage'

const KEY = 'gsms.sons'

/** Choix de l'utilisateur (vrai par défaut). */
export const soundsEnabled = ref(loadPreference(KEY) !== 'off')

export function setSoundsEnabled(on: boolean): void {
  soundsEnabled.value = on
  savePreference(KEY, on ? 'on' : 'off')
}

/** Relire le choix (ouverture du profil, changement de compte). */
export function reloadSoundPreference(): void {
  soundsEnabled.value = loadPreference(KEY) !== 'off'
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  // Relu à chaque fois : le choix est rangé sous le compte connecté (préférences par utilisateur).
  if (loadPreference(KEY) === 'off' || prefersReducedMotion()) return null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Une note douce (enveloppe courte, volume bas). */
function tone(ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.06) {
  const osc = ac.createOscillator()
  const vol = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + start)
  vol.gain.setValueAtTime(0.0001, ac.currentTime + start)
  vol.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.015)
  vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration)
  osc.connect(vol).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + duration + 0.02)
}

export type FeedbackSound = 'warning' | 'success' | 'error'

/** Joue un son de retour si l'utilisateur ne les a pas coupés. Sans effet si Web Audio est indisponible. */
export function playSound(kind: FeedbackSound): void {
  const ac = audio()
  if (!ac) return
  try {
    if (kind === 'warning') {
      tone(ac, 660, 0, 0.16, 'triangle', 0.05)
      tone(ac, 520, 0.14, 0.22, 'triangle', 0.05)
    } else if (kind === 'success') {
      tone(ac, 660, 0, 0.12)
      tone(ac, 880, 0.1, 0.2)
    } else {
      tone(ac, 330, 0, 0.18, 'square', 0.025)
      tone(ac, 247, 0.16, 0.26, 'square', 0.025)
    }
  } catch {
    /* le son est un plus : jamais bloquant */
  }
}
