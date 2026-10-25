import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';

// Carte de section des pages (GSMS School : cartes « alertes », « répartition », « évolution » des accueils
// de module) : bordure en pointillés, titre en majuscules, sous-titre, compteur et outils à droite.
// Toutes les sections d'une page passent par elle pour garder la même allure.
export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  count,
  toolbar,
  footer,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  count?: number;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card
      className={cn(
        'h-full min-w-0 rounded-xl border-dashed shadow-xs',
        className,
      )}
    >
      <CardHeader className="min-h-14 flex-nowrap gap-3 border-b border-dashed py-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
            {Icon && (
              <Icon
                className={cn('size-4 shrink-0 text-primary', iconClassName)}
              />
            )}
            <span className="truncate">{title}</span>
          </h3>
          {subtitle && (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {(count !== undefined || toolbar) && (
          <div className="flex shrink-0 items-center gap-2">
            {toolbar}
            {count !== undefined && (
              <Badge variant="outline" className="font-bold tabular-nums">
                {count}
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className={cn('p-5', contentClassName)}>
        {children}
      </CardContent>
      {footer && (
        <CardFooter className="flex-wrap justify-center gap-x-6 gap-y-3 border-t border-dashed bg-muted/30 px-5 py-4">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

// Grille d'accueil de module : une colonne étroite (1/3) et une large (2/3), empilées sur mobile.
export function LandingRow({
  side,
  main,
}: {
  side: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-stretch gap-5 lg:grid-cols-3 lg:gap-7">
      <div className="min-w-0">{side}</div>
      <div className="min-w-0 lg:col-span-2">{main}</div>
    </div>
  );
}

// Message vide d'une section : un manque s'affiche comme un manque, jamais avec des données inventées.
export function SectionEmpty({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="text-xs font-medium text-muted-foreground">{children}</p>
    </div>
  );
}
