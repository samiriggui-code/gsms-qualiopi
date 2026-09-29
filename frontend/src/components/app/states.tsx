import { AlertTriangle, Inbox, Lock } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Inbox aria-hidden className="size-6 text-fg-subtle" />
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-[13px] text-fg-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Erreur d'API lisible : droits, introuvable, serveur, ou refus motivé du moteur. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const e = error instanceof ApiError ? error : new ApiError(0, "unknown", "Erreur inattendue");
  const forbidden = e.status === 403;
  const title = forbidden ? "Accès non autorisé" : e.status === 404 ? "Introuvable" : "Impossible de charger";
  const Icon = forbidden ? Lock : AlertTriangle;
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-lg border bg-surface px-4 py-4", className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", forbidden ? "text-fg-muted" : "text-danger")} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-[13px] text-fg-muted">{e.message}</p>
        {onRetry && !forbidden && e.status !== 404 && (
          <Button size="sm" className="mt-3" onClick={onRetry}>
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  meta,
  actions,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-fg-muted">{eyebrow}</div>}
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {meta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">{meta}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-surface shadow-panel", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
