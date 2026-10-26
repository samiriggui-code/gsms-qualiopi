/**
 * Vignette d'une formation du catalogue (CDC §3 « Images reprises de GSMS School ») : image de
 * `assets/gsms/formations/<code en minuscules>.<jpg|png>` si elle existe, sinon aucune (la page affiche le code).
 * Seules les images copiées dans ce dossier sont publiées.
 */
const IMAGES = import.meta.glob<string>('@/assets/gsms/formations/*.{jpg,png}', { eager: true, import: 'default' })

const BY_CODE = new Map(Object.entries(IMAGES).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.(jpg|png)$/, '$1'), url]))

export function formationThumbnail(code: string | null | undefined): string | null {
  return code ? BY_CODE.get(code.toLowerCase()) ?? null : null
}
