'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LayoutGrid, Plus } from 'lucide-react';
import { MAIN_NAV } from '@/config/menu.config';
import type { NavItem, NavSection } from '@/config/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLayout } from './layout-context';

function NavEntry({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <>
      <Link
        href={item.path}
        aria-current={current ? 'page' : undefined}
        className="flex items-center grow gap-2.5 font-medium"
      >
        {item.icon && <item.icon />}
        <span>{item.title}</span>
      </Link>
      {item.new && (
        <div className="opacity-0 flex items-center gap-1 group-hover:opacity-100 group-focus-within:opacity-100">
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="size-6 hover:bg-input"
                size="icon"
                asChild
              >
                <Link href={item.new.path} aria-label={item.new.tooltip}>
                  <Plus className="size-3.5 opacity-100" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent align="center" side="right" sideOffset={28}>
              {item.new.tooltip}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      {item.badge && (
        <Badge
          size="xs"
          variant="primary"
          className="text-[11px] group-hover:hidden me-1"
        >
          {item.badge}
        </Badge>
      )}
    </>
  );
}

function NavEntryCollapsed({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.path} aria-label={item.title} aria-current={current ? 'page' : undefined}>
          {item.icon && <item.icon />}
        </Link>
      </TooltipTrigger>
      <TooltipContent align="center" side="right" sideOffset={28}>
        {item.title}
      </TooltipContent>
    </Tooltip>
  );
}

function NavItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { sidebarCollapse } = useLayout();

  const matchPath = (path: string) => matches(path, pathname);

  return (
    // Une simple liste de liens (l'accordéon d'origine posait des rôles ARIA de menu sur des liens).
    <ul className="w-full grow space-y-0.5 shrink-0">
      {items.map((item) => {
        // L'entrée la plus précise seulement : /apprenants ne s'allume pas sur /apprenants/convocations
        const current =
          matchPath(item.path) &&
          !items.some((o) => o.path.length > item.path.length && o.path.startsWith(item.path) && matchPath(o.path));
        return (
          <li
            key={item.id}
            data-selected={current ? 'true' : undefined}
            className={cn(
              'group relative flex w-full h-8 items-center justify-between gap-2 rounded-lg px-2 text-sm text-foreground transition-colors select-none',
              'hover:bg-accent hover:text-accent-foreground has-[:focus-visible]:bg-accent has-[[data-state=open]]:bg-accent',
              'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
              '[&_svg]:pointer-events-none [&_svg]:opacity-60 [&_svg:not([class*=size-])]:size-4 [&_svg]:shrink-0 [&_a]:flex [&>a]:w-full [&>a]:items-center [&>a]:gap-2',
            )}
          >
            {sidebarCollapse ? <NavEntryCollapsed item={item} current={current} /> : <NavEntry item={item} current={current} />}
          </li>
        );
      })}
    </ul>
  );
}

// Une page de section (/formation) n'est active que pour elle-même, pas pour les modules qu'elle contient.
const SECTION_PATHS = new Set(
  MAIN_NAV.flatMap((section) => (section.path ? [section.path] : [])),
);

const matches = (path: string, pathname: string) =>
  path === pathname ||
  (path.length > 1 && !SECTION_PATHS.has(path) && pathname.startsWith(path));

// Entrées d'une section : sa page d'atterrissage en tête quand elle existe, puis ses modules.
const sectionItems = (section: NavSection): NavItem[] =>
  section.path
    ? [
        {
          id: `${section.id}-vue`,
          title: 'Vue d’ensemble',
          icon: LayoutGrid,
          path: section.path,
        },
        ...section.items,
      ]
    : section.items;

// Rubriques repliées par défaut : seule celle de la page en cours s'ouvre ; les choix de l'utilisateur
// sont gardés dans le navigateur.
const STORAGE_KEY = 'gsms.sidebar.sections';

function readOpenSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function NavGroup({ section }: { section: NavSection }) {
  const pathname = usePathname();
  const items = sectionItems(section);
  const active = items.some((item) => matches(item.path, pathname));
  const [isOpen, setIsOpen] = useState(active);
  const { sidebarCollapse } = useLayout();

  useEffect(() => {
    const saved = readOpenSections()[section.id];
    setIsOpen(active || saved === true);
  }, [active, section.id]);

  const toggle = (open: boolean) => {
    setIsOpen(open);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...readOpenSections(), [section.id]: open }),
      );
    } catch {
      // stockage indisponible : l'état reste valable pour la page en cours
    }
  };

  // Sidebar repliée : on garde uniquement les icônes des entrées
  if (sidebarCollapse) {
    return (
      <div className="px-(--sidebar-space-x) border-t border-border pt-3.5">
        <NavItems items={items} />
      </div>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={toggle}
      className="px-(--sidebar-space-x)"
    >
      <CollapsibleTrigger className="group/section flex w-full items-center justify-start h-8 px-2 gap-2.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="ms-0.25 size-3.5 group-data-[state=open]/section:rotate-90" />
        <span>{section.title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <NavItems items={items} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarDefaultNav() {
  return (
    <div className="space-y-3.5">
      {MAIN_NAV.map((section) =>
        section.title ? (
          <NavGroup key={section.id} section={section} />
        ) : (
          <div key={section.id} className="px-(--sidebar-space-x)">
            <NavItems items={section.items} />
          </div>
        ),
      )}
    </div>
  );
}
