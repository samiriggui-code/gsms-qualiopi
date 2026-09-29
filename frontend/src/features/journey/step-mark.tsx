import { Check, Clock, Minus } from "lucide-react";

import type { StepState } from "@/lib/types";
import { cn } from "@/lib/utils";

// Composant métier : l'état d'une étape du parcours. Forme ET couleur différentes pour chaque
// état (lisible sans la couleur), libellé pour les lecteurs d'écran.
export const STEP_STATE: Record<StepState, { label: string; className: string }> = {
  FAIT: { label: "Fait", className: "bg-ok-bg text-ok" },
  EN_RETARD: { label: "En retard", className: "bg-danger-bg text-danger" },
  A_ECHEANCE: { label: "À échéance", className: "bg-warn-bg text-warn" },
  A_VENIR: { label: "À venir", className: "text-fg-subtle ring-1 ring-inset ring-border-strong" },
  SANS_OBJET: { label: "Sans objet", className: "text-fg-subtle" },
};

export function StepMark({ state, label, size = "md" }: { state: StepState; label: string; size?: "sm" | "md" }) {
  const s = STEP_STATE[state];
  const text = `${label} : ${s.label.toLowerCase()}`;
  const icon =
    state === "FAIT" ? (
      <Check aria-hidden className="size-3.5" strokeWidth={3} />
    ) : state === "EN_RETARD" ? (
      <span aria-hidden className="text-[13px] leading-none font-bold">
        !
      </span>
    ) : state === "A_ECHEANCE" ? (
      <Clock aria-hidden className="size-3.5" strokeWidth={2.5} />
    ) : state === "SANS_OBJET" ? (
      <Minus aria-hidden className="size-3.5" />
    ) : null;
  return (
    <span
      title={text}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full",
        size === "md" ? "size-6" : "size-5",
        s.className,
      )}
    >
      {icon}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function StepLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted" aria-label="Légende des étapes">
      {(["FAIT", "EN_RETARD", "A_ECHEANCE", "A_VENIR", "SANS_OBJET"] as StepState[]).map((st) => (
        <span key={st} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex">
            <StepMark state={st} label={STEP_STATE[st].label} size="sm" />
          </span>
          {STEP_STATE[st].label}
        </span>
      ))}
    </div>
  );
}
