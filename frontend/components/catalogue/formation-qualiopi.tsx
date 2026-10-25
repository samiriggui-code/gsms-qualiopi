'use client';

// Onglet « Qualiopi » de la fiche formation : ce que le moteur conclut pour cette formation et ses sessions,
// indicateur par indicateur (contrôles, attendu, constaté, manques), puis ses preuves et ses écarts ouverts.
// Tout vient de /qualiopi/formations/{id} ; l'onglet n'évalue rien.
import Link from 'next/link';
import { ChevronRight, FileSearch, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useFormationQualiopi } from '@/lib/gsms/evaluations';
import { READINESS } from '@/lib/gsms/labels';
import { EVIDENCE_TONE, type EvidenceStatus } from '@/lib/gsms/preuves';
import type { ReadinessStatus } from '@/lib/gsms/types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';

const ORDER: ReadinessStatus[] = [
  'PREUVES_INSUFFISANTES',
  'A_RISQUE',
  'NON_EVALUABLE',
  'NON_EVALUE',
  'DEMONTRABLE',
  'NON_APPLICABLE',
];

const MAX_EVIDENCE = 12;

function Missing({ items }: { items: Record<string, unknown>[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, 5);
  return (
    <ul className="list-disc space-y-0.5 ps-4 text-xs text-muted-foreground">
      {shown.map((m, i) => (
        <li key={i}>{[m.who, m.reason].filter(Boolean).join(' : ')}</li>
      ))}
      {items.length > shown.length && (
        <li>et {items.length - shown.length} autre(s)</li>
      )}
    </ul>
  );
}

export function FormationQualiopi({ id }: { id: string }) {
  const { data, isLoading, error } = useFormationQualiopi(id);
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data) return <Refusal error={error} />;

  const counts = ORDER.map((etat) => ({
    etat,
    n: data.indicateurs.filter((i) => i.etat === etat).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Indicateurs contrôlés</p>
          <p className="text-xl font-semibold tabular-nums">
            {data.indicateurs.length}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {counts.map((c) => (
              <Badge key={c.etat} size="sm" className={READINESS[c.etat].color}>
                {READINESS[c.etat].label} : {c.n}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Preuves exploitables</p>
          <p className="text-xl font-semibold tabular-nums">
            {data.preuves.exploitables} / {data.preuves.total}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            formation et {data.sessions} session
            {data.sessions > 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Écarts ouverts</p>
          <p className="text-xl font-semibold tabular-nums">
            {data.ecarts.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            relevés par les contrôles du moteur
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{data.avertissement}</p>

      {data.indicateurs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Aucun contrôle du moteur ne porte encore sur cette formation ou ses
          sessions.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.indicateurs.map((ind) => (
            <li key={ind.numero}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-xs font-bold tabular-nums">
                    {ind.numero}
                  </span>
                  <span className="min-w-0 grow">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {ind.nom}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ind.controles.length} contrôle
                      {ind.controles.length > 1 ? 's' : ''}
                    </span>
                  </span>
                  <Badge size="sm" className={READINESS[ind.etat].color}>
                    {READINESS[ind.etat].label}
                  </Badge>
                </summary>
                <ul className="space-y-3 border-t border-dashed px-4 py-3 sm:ps-14">
                  {ind.controles.map((c) => (
                    <li key={c.id} className="space-y-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 text-sm text-foreground">
                          {c.libelle}
                          <span className="text-muted-foreground">
                            {' '}
                            · {c.cible}
                          </span>
                        </p>
                        <Badge size="sm" className={READINESS[c.etat].color}>
                          {READINESS[c.etat].label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.explication}
                      </p>
                      <p className="text-xs">
                        <span className="text-muted-foreground">
                          Constaté :{' '}
                        </span>
                        {c.constate}
                      </p>
                      <Missing items={c.manquants} />
                    </li>
                  ))}
                  <li>
                    <Link
                      href={`/qualiopi/carnet?i=${ind.numero}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Voir l’indicateur {ind.numero} dans le carnet d’audit
                    </Link>
                  </li>
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}

      {data.ecarts.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-destructive" />
            Écarts ouverts ({data.ecarts.length})
          </h3>
          <ul className="space-y-2">
            {data.ecarts.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-border bg-accent/40 p-3 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{e.titre}</span>
                  <Badge size="sm" variant="outline" className="bg-background">
                    {e.statut_libelle}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {e.reference} · indicateur {e.indicateur}
                  {e.constate_le
                    ? ` · relevé le ${formatDate(e.constate_le)}`
                    : ''}
                </p>
                {e.a_faire && <p className="text-xs">{e.a_faire}</p>}
              </li>
            ))}
          </ul>
          <Link
            href="/qualiopi/capa"
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Ouvrir les écarts et actions correctives
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <FileSearch className="size-4 text-primary" />
          Preuves ({data.preuves.total})
        </h3>
        {data.preuves.liste.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Aucune preuve enregistrée pour cette formation et ses sessions.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.preuves.liste.slice(0, MAX_EVIDENCE).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <span className="min-w-0 grow basis-56">
                  <Link
                    href={`/qualiopi/preuves?p=${p.id}`}
                    className="block truncate text-sm font-medium hover:text-primary"
                  >
                    {p.libelle}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.reference} · {p.type_libelle} · {p.cible}
                    {p.indicateurs.length > 0 &&
                      ` · ind. ${p.indicateurs.join(', ')}`}
                  </span>
                </span>
                <Badge
                  size="sm"
                  className={EVIDENCE_TONE[p.statut as EvidenceStatus]}
                >
                  {p.statut_libelle}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {data.preuves.total > MAX_EVIDENCE && (
          <Link
            href="/qualiopi/preuves"
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Voir toutes les preuves ({data.preuves.total})
          </Link>
        )}
      </div>
    </div>
  );
}
