'use client';

// Onglets comptés au-dessus d'une datatable, repris de la liste des commandes de la démo Metronic
// (store-inventory/tables/order-list) : libellé + pastille du nombre, soulignement de l'onglet actif.

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CardHeader } from '@/components/ui/card';

export interface CountedTab {
  id: string;
  label: string;
  count: number;
}

export function CountedTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: CountedTab[];
  value: string;
  onChange: (id: string) => void;
}) {
  // Des filtres de liste, pas des onglets à panneaux : boutons à bascule (aria-pressed), sans les rôles
  // tab/tabpanel qui pointaient vers des panneaux inexistants.
  return (
    <CardHeader className="px-4 py-3.5 flex-nowrap">
      <div className="-ms-[3px] w-0 min-w-full overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrer la liste">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const active = value === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(tab.id)}
                className={cn(
                  'relative inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'font-medium text-primary' : 'font-normal',
                )}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  <Badge
                    size="sm"
                    variant={active ? 'primary' : 'outline'}
                    appearance="outline"
                    className={cn('rounded-full', active ? '' : 'bg-muted/60')}
                  >
                    {tab.count}
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </CardHeader>
  );
}
