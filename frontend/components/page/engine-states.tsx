import type { NavItem, NavSection } from '@/config/types';
import type { CarnetFiche } from '@/lib/gsms/carnet';
import { READINESS } from '@/lib/gsms/labels';
import type { ReadinessStatus } from '@/lib/gsms/types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// États du moteur Qualiopi pour une liste d'indicateurs (cartes de section et de module) : un badge par état,
// avec les numéros concernés au survol. Les états viennent du carnet d'audit ; rien n'est déduit ici.

// Ce qui demande une action d'abord.
export const STATE_ORDER: ReadinessStatus[] = [
  'PREUVES_INSUFFISANTES',
  'A_RISQUE',
  'NON_EVALUABLE',
  'NON_EVALUE',
  'DEMONTRABLE',
];

export const itemIndicators = (items: NavItem[]) =>
  Array.from(new Set(items.flatMap((i) => i.spec?.indicators ?? []))).sort(
    (a, b) => a - b,
  );

export const sectionIndicators = (section: NavSection) =>
  itemIndicators(section.items);

export function EngineStates({
  indicators,
  fiches,
  quality,
  loading,
}: {
  indicators: number[];
  fiches: CarnetFiche[];
  quality: boolean;
  loading: boolean;
}) {
  if (indicators.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        N’alimente directement aucun indicateur Qualiopi.
      </p>
    );

  const etats = new Map<ReadinessStatus, number[]>();
  for (const n of indicators) {
    const etat = fiches.find((f) => f.numero === n)?.etat;
    if (!etat || etat === 'A_VENIR' || etat === 'NON_APPLICABLE') continue;
    etats.set(etat, [...(etats.get(etat) ?? []), n]);
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {indicators.length > 1
          ? 'Indicateurs alimentés'
          : 'Indicateur alimenté'}{' '}
        :{' '}
        <span className="font-medium text-foreground tabular-nums">
          {indicators.join(', ')}
        </span>
      </p>
      {quality &&
        (loading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {STATE_ORDER.filter((e) => etats.has(e)).map((e) => (
              <Badge
                key={e}
                size="sm"
                className={READINESS[e].color}
                title={`Indicateurs ${etats.get(e)!.join(', ')}`}
              >
                {READINESS[e].label} : {etats.get(e)!.length}
              </Badge>
            ))}
          </div>
        ))}
    </>
  );
}
