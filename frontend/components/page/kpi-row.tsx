import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// Bandeau de cartes KPI des pages de module, repris de GSMS School (ModuleKpiStatsRow) : dégradé, halo coloré,
// libellé en majuscules, valeur, sous-titre, pastille d'icône. Les valeurs viennent de l'API ou de la liste chargée.

export interface KpiItem {
  label: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
}

const ACCENTS = [
  {
    orb: 'bg-sky-500/10',
    box: 'bg-sky-500/15 border-sky-500/25',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  {
    orb: 'bg-emerald-500/10',
    box: 'bg-emerald-500/15 border-emerald-500/25',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    orb: 'bg-amber-500/10',
    box: 'bg-amber-500/15 border-amber-500/25',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  {
    orb: 'bg-violet-500/10',
    box: 'bg-violet-500/15 border-violet-500/25',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  {
    orb: 'bg-rose-500/10',
    box: 'bg-rose-500/15 border-rose-500/25',
    icon: 'text-rose-600 dark:text-rose-400',
  },
] as const;

const GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
};

export function KpiRow({
  items,
  loading,
}: {
  items: KpiItem[];
  loading?: boolean;
}) {
  const n = Math.min(items.length || 5, 5);
  const grid = cn(
    'grid gap-3 sm:gap-4',
    GRID[n],
    n % 2 === 1 && '[&>*:last-child]:max-md:col-span-2',
  );
  if (loading)
    return (
      <div className={grid}>
        {Array.from({ length: n }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  return (
    <div className={grid}>
      {items.map((k, i) => {
        const a = ACCENTS[i % ACCENTS.length];
        return (
          <div
            key={k.label}
            className="relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/30 px-4 py-4"
          >
            <div
              className={cn(
                'absolute -end-8 -top-8 size-24 rounded-full',
                a.orb,
              )}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
                  {k.value}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {k.subtitle}
                </p>
              </div>
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                  a.box,
                )}
              >
                <k.icon className={cn('size-5', a.icon)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
