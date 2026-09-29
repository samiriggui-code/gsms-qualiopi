"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, Search, User } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { EmptyState, ErrorState, PageHeader } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { SESSION_STATUS } from "@/lib/labels";
import type { SessionRow, SessionStatus } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";

// Regroupements utiles au quotidien plutôt que les six états bruts.
const FILTERS: { key: string; label: string; statuses: SessionStatus[] | null }[] = [
  { key: "actives", label: "À venir et en cours", statuses: ["PLANIFIEE", "CONFIRMEE", "EN_COURS"] },
  { key: "a_cloturer", label: "À clôturer", statuses: ["TERMINEE"] },
  { key: "archives", label: "Clôturées ou annulées", statuses: ["CLOTUREE", "ANNULEE"] },
  { key: "toutes", label: "Toutes", statuses: null },
];

function matches(s: SessionRow, q: string) {
  if (!q) return true;
  const hay = [s.reference, s.program_title, s.program_code, s.trainer_name, s.location].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export function SessionsList() {
  const query = useQuery({ queryKey: ["sessions"], queryFn: () => api.get<SessionRow[]>("sessions") });
  const [filter, setFilter] = React.useState("actives");
  const [q, setQ] = React.useState("");

  const rows = query.data ?? [];
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, rows.filter((s) => !f.statuses || f.statuses.includes(s.status)).length]),
  );
  const current = FILTERS.find((f) => f.key === filter)!;
  const visible = rows
    .filter((s) => !current.statuses || current.statuses.includes(s.status))
    .filter((s) => matches(s, q.trim()))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <>
      <PageHeader title="Sessions" meta={query.data && <span>{rows.length} sessions</span>} />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="radiogroup" aria-label="Filtrer les sessions" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium",
                filter === f.key
                  ? "border-brand bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-brand"
                  : "border-border-strong bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {f.label}
              {query.data && <span className="tabular text-xs opacity-75">{counts[f.key]}</span>}
            </button>
          ))}
        </div>
        <label className="relative block md:w-80">
          <span className="sr-only">Rechercher une session</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une session…"
            className="pl-9"
          />
        </label>
      </div>

      {query.isPending && <ListSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.isSuccess && visible.length === 0 && (
        <EmptyState title={q ? "Aucune session ne correspond" : "Aucune session dans cette vue"}>
          {q ? "Essayez un autre mot ou une autre vue." : "Changez de vue pour voir les autres sessions."}
        </EmptyState>
      )}
      {query.isSuccess && visible.length > 0 && (
        <>
          {/* Tableau (écran large) */}
          <div
            role="region"
            aria-label="Liste des sessions"
            tabIndex={0}
            className="relative hidden overflow-x-auto rounded-lg border bg-surface shadow-panel md:block"
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Session
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Dates
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Formateur
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Lieu
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Stagiaires
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    État
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((s) => (
                  <tr key={s.id} className="group relative hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link
                        href={`/sessions/${s.id}`}
                        className="font-medium text-fg after:absolute after:inset-0 group-hover:text-brand"
                      >
                        {s.reference}
                      </Link>
                      <div className="text-[13px] text-fg-muted">{s.program_title}</div>
                    </td>
                    <td className="tabular px-4 py-3 whitespace-nowrap">{fmt.range(s.start_date, s.end_date)}</td>
                    <td className="px-4 py-3">
                      {s.trainer_name ?? <span className="text-fg-subtle">Non affecté</span>}
                    </td>
                    <td className="px-4 py-3">{s.location ?? <span className="text-fg-subtle">À définir</span>}</td>
                    <td className="tabular px-4 py-3 text-right">
                      {s.learners_count}
                      {s.capacity ? <span className="text-fg-subtle"> / {s.capacity}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SESSION_STATUS[s.status].tone} dot>
                        {SESSION_STATUS[s.status].label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes (mobile) */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-lg border bg-surface px-4 py-3 shadow-panel active:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{s.reference}</div>
                      <div className="truncate text-[13px] text-fg-muted">{s.program_title}</div>
                    </div>
                    <Badge tone={SESSION_STATUS[s.status].tone} dot>
                      {SESSION_STATUS[s.status].label}
                    </Badge>
                  </div>
                  <div className="tabular mt-2 text-[13px]">{fmt.range(s.start_date, s.end_date)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-muted">
                    <span className="inline-flex items-center gap-1">
                      <User aria-hidden className="size-3.5" />
                      {s.trainer_name ?? "Non affecté"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin aria-hidden className="size-3.5" />
                      {s.location ?? "À définir"}
                    </span>
                    <span className="tabular">{s.learners_count} stagiaire(s)</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy aria-label="Chargement des sessions">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
