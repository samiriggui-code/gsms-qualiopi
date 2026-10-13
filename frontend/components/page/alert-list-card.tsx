import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard, SectionEmpty } from './section-card';

// Carte d'alertes des accueils de module (GSMS School : « Alertes ») : une ligne par point à traiter,
// avec son type, son échéance et un lien vers l'endroit où on le traite. Les alertes viennent de l'API.

export interface AlertItem {
  id: string;
  title: string;
  subtitle?: string;
  kind?: string;
  when?: ReactNode;
  tone?: 'danger' | 'warning' | 'muted';
  href?: string;
}

const TONE = {
  danger: 'text-destructive',
  warning: 'text-amber-700 dark:text-amber-400',
  muted: 'text-muted-foreground',
};

export function AlertListCard({
  title,
  subtitle,
  icon,
  items,
  loading,
  empty,
  max = 4,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon: LucideIcon;
  items: AlertItem[];
  loading?: boolean;
  empty: string;
  max?: number;
}) {
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconClassName="text-destructive"
      count={loading ? undefined : items.length}
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <SectionEmpty icon={CircleCheck}>{empty}</SectionEmpty>
      ) : (
        <ul className="space-y-3">
          {items.slice(0, max).map((a) => {
            const body = (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs font-bold uppercase text-foreground/90">
                    {a.title}
                  </p>
                  {a.subtitle && (
                    <p className="truncate text-xs text-muted-foreground">
                      {a.subtitle}
                    </p>
                  )}
                  {a.kind && (
                    <Badge
                      variant="outline"
                      size="xs"
                      className="text-[10px] font-bold uppercase"
                    >
                      {a.kind}
                    </Badge>
                  )}
                </div>
                {a.when && (
                  <span
                    className={cn(
                      'shrink-0 text-end text-[11px] font-bold',
                      TONE[a.tone ?? 'muted'],
                    )}
                  >
                    {a.when}
                  </span>
                )}
              </div>
            );
            return (
              <li key={a.id}>
                {a.href ? (
                  <Link
                    href={a.href}
                    className="group relative block rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40"
                  >
                    {body}
                    <ArrowRight className="absolute end-3 bottom-3 size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ) : (
                  <div className="rounded-lg border border-border bg-background p-3">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
          {items.length > max && (
            <li className="text-center text-xs text-muted-foreground">
              et {items.length - max} autre{items.length - max > 1 ? 's' : ''}
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
