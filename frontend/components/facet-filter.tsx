'use client';

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface FacetOption {
  value: string;
  label: ReactNode;
  // Texte utilisé par la recherche du filtre
  searchText: string;
  count: number;
}

// Filtre à cases à cocher avec compteurs (repris de la liste Companies du CRM Metronic).
export function FacetFilter({
  title,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  title: string;
  icon: LucideIcon;
  options: FacetOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string, checked: boolean) =>
    onChange(
      checked ? [...selected, value] : selected.filter((v) => v !== value),
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Icon className="size-3.5" />
          {title}
          {selected.length > 0 && (
            <Badge size="sm" variant="outline">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher..." />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              <ScrollArea className="max-h-[260px]">
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.searchText}
                    onSelect={() =>
                      toggle(option.value, !selected.includes(option.value))
                    }
                    className="flex items-center gap-2.5 bg-transparent!"
                  >
                    <Checkbox
                      id={`facet-${title}-${option.value}`}
                      checked={selected.includes(option.value)}
                      onCheckedChange={(checked) =>
                        toggle(option.value, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`facet-${title}-${option.value}`}
                      className="grow flex items-center justify-between font-normal gap-1.5"
                    >
                      <span className="min-w-0">{option.label}</span>
                      <span className="text-muted-foreground font-semibold me-1">
                        {option.count}
                      </span>
                    </Label>
                  </CommandItem>
                ))}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
