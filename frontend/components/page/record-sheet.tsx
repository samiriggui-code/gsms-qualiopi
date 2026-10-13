'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Fiche détaillée en grand panneau (GSMS School : coques VIE_SCOLAIRE_SHEET, gabarit « Customer Details »,
// déjà suivi par la fiche stagiaire) : bandeau (titre, badges, métadonnées à points), colonne de gauche en
// petites cartes clé/valeur, onglets à droite, pied d'actions.

export interface SheetTab {
  value: string;
  label: string;
  count?: number;
  content: ReactNode;
}

export function RecordSheet({
  open,
  onClose,
  label,
  title,
  badges,
  meta,
  actions,
  side,
  tabs,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  title: ReactNode;
  badges?: ReactNode;
  meta?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  side: ReactNode;
  tabs: SheetTab[];
  footer?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="inset-5 start-auto h-auto gap-0 rounded-lg border p-0 sm:max-w-none lg:w-[1160px] max-sm:inset-2 max-sm:w-auto [&_[data-slot=sheet-close]]:end-5 [&_[data-slot=sheet-close]]:top-4.5">
        <SheetHeader className="border-b border-border px-5 py-3.5">
          <SheetTitle className="font-medium">{label}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex min-h-0 grow flex-col p-0">
          <div className="flex flex-wrap justify-between gap-2 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-semibold leading-none text-foreground lg:text-[22px]">
                  {title}
                </span>
                {badges}
              </div>
              {!!meta?.length && (
                <div className="flex flex-wrap items-center gap-2 text-2sm">
                  {meta.map((m, i) => (
                    <span key={m.label} className="flex items-center gap-2">
                      {i > 0 && (
                        <BadgeDot className="size-1 bg-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-medium text-foreground">
                        {m.value}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            )}
          </div>
          <ScrollArea className="min-h-0 grow">
            <div className="flex flex-col gap-5 p-5 lg:flex-row">
              <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[260px]">
                {side}
              </div>
              <Tabs defaultValue={tabs[0]?.value} className="min-w-0 grow">
                <TabsList className="mb-1 inline-flex w-auto max-w-full grow-0 overflow-x-auto [scrollbar-width:none]">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="text-secondary-foreground"
                    >
                      {t.label}
                      {t.count !== undefined && (
                        <Badge size="sm" variant="secondary">
                          {t.count}
                        </Badge>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((t) => (
                  <TabsContent key={t.value} value={t.value} className="pt-4">
                    {t.content}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </ScrollArea>
        </SheetBody>
        {footer && (
          <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Petite carte de la colonne de gauche.
export function SideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="min-h-[34px] bg-accent/50">
        <CardTitle className="text-2sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 py-3 text-2sm">
        {children}
      </CardContent>
    </Card>
  );
}

// Ligne icône + valeur d'une carte de la colonne de gauche ; une valeur absente est dite absente.
export function SideLine({
  icon: Icon,
  children,
  missing = 'Non renseigné',
}: {
  icon: LucideIcon;
  children?: ReactNode;
  missing?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      {children ? (
        <span className="truncate text-foreground">{children}</span>
      ) : (
        <span className="text-muted-foreground">{missing}</span>
      )}
    </div>
  );
}
