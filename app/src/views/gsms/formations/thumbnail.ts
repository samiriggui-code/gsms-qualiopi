/**
 * Vignette d'une formation du catalogue (CDC §3 « Images reprises de GSMS School ») : image de
 * `assets/gsms/formations/<code en minuscules>.<jpg|png>` si elle existe, sinon aucune (la page affiche le code).
 * Seules les images copiées dans ce dossier sont publiées. Une formation dont le visuel de GSMS School est le même
 * fichier qu'une autre (toutes les fiches SST partagent la même photo) pointe vers l'image déjà copiée.
 */
const IMAGES = import.meta.glob<string>('@/assets/gsms/formations/*.{jpg,png}', { eager: true, import: 'default' })

const BY_CODE = new Map(Object.entries(IMAGES).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.(jpg|png)$/, '$1'), url]))

const SAME_AS: Record<string, string> = { 'mac-sst': 'sst' }

export function formationThumbnail(code: string | null | undefined): string | null {
  if (!code) return null
  const key = code.toLowerCase()
  return BY_CODE.get(key) ?? BY_CODE.get(SAME_AS[key] ?? '') ?? null
}
