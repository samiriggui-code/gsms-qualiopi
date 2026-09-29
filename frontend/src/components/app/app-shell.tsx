"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/labels";
import type { Bootstrap } from "@/lib/types";
import { cn } from "@/lib/utils";

// Entrées de navigation construites dans le front ; l'API décide lesquelles la personne voit
// (clé présente dans /bootstrap = module actif + permission). Rien n'est affiché « pour plus tard ».
const NAV: Record<string, { href: string; icon: React.ElementType }> = {
  sessions: { href: "/sessions", icon: CalendarRange },
  mes_sessions: { href: "/sessions", icon: CalendarRange },
};

export function useBootstrap() {
  return useQuery({ queryKey: ["bootstrap"], queryFn: () => api.get<Bootstrap>("bootstrap"), staleTime: 5 * 60_000 });
}

function initials(name: string) {
  return name
    .replace(/[’']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Pose la couleur de l'organisme sur toute l'interface. */
function useBrand(color?: string) {
  React.useEffect(() => {
    if (color) document.documentElement.style.setProperty("--brand", color);
  }, [color]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useBootstrap();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  useBrand(data?.organization?.brand_color);

  const org = data?.organization;
  const items = (data?.navigation ?? []).filter((n) => NAV[n.key]);

  const nav = (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5 px-3">
      {items.map((n) => {
        const { href, icon: Icon } = NAV[n.key];
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={n.key}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg",
              active &&
                "bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-brand hover:bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] hover:text-brand",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-md bg-brand text-[13px] font-semibold text-brand-fg"
      >
        {org ? initials(org.short_name) : ""}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-semibold">{org?.short_name ?? " "}</div>
        <div className="text-[11px] tracking-wide text-fg-subtle uppercase">Espace formation</div>
      </div>
    </div>
  );

  const account = data && (
    <div className="flex items-center gap-2 border-t px-4 py-3">
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-medium">{data.user.full_name}</div>
        <div className="truncate text-xs text-fg-subtle">
          {data.user.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}
        </div>
      </div>
      <form action="/deconnexion" method="post">
        <Button type="submit" variant="ghost" size="icon" aria-label="Se déconnecter">
          <LogOut />
        </Button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface lg:flex">
        <div className="px-4 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto py-2">{nav}</div>
        {account}
        <p className="px-4 pb-3 text-[11px] text-fg-subtle">GSMS Qualiopi</p>
      </aside>

      {/* Barre du haut (mobile) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-surface px-4 lg:hidden">
        {brand}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="Menu">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-overlay">
            <div className="flex items-center justify-between px-4 py-3">
              {brand}
              <Button variant="ghost" size="icon" aria-label="Fermer le menu" onClick={() => setOpen(false)} autoFocus>
                <X />
              </Button>
            </div>
            <div className="flex-1 py-2">{nav}</div>
            {account}
          </div>
        </div>
      )}

      <main id="contenu" className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
