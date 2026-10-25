'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Hourglass,
  Search,
  X,
} from 'lucide-react';
import { formatDate, formatDateRange } from '@/lib/format';
import { ENROLLMENT_STATUS, STEP_STATE } from '@/lib/gsms/labels';
import type { RegistryRow, RegistryView, StepRow } from '@/lib/gsms/registres';
import { useRegistry } from '@/lib/gsms/registres';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow, type KpiItem } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { CountedTabs } from '@/components/resource/counted-tabs';
import { initials } from '@/components/resource/record-card';
import { LearnerSheet } from '@/app/(app)/formation/sessions/[id]/learner-sheet';

export interface RegistryTab<T> {
  id: string;
  label: string;
  test: (row: T) => boolean;
}

// Écran transversal d'une étape du parcours (ou des inscriptions, abandons, examens) : toutes les sessions
// visibles, ce qui presse d'abord. Une ligne ouvre la fiche du stagiaire, avec les mêmes actions que dans
// le dossier de session : l'API décide de l'état et de ce qui est possible.
export function RegistryPage<T extends RegistryRow>({
  view,
  title,
  icon,
  description,
  indicators,
  kpis,
  tabs,
  status,
  detail,
  empty,
}: {
  view: RegistryView;
  title: string;
  icon: LucideIcon;
  description: string;
  indicators?: number[];
  kpis: (rows: T[]) => KpiItem[];
  tabs: RegistryTab<T>[];
  // Pastille d'état de la ligne (à droite) et texte de détail (sous le nom)
  status: (row: T) => { label: string; color: string };
  detail: (row: T) => ReactNode;
  empty: string;
}) {
  const { data, isLoading, error } = useRegistry<T>(view);
  const rows = useMemo(() => data?.lignes ?? [], [data]);
  const [tab, setTab] = useState(tabs[0]?.id ?? 'all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<{
    session: string;
    inscription: string;
  } | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const current = tabs.find((t) => t.id === tab);
    return rows.filter(
      (r) =>
        (!current || current.test(r)) &&
        (!q ||
          [r.stagiaire, r.session.reference, r.session.intitule, r.entreprise]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, tab, tabs, search]);

  const Icon = icon;
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
          {!isLoading && (
            <Badge variant="secondary" size="sm">
              {rows.length}
            </Badge>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Parcours apprenant"
            icon={icon}
            title={title}
            description={
              <>
                {description}
                {indicators?.length ? (
                  <span className="text-muted-foreground">
                    {' '}
                    Indicateur{indicators.length > 1 ? 's' : ''} Qualiopi{' '}
                    {indicators.join(', ')}.
                  </span>
                ) : null}
              </>
            }
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <>
              <KpiRow items={kpis(rows)} loading={isLoading} />
              {/* contain : les lignes tronquées ne doivent pas élargir la page sur téléphone */}
              <Card className="shadow-none overflow-hidden [contain:inline-size]">
                <CountedTabs
                  tabs={tabs.map((t) => ({
                    id: t.id,
                    label: t.label,
                    count: rows.filter(t.test).length,
                  }))}
                  value={tab}
                  onChange={setTab}
                />
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
                  <div className="relative w-full sm:w-72">
                    <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
                    <Input
                      variant="sm"
                      placeholder="Stagiaire, session, entreprise…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="ps-9 w-full"
                      aria-label="Rechercher"
                    />
                    {search && (
                      <Button
                        mode="icon"
                        variant="ghost"
                        className="absolute end-1.5 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => setSearch('')}
                        aria-label="Effacer la recherche"
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  <span className="ms-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {shown.length} ligne{shown.length > 1 ? 's' : ''}
                  </span>
                </div>
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : shown.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? empty : 'Aucune ligne ne correspond.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {shown.map((r) => {
                      const s = status(r);
                      return (
                        <li key={`${r.inscription}`}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpen({
                                session: r.session.id,
                                inscription: r.inscription,
                              })
                            }
                            className="group flex w-full min-w-0 items-center gap-3 px-4 py-3 text-start hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/50"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                              {initials(r.stagiaire)}
                            </span>
                            <span className="min-w-0 grow">
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="truncate text-sm font-medium text-foreground">
                                  {r.stagiaire}
                                </span>
                                {r.statut !== 'INSCRIT' &&
                                  r.statut !== 'CONFIRME' && (
                                    <Badge
                                      size="sm"
                                      className={
                                        ENROLLMENT_STATUS[r.statut].color
                                      }
                                    >
                                      {ENROLLMENT_STATUS[r.statut].label}
                                    </Badge>
                                  )}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {r.session.reference}
                                {r.session.intitule
                                  ? ` · ${r.session.intitule}`
                                  : ''}{' '}
                                ·{' '}
                                {formatDateRange(
                                  r.session.debut,
                                  r.session.fin,
                                )}
                                {r.entreprise ? ` · ${r.entreprise}` : ''}
                              </span>
                              <span className="block truncate text-xs text-foreground/80 mt-0.5">
                                {detail(r)}
                              </span>
                            </span>
                            <Badge
                              size="sm"
                              className={cn('shrink-0', s.color)}
                            >
                              {s.label}
                            </Badge>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground max-sm:hidden" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <p className="text-xs text-muted-foreground">
                Les états sont ceux du dossier de chaque session ; ouvrir une
                ligne pour agir. Vue complète d&apos;une session :{' '}
                <Link
                  href="/formation/sessions"
                  className="underline underline-offset-2"
                >
                  sessions
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </Content>
      {open && (
        <LearnerSheet
          sessionId={open.session}
          enrollmentId={open.inscription}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

// Pastille et onglets d'une étape : mêmes libellés que le dossier de session.
export const stepStatus = (r: { etape: { etat: keyof typeof STEP_STATE } }) =>
  STEP_STATE[r.etape.etat];

export function stepDetail(r: {
  etape: {
    etat: string;
    echeance: string | null;
    le: string | null;
    detail: string | null;
  };
  action: { allowed: boolean; libelle: string; message?: string } | null;
}) {
  if (r.etape.etat === 'FAIT')
    return `Fait${r.etape.le ? ` le ${formatDate(r.etape.le)}` : ''}${r.etape.detail ? ` · ${r.etape.detail}` : ''}`;
  if (r.etape.etat === 'SANS_OBJET') return 'Sans objet pour cette inscription';
  const due = r.etape.echeance
    ? `Échéance ${formatDate(r.etape.echeance)}`
    : null;
  const next = r.action
    ? r.action.allowed
      ? `${r.action.libelle} possible`
      : r.action.message
    : null;
  return [due, r.etape.detail, next].filter(Boolean).join(' · ') || '—';
}

export function stepTabs<
  T extends { etape: { etat: string } },
>(): RegistryTab<T>[] {
  return [
    {
      id: 'todo',
      label: 'À traiter',
      test: (r) =>
        r.etape.etat === 'EN_RETARD' || r.etape.etat === 'A_ECHEANCE',
    },
    { id: 'later', label: 'À venir', test: (r) => r.etape.etat === 'A_VENIR' },
    { id: 'done', label: 'Faits', test: (r) => r.etape.etat === 'FAIT' },
    { id: 'all', label: 'Toutes', test: () => true },
  ];
}

// Page d'une étape du parcours : cartes KPI par état, onglets « à traiter » d'abord.
export function StepRegistry({
  view,
  title,
  icon,
  description,
  indicators,
  empty,
}: {
  view: Exclude<RegistryView, 'inscriptions' | 'abandons' | 'certification'>;
  title: string;
  icon: LucideIcon;
  description: string;
  indicators?: number[];
  empty: string;
}) {
  const count = (rows: StepRow[], state: string) =>
    rows.filter((r) => r.etape.etat === state).length;
  return (
    <RegistryPage<StepRow>
      view={view}
      title={title}
      icon={icon}
      description={description}
      indicators={indicators}
      empty={empty}
      tabs={stepTabs<StepRow>()}
      status={stepStatus}
      detail={stepDetail}
      kpis={(rows) => [
        {
          label: 'En retard',
          value: count(rows, 'EN_RETARD'),
          subtitle: 'échéance dépassée',
          icon: AlarmClock,
        },
        {
          label: 'À échéance',
          value: count(rows, 'A_ECHEANCE'),
          subtitle: 'à faire maintenant',
          icon: Hourglass,
        },
        {
          label: 'À venir',
          value: count(rows, 'A_VENIR'),
          subtitle: 'pas encore dû',
          icon: CalendarClock,
        },
        {
          label: 'Faits',
          value: count(rows, 'FAIT'),
          subtitle: 'preuve enregistrée',
          icon: CircleCheck,
        },
      ]}
    />
  );
}
