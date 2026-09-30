import {
  GraduationCap,
  Megaphone,
  MessagesSquare,
  Network,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// Pictogramme de chaque critère. Les noms affichés viennent de l'API (config/qualiopi/nomenclature.yaml).
export const CRITERION_ICONS: Record<number, LucideIcon> = {
  1: Megaphone,
  2: Target,
  3: Users,
  4: Wrench,
  5: GraduationCap,
  6: Network,
  7: MessagesSquare,
};

// Les indicateurs se désignent par leur nom ; le numéro n'apparaît qu'en complément (« Indicateur 17 »).
export const indicatorNumber = (n: number) => `Indicateur ${n}`;

// Normalisation pour la recherche : minuscules, sans accents.
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// Retrouve un indicateur par son nom, son libellé, « indicateur 4 », « I04 » ou « 4 ».
export function matchesIndicator(
  query: string,
  numero: number,
  recherche: string,
) {
  const q = normalize(query).replace(/\s+/g, ' ');
  if (!q) return true;
  if (/^\d+$/.test(q)) return Number(q) === numero;
  return recherche.includes(q);
}
