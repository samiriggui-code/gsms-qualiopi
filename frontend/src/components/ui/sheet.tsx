"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Mémorise l'élément actif à l'ouverture et lui rend le focus à la fermeture. */
function useReturnFocus(open: boolean) {
  const opener = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (event: Event) => {
    if (opener.current?.isConnected) {
      event.preventDefault();
      opener.current.focus();
    }
  };
}

/** Panneau latéral : détail d'un objet sans quitter la liste (plein écran sur mobile). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "sm:max-w-xl",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-overlay outline-none sm:border-l",
            "pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]",
            width,
          )}
        >
          <header className="flex items-start gap-3 border-b px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-fg">{title}</Dialog.Title>
              <Dialog.Description className={description ? "mt-0.5 text-[13px] text-fg-muted" : "sr-only"}>
                {description ?? "Détail"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="-mr-1 rounded-md p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Fermer le panneau"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="border-t px-5 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Fenêtre centrée pour une saisie courte (motif, date…). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-surface p-5 shadow-overlay outline-none"
        >
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Description className={description ? "mt-1 text-[13px] text-fg-muted" : "sr-only"}>
            {description ?? "Saisie"}
          </Dialog.Description>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
