import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import type { CarnetFiche } from '@/lib/gsms/carnet';
import { READINESS } from '@/lib/gsms/labels';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard, SectionEmpty } from './section-card';

// Carte « Moteur Qualiopi » des pages de section et des accueils de module : une ligne par indicateur, avec
// son état calculé par le moteur, les preuves exploitables et un lien vers sa fiche du carnet d'audit.

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

export function EngineCard({
  indicators,
  subtitle,
  fiches,
  quality,
  loading,
}: {
  indicators: number[];
  subtitle: string;
  fiches: CarnetFiche[];
  quality: boolean;
  loading: boolean;
}) {
  const rows = indicators.map((n) => ({
    n,
    fiche: fiches.find((f) => f.numero === n),
  }));
  return (
    <SectionCard
      title="Moteur Qualiopi"
      subtitle={subtitle}
      icon={ListChecks}
      count={indicators.length}
      contentClassName="p-0"
    >
      {!quality ? (
        <SectionEmpty icon={ListChecks}>
          Les états du moteur sont réservés aux personnes qui ont accès à la
          qualité.
        </SectionEmpty>
      ) : loading ? (
        <div className="space-y-2 p-5">
          {indicators.map((n) => (
            <Skeleton key={n} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-dashed">
          {rows.map(({ n, fiche }) => {
            const etat =
              fiche && fiche.etat !== 'A_VENIR' ? READINESS[fiche.etat] : null;
            return (
              <li key={n}>
                <Link
                  href={`/qualiopi/carnet?i=${n}`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xs font-bold tabular-nums">
                    {n}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {fiche?.nom ?? `Indicateur ${n}`}
                    </span>
                    {fiche && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {plural(
                          fiche.preuves.exploitables,
                          'preuve exploitable',
                          'preuves exploitables',
                        )}{' '}
                        sur {fiche.preuves.total}
                      </span>
                    )}
                  </span>
                  {etat ? (
                    <Badge size="sm" className={etat.color}>
                      {etat.label}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="outline">
                      À venir
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
