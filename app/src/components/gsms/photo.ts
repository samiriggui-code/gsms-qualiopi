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
