'use client';

// Onglets comptés au-dessus d'une datatable, repris de la liste des commandes de la démo Metronic
// (store-inventory/tables/order-list) : libellé + pastille du nombre, soulignement de l'onglet actif.

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  return (
    <CardHeader className="px-4 py-3.5 flex-nowrap">
      <Tabs value={value} onValueChange={onChange} className="m-0 p-0 w-full min-w-0">
        <TabsList className="h-auto p-0 bg-transparent border-b-0 border-border rounded-none -ms-[3px] w-full overflow-x-auto [scrollbar-width:none]">
          <div className="flex items-center gap-1 min-w-max">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  'relative text-foreground px-2 hover:text-primary data-[state=active]:text-primary data-[state=active]:shadow-none',
                  value === tab.id ? 'font-medium' : 'font-normal',
                )}
              >
                <div className="flex items-center gap-2">
                  {tab.label}
                  <Badge
                    size="sm"
                    variant={value === tab.id ? 'primary' : 'outline'}
                    appearance="outline"
                    className={cn('rounded-full', value === tab.id ? '' : 'bg-muted/60')}
                  >
                    {tab.count}
                  </Badge>
                </div>
              </TabsTrigger>
            ))}
          </div>
        </TabsList>
      </Tabs>
    </CardHeader>
  );
}
