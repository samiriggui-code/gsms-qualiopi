"use client";

import { Info } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { Decision } from "@/lib/types";

type Props = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  decision: Decision | undefined;
  onRun: () => void;
  pending?: boolean;
};

/**
 * Bouton gouverné par le moteur : il n'invente aucune règle, il affiche la décision de l'API.
 * Refusé → reste visible et atteignable au clavier, la raison est donnée au survol, au focus
 * et au clic (sur mobile, pas de survol : un toast la dit).
 */
export function ActionGate({ decision, onRun, pending, children, ...props }: Props) {
  if (!decision) return null;
  if (decision.allowed) {
    return (
      <Button {...props} onClick={onRun} disabled={pending} aria-busy={pending || undefined}>
        {children}
      </Button>
    );
  }
  const reason = decision.message;
  return (
    <Tooltip content={reason}>
      <Button
        {...props}
        aria-disabled
        aria-description={reason}
        onClick={() => toast.info(reason, { icon: <Info className="size-4" /> })}
      >
        {children}
      </Button>
    </Tooltip>
  );
}
