import Link from 'next/link';
import type { NavItem } from '@/config/types';
import type { CarnetFiche } from '@/lib/gsms/carnet';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EngineStates, itemIndicators } from './engine-states';

// Carte de module des pages de section (GSMS School : cartes de l'atterrissage de section) : icône, intitulé,
// rôle du module, deux chiffres tirés de l'API, ce que le moteur Qualiopi conclut de ses indicateurs, bouton
// d'ouverture. Les chiffres sont fournis par la page ; la carte n'en calcule aucun.

export interface ModuleFigure {
  label: string;
  value: string | number;
}

export function ModuleCard({
  item,
  tint,
  description,
  figures,
  loading,
  fiches,
  quality,
  carnetLoading,
}: {
  item: NavItem;
  tint: string;
  description?: string;
  figures: ModuleFigure[];
  loading?: boolean;
  fiches: CarnetFiche[];
  quality: boolean;
  carnetLoading: boolean;
}) {
  const Icon = item.icon;
  return (
    <Card className="h-full min-w-0 rounded-xl shadow-xs">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg border',
                tint,
              )}
            >
              <Icon className="size-5" />
            </span>
          )}
          <h3 className="min-w-0 grow text-base font-semibold text-foreground">
            <Link href={item.path} className="hover:text-primary">
              {item.title}
            </Link>
          </h3>
          {item.draft && (
            <Badge variant="outline" size="sm" className="shrink-0">
              À construire
            </Badge>
          )}
        </div>
        {(description ?? item.spec?.description) && (
          <p className="text-sm text-muted-foreground">
            {description ?? item.spec?.description}
          </p>
        )}
        {figures.length > 0 && (
          <dl className="grid grid-cols-2 gap-3">
            {figures.map((f) => (
              <div
                key={f.label}
                className="min-w-0 rounded-lg border border-dashed px-3 py-2"
              >
                <dt className="truncate text-2xs uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="text-lg font-semibold text-foreground tabular-nums">
                  {loading ? <Skeleton className="my-1 h-5 w-10" /> : f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-auto space-y-2 border-t border-dashed pt-3">
          <EngineStates
            indicators={itemIndicators([item])}
            fiches={fiches}
            quality={quality}
            loading={carnetLoading}
          />
        </div>
      </CardContent>
      <CardFooter className="border-t border-dashed px-5 py-3">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href={item.path}>
            {item.draft ? 'Voir le cadrage' : `Ouvrir ${item.title}`}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
