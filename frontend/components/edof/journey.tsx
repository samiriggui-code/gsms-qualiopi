import { cn } from '@/lib/utils';

// Les dix étapes du parcours, et l'écran où chacune se fait. Purement descriptif : l'état de chaque
// dossier vient de l'API.
export const JOURNEY = [
  { n: 1, label: 'Situation administrative', where: 'Référencement CPF' },
  { n: 2, label: 'Choisir une formation', where: 'Référencement CPF' },
  { n: 3, label: 'Programme validé', where: 'Onglet Programme' },
  { n: 4, label: 'Contenus, intervenants, moyens', where: 'Onglet Contenus' },
  {
    n: 5,
    label: 'Certification et habilitations',
    where: 'Onglet Certification',
  },
  { n: 6, label: 'Contrôles', where: 'Onglet Contrôles' },
  { n: 7, label: 'Corriger les manques', where: 'Depuis chaque anomalie' },
  { n: 8, label: 'Documents et aperçu public', where: 'Onglet Aperçu' },
  { n: 9, label: 'Préparer la transmission', where: 'Onglet Transmission' },
  {
    n: 10,
    label: 'Dépôt, compléments, décision',
    where: 'Onglet Transmission',
  },
];

export function EdofJourney({ current }: { current: number }) {
  return (
    <nav
      aria-label="Étapes du référencement"
      tabIndex={0}
      className="w-0 min-w-full overflow-x-auto [scrollbar-width:none]"
    >
      <ol className="flex gap-1.5 text-xs">
        {JOURNEY.map((s) => (
          <li
            key={s.n}
            aria-current={s.n === current ? 'step' : undefined}
            className={cn(
              'shrink-0 rounded-md border px-2.5 py-1.5 w-36',
              s.n === current
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border text-secondary-foreground',
            )}
          >
            <span className="font-semibold">{s.n}.</span> {s.label}
            <span className="block text-[11px]">{s.where}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
