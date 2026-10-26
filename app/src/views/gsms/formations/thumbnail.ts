/**
 * Vignette d'une formation du catalogue (CDC §3 « Images reprises de GSMS School ») : image de
 * `assets/gsms/formations/<code en minuscules>.<jpg|png>` si elle existe, sinon aucune (la page affiche le code).
 * Seules les images copiées dans ce dossier sont publiées. Une formation dont le visuel de GSMS School est le même
 * fichier qu'une autre (toutes les fiches SST partagent la même photo) pointe vers l'image déjà copiée.
 */
const IMAGES = import.meta.glob<string>('@/assets/gsms/formations/*.{jpg,png}', { eager: true, import: 'default' })

const BY_CODE = new Map(Object.entries(IMAGES).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.(jpg|png)$/, '$1'), url]))

// Codes du catalogue repris de GSMS School (backend/config/catalogue/gsms-school.yaml) dont le visuel est le même
// fichier qu'une autre formation : une seule image copiée, réduite à 320 px (vignettes affichées en 36 à 56 px).
const SAME_AS: Record<string, string> = {
  'mac-sst': 'sst', 'sst-ini': 'sst', 'sst-mac': 'sst', 'sst-ent': 'sst', stu: 'sst',
  'ssiap1-ini': 'ssiap1', 'ssiap1-ran': 'ssiap1',
  'ssiap2-mac': 'ssiap2-ini', 'ssiap2-ran': 'ssiap2-ini', 'ssiap3-mac': 'ssiap3-ini', 'ssiap3-ran': 'ssiap3-ini',
  cssi: 'ari', esi: 'ari', ssi: 'ari', extincteur: 'br', 'mac-ovt': 'ovt', 'bs-be': 'epi',
}

export function formationThumbnail(code: string | null | undefined): string | null {
  if (!code) return null
  const key = code.toLowerCase()
  return BY_CODE.get(key) ?? BY_CODE.get(SAME_AS[key] ?? '') ?? null
}
