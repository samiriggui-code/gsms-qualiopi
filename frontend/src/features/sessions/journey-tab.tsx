"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { EmptyState, ErrorState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/tooltip";
import { LearnerSheet } from "@/features/journey/learner-sheet";
import { STEP_STATE, StepLegend, StepMark } from "@/features/journey/step-mark";
import { ENROLLMENT_STATUS, STEP_LABEL } from "@/lib/labels";

import { useSessionJourney } from "./queries";

export function JourneyTab({ sessionId }: { sessionId: string }) {
  const query = useSessionJourney(sessionId);
  const [open, setOpen] = React.useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-56" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const { stagiaires, etapes } = query.data;
  if (stagiaires.length === 0)
    return <EmptyState title="Aucun stagiaire inscrit">Les inscriptions de la session apparaîtront ici.</EmptyState>;

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[13px] text-fg-muted">Ouvrez un stagiaire pour saisir une étape ou émettre un document.</p>
        <StepLegend />
      </div>

      {/* Matrice (écran large) */}
      <div
        role="region"
        aria-label="Parcours des stagiaires"
        tabIndex={0}
        className="relative hidden overflow-x-auto rounded-lg border bg-surface shadow-panel md:block"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">Parcours des stagiaires : étapes faites ou à faire</caption>
          <thead className="border-b bg-surface-2 text-xs text-fg-muted">
            <tr>
              <th scope="col" className="sticky left-0 bg-surface-2 px-4 py-2.5 text-left font-medium">
                Stagiaire
              </th>
              {etapes.map((e) => (
                <th key={e} scope="col" className="px-1.5 py-2.5 text-center font-medium whitespace-nowrap">
                  <abbr title={STEP_LABEL[e].label} className="no-underline">
                    {STEP_LABEL[e].short}
                  </abbr>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">Ouvrir</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stagiaires.map((r) => (
              <tr key={r.inscription} className="group hover:bg-surface-2">
                <th
                  scope="row"
                  className="sticky left-0 bg-surface px-4 py-2.5 text-left font-normal group-hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(r.inscription)}
                    className="font-medium text-fg hover:text-brand hover:underline underline-offset-4"
                  >
                    {r.stagiaire}
                  </button>
                  <div>
                    <Badge tone={ENROLLMENT_STATUS[r.statut].tone} className="mt-0.5">
                      {ENROLLMENT_STATUS[r.statut].label}
                    </Badge>
                  </div>
                </th>
                {etapes.map((e) => (
                  <td key={e} className="px-1.5 py-2.5 text-center">
                    <StepMark state={r.etats[e]} label={STEP_LABEL[e].label} />
                  </td>
                ))}
                <td className="px-3 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(r.inscription)}
                    className="rounded-md p-1 text-fg-subtle hover:bg-surface hover:text-fg"
                    aria-label={`Ouvrir le parcours de ${r.stagiaire}`}
                  >
                    <ChevronRight aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Liste (mobile) */}
      <ul className="flex flex-col gap-2 md:hidden">
        {stagiaires.map((r) => {
          const todo = etapes.filter((e) => r.etats[e] === "EN_RETARD" || r.etats[e] === "A_ECHEANCE");
          return (
            <li key={r.inscription}>
              <button
                type="button"
                onClick={() => setOpen(r.inscription)}
                className="w-full rounded-lg border bg-surface px-4 py-3 text-left shadow-panel active:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{r.stagiaire}</span>
                  <Badge tone={ENROLLMENT_STATUS[r.statut].tone}>{ENROLLMENT_STATUS[r.statut].label}</Badge>
                </div>
                <div className="tabular mt-1 text-[13px] text-fg-muted">
                  {etapes.filter((e) => r.etapes[e]).length} / {etapes.length} étapes faites
                </div>
                {todo.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {todo.map((e) => (
                      <span
                        key={e}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${STEP_STATE[r.etats[e]].className}`}
                      >
                        {STEP_STATE[r.etats[e]].label} : {STEP_LABEL[e].label.toLowerCase()}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <LearnerSheet sessionId={sessionId} enrollmentId={open} onClose={() => setOpen(null)} />
    </>
  );
}
