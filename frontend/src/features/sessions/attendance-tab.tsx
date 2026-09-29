"use client";

import { Check, Minus, ShieldCheck, X } from "lucide-react";
import * as React from "react";

import { EmptyState, ErrorState } from "@/components/app/states";
import { Skeleton } from "@/components/ui/tooltip";
import { PERIOD } from "@/lib/labels";
import type { AttendanceCell } from "@/lib/types";
import { fmt } from "@/lib/utils";

import { useAttendance } from "./queries";

const CELL: Record<AttendanceCell["etat"], { label: string; className: string; icon: React.ReactNode }> = {
  PRESENT: {
    label: "Présent",
    className: "bg-ok-bg text-ok",
    icon: <Check aria-hidden className="size-3.5" strokeWidth={3} />,
  },
  ABSENT: {
    label: "Absent (constaté)",
    className: "bg-warn-bg text-warn",
    icon: <X aria-hidden className="size-3.5" strokeWidth={3} />,
  },
  MANQUANT: {
    label: "Rien de noté",
    className: "bg-danger-bg text-danger",
    icon: (
      <span aria-hidden className="text-xs font-bold">
        !
      </span>
    ),
  },
  A_VENIR: { label: "À venir", className: "ring-1 ring-inset ring-border-strong", icon: null },
  NON_ATTENDU: { label: "Non attendu", className: "text-fg-subtle", icon: <Minus aria-hidden className="size-3.5" /> },
};

export function AttendanceTab({ sessionId }: { sessionId: string }) {
  const query = useAttendance(sessionId);
  const scroller = React.useRef<HTMLDivElement>(null);
  // Sur petit écran, la grille s'ouvre sur les demi-journées du jour (le formateur n'a pas à les chercher).
  React.useEffect(() => {
    const box = scroller.current;
    const cell = box?.querySelector<HTMLElement>("[data-today]");
    if (box && cell) box.scrollLeft = Math.max(0, cell.offsetLeft - box.clientWidth / 2);
  }, [query.data]);
  if (query.isPending) return <Skeleton className="h-56" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const slots = query.data.demi_journees;
  if (slots.length === 0)
    return (
      <EmptyState title="Aucune demi-journée planifiée">
        Les demi-journées d’émargement se créent depuis les réglages de la session.
      </EmptyState>
    );

  const learners = slots[0].presences.map((p) => ({ id: p.enrollment_id, name: p.stagiaire }));
  const today = new Date().toLocaleDateString("sv-SE");

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted" aria-label="Légende">
        {Object.entries(CELL).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`inline-grid size-5 place-items-center rounded ${c.className}`}>{c.icon}</span>
            {c.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck aria-hidden className="size-4 text-ok" />
          Contre-validée par le formateur
        </span>
      </div>
      <div
        ref={scroller}
        role="region"
        aria-label="Feuille d’émargement (défilement horizontal)"
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border bg-surface shadow-panel"
      >
        <table className="text-sm">
          <caption className="sr-only">Feuille d’émargement : stagiaires par demi-journée</caption>
          <thead className="border-b bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-40 bg-surface-2 px-4 py-2 text-left font-medium">
                Stagiaire
              </th>
              {slots.map((sl) => (
                <th
                  key={sl.id}
                  data-today={sl.jour === today ? "" : undefined}
                  aria-current={sl.jour === today ? "date" : undefined}
                  scope="col"
                  className={`px-1.5 py-2 text-center font-medium whitespace-nowrap ${sl.jour === today ? "text-brand" : ""}`}
                >
                  <div>{fmt.day(sl.jour)}</div>
                  <div className="flex items-center justify-center gap-1 font-normal">
                    {PERIOD[sl.periode]}
                    {sl.contre_validee && (
                      <ShieldCheck
                        className="size-3.5 text-ok"
                        aria-label={`Contre-validée par ${sl.contre_validee.par}`}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {learners.map((l) => (
              <tr key={l.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium whitespace-nowrap"
                >
                  {l.name}
                </th>
                {slots.map((sl) => {
                  const cell = sl.presences.find((p) => p.enrollment_id === l.id);
                  if (!cell) return <td key={sl.id} />;
                  const c = CELL[cell.etat];
                  const title = [c.label, cell.heure && `à ${fmt.datetime(cell.heure)}`, cell.note]
                    .filter(Boolean)
                    .join(" — ");
                  return (
                    <td key={sl.id} className="px-1.5 py-2 text-center">
                      <span title={title} className={`inline-grid size-6 place-items-center rounded ${c.className}`}>
                        {c.icon}
                        <span className="sr-only">{title}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
