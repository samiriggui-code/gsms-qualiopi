/**
 * Médiathèque : téléversement d'une photo (handler/medias.py, POST /medias/photos, multipart, champ `file`).
 * Droit : `sessions.write`, `staff.write` ou `users.manage`. L'API reconnaît le type aux premiers octets (JPEG, PNG,
 * WebP), borne le poids (2 Mo) et les dimensions, retire les métadonnées et rend le chemin à mettre dans `photo_url`.
 * La photo est ensuite lisible sans compte sous /app/media/photos/… (nom aléatoire, aucune liste exposée).
 */
import { postForm } from './files'

export interface UploadedPhoto {
  /** Chemin de la médiathèque (media/photos/<nom>), à enregistrer dans `photo_url`. */
  chemin: string
  type: string
  largeur: number
  hauteur: number
  taille: number
}

export function uploadPhoto(file: File): Promise<UploadedPhoto> {
  const form = new FormData()
  form.append('file', file)
  return postForm<UploadedPhoto>('/medias/photos', form)
}
