"use client";

import { ErrorState, Panel } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/tooltip";
import { MILESTONE, READINESS } from "@/lib/labels";
import { cn, fmt } from "@/lib/utils";

import { useDossier } from "./queries";

const OWNER: Record<string, string> = { gestion: "Gestion", formateur: "Formateur", qualite: "Qualité" };

export function QualiopiTab({ sessionId }: { sessionId: string }) {
  const query = useDossier(sessionId);
  if (query.isPending) return <Skeleton className="h-72" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const d = query.data;
  const indicators = d.indicators.filter((i) => i.status !== "NON_APPLICABLE");
  const byStatus = (st: string) => indicators.filter((i) => i.status === st).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Pièces de la session">
          <ul className="divide-y">
            {d.checklist.map((c) => {
              const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <li key={c.label} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>{c.label}</span>
                    {c.applicable ? (
                      <span className={cn("tabular text-[13px]", c.complete ? "text-ok" : "text-fg-muted")}>
                        {c.done} / {c.total}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">Pas encore exigible</span>
                    )}
                  </div>
                  {c.applicable && c.total > 0 && (
                    <div
                      className="mt-1.5 h-1.5 rounded-full bg-surface-2"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={c.label}
                    >
                      <div
                        className={cn("h-full rounded-full", c.complete ? "bg-ok" : "bg-warn")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Échéancier">
          <ul className="divide-y">
            {d.echeancier.map((m) => (
              <li key={m.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-[13px] text-fg-muted">{m.explanation}</div>
                  <div className="text-xs text-fg-subtle">
                    {OWNER[m.owner] ?? m.owner} · échéance {fmt.date(m.due_on)}
                  </div>
                </div>
                <Badge tone={MILESTONE[m.status]?.tone ?? "neutral"}>{MILESTONE[m.status]?.label ?? m.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Écarts ouverts pour cette session"
        aside={<span className="tabular text-xs text-fg-muted">{d.findings.length}</span>}
      >
        {d.findings.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-fg-muted">
            Aucun écart ouvert : le moteur n’a rien constaté de manquant sur cette session.
          </p>
        ) : (
          <ul className="divide-y">
            {d.findings.map((f) => (
              <li key={f.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">Indicateur {f.indicator}</Badge>
                  <span className="text-sm font-medium">{f.title}</span>
                </div>
                <p className="mt-1 text-[13px] text-fg-muted">{f.explanation}</p>
                {f.remediation && <p className="mt-1 text-[13px]">À faire : {f.remediation}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Indicateurs concernés">
        <div className="flex flex-wrap gap-2 border-b px-4 py-3">
          {(["DEMONTRABLE", "A_RISQUE", "PREUVES_INSUFFISANTES", "NON_EVALUABLE"] as const).map((st) => (
            <Badge key={st} tone={READINESS[st].tone} dot>
              {READINESS[st].label} <span className="tabular">{byStatus(st)}</span>
            </Badge>
          ))}
        </div>
        <ul className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {indicators.map((i) => (
            <li key={i.number} className="flex items-start gap-3 bg-surface px-4 py-2.5">
              <span className="tabular w-8 shrink-0 text-[13px] font-semibold text-fg-muted">{i.code}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] leading-snug">{i.title}</div>
                <Badge tone={READINESS[i.status]?.tone ?? "neutral"} className="mt-1">
                  {READINESS[i.status]?.label ?? i.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <p className="text-xs text-fg-subtle">{d.disclaimer}</p>
    </div>
  );
}
