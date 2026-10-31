/**
 * Champ photo (GsmsPhotoField) : photos de la médiathèque proposées au choix et contrôle de confort avant l'envoi.
 * Le contrôle ne décide rien : l'API vérifie elle-même le fichier (premiers octets, poids, dimensions) et ses refus
 * s'affichent tels quels.
 */

/**
 * Photos de `app/public/media/avatars/` (fichiers 300-1.png à 300-34.png, reprises de GSMS School). Liste figée :
 * `public/` n'est pas importable par Vite et aucune route ne liste la médiathèque.
 */
export const AVATAR_LIBRARY: readonly string[] = Array.from({ length: 34 }, (_, i) => `media/avatars/300-${i + 1}.png`)

/** Vignettes et logos des formations de la médiathèque (public/media/formations) ; ni logo d'organisme public
 * (CNAPS…) ni visuel d'un autre organisme. */
export const FORMATION_LIBRARY: readonly string[] = [
  'media/formations/vignettes/ari.jpg',
  'media/formations/vignettes/asc-cyno.jpg',
  'media/formations/vignettes/asra-d.jpg',
  'media/formations/vignettes/br.jpg',
  'media/formations/vignettes/epi.jpg',
  'media/formations/vignettes/evacuation.jpg',
  'media/formations/vignettes/guide-file.jpg',
  'media/formations/vignettes/h0b0.jpg',
  'media/formations/vignettes/mac-aps.jpg',
  'media/formations/vignettes/ovt.jpg',
  'media/formations/vignettes/ssiap1-mac.jpg',
  'media/formations/vignettes/ssiap1.jpg',
  'media/formations/vignettes/ssiap2-ini.jpg',
  'media/formations/vignettes/ssiap3-ini.jpg',
  'media/formations/vignettes/sst.jpg',
  'media/formations/vignettes/tfp-aps.jpg',
  'media/formations/Logo-TFP-APS.png',
  'media/formations/Logo-MAC-APS.png',
  'media/formations/Logo_TitreASCynophile.png',
  'media/formations/ssiap1.png',
  'media/formations/SSIAP1-RECYCLAGE.jpg',
  'media/formations/SSIAP2.png',
  'media/formations/SSIAP3.png',
  'media/formations/logo-SSIAP-1-.jpg',
  'media/formations/logo-sst.jpg',
  'media/formations/Logo-H0B0.58.jpg',
  'media/formations/Logo-EPI-1140x458.jpg',
  'media/formations/Logo-Evacuation-1140x458.jpg',
  'media/formations/Logo-Manipulation-Extincteurs.jpg',
]

/** Types et poids acceptés par POST /medias/photos (backend/app/common/images.py). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024

/**
 * Motif d'un refus de confort (`type` ou `poids`), `null` si le fichier peut être envoyé à l'API. Un type inconnu du
 * navigateur (chaîne vide) passe : l'API reconnaît le format aux premiers octets.
 */
export function photoProblem(file: { type: string; size: number }): 'type' | 'poids' | null {
  if (file.type && !(PHOTO_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > PHOTO_MAX_BYTES) return 'poids'
  return null
}
