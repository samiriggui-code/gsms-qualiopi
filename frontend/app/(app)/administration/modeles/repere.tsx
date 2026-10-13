import type { ReactNode } from 'react';

// Repère numéroté posé au-dessus de chaque bloc de la page témoin : nom du bloc et règle d'usage.
export function Repere({
  n,
  name,
  children,
}: {
  n: number;
  name: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
          {n}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-foreground">
          {name}
        </span>
      </div>
      {children}
    </div>
  );
}

export function RepereNote({ children }: { children: ReactNode }) {
  return <p className="-mt-1 text-xs text-muted-foreground">{children}</p>;
}
