import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Barre de titre « hero » des pages de module (GSMS School : Toolbar surface="hero") : carte en dégradé,
// rubrique, titre et description à gauche, actions à droite.
export function PageHero({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-gradient-to-br from-slate-500/5 via-background to-primary/5 px-5 py-5 md:px-7 md:py-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <span className="hidden sm:flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Icon className="size-5 text-primary" />
            </span>
          )}
          <div className="min-w-0 space-y-1">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary-accent,var(--color-blue-700))]">
                {eyebrow}
              </p>
            )}
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="max-w-3xl text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 md:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
