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

// Nom court et pictogramme de chaque critère (repères d'interface ; le titre officiel reste affiché à côté).
export const CRITERIA: Record<number, { name: string; icon: LucideIcon }> = {
  1: { name: 'Informer le public', icon: Megaphone },
  2: { name: 'Concevoir la formation', icon: Target },
  3: { name: 'Accueillir, suivre, évaluer', icon: Users },
  4: { name: 'Moyens et encadrement', icon: Wrench },
  5: { name: 'Compétences des équipes', icon: GraduationCap },
  6: { name: 'Environnement professionnel', icon: Network },
  7: { name: 'Appréciations et réclamations', icon: MessagesSquare },
};

// Les indicateurs se désignent par leur nom ; le numéro n'apparaît qu'en complément (« Indicateur 17 »).
export const indicatorNumber = (n: number) => `Indicateur ${n}`;
