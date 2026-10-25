'use client';

// Échéances & alertes : ce qui est en retard ou arrive à échéance, toutes sources confondues (jalons
// des sessions, titres des formateurs, démarches de financement). Chaque bloc n'apparaît que si le
// compte peut le lire ; les états viennent de l'API.
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlarmClock,
  Banknote,
  Bell,
  CalendarClock,
  GraduationCap,
  ShieldAlert,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useMilestones, useQualificationDeadlines } from '@/lib/gsms/dashboard';
import { TONE } from '@/lib/gsms/labels';
import { useFundingDeadlines } from '@/lib/gsms/qualite';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';

const STATE: Record<string, { label: string; color: string }> = {
  EN_RETARD: { label: 'En retard', color: TONE.danger },
  A_ECHEANCE: { label: 'À échéance', color: TONE.warn },
  A_VENIR: { label: 'À venir', color: TONE.neutral },
  EXPIRE: { label: 'Expiré', color: TONE.danger },
  A_RENOUVELER: { label: 'À renouveler', color: TONE.warn },
};

function Block({
  icon: Icon,
  title,
  loading,
  empty,
  count,
  children,
}: {
  icon: typeof Bell;
  title: string;
  loading: boolean;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-none overflow-hidden [contain:inline-size]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : count === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </Card>
  );
}

function Row({
  href,
  title,
  detail,
  state,
}: {
  href?: string;
  title: string;
  detail: string;
  state: string;
}) {
  const s = STATE[state] ?? { label: state, color: TONE.neutral };
  const body = (
    <>
      <span className="min-w-0 grow">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
      <Badge size="sm" className={cn('shrink-0', s.color)}>
        {s.label}
      </Badge>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted/40"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}

export default function AlertsPage() {
  const can = useCan();
  const quality = can('read_quality');
  const staff = can('read_staff');
  const funding = can('read_funding');
  const ms = useMilestones(30, quality);
  const titles = useQualificationDeadlines(staff);
  const fund = useFundingDeadlines(30, funding);
  const milestones = ms.data ?? [];
  const quals = titles.data ?? [];
  const funds = fund.isError ? [] : (fund.data ?? []);

  const late =
    milestones.filter((m) => m.status === 'EN_RETARD').length +
    funds.filter((f) => f.etat === 'EN_RETARD').length +
    quals.filter((q) => q.etat === 'EXPIRE').length;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Bell className="size-4 text-primary" /> Échéances & alertes
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Pilotage"
            icon={Bell}
            title="Échéances & alertes"
            description="Ce qui est en retard ou arrive à échéance dans les 30 jours : étapes des sessions, titres des formateurs, démarches de financement. Le plus urgent d'abord."
          />
          <KpiRow
            loading={ms.isLoading}
            items={[
              {
                label: 'En retard',
                value: late,
                subtitle: 'toutes sources',
                icon: AlarmClock,
              },
              {
                label: 'Étapes de session',
                value: milestones.length,
                subtitle: 'en retard ou dans 30 jours',
                icon: CalendarClock,
              },
              {
                label: 'Titres formateurs',
                value: quals.length,
                subtitle: 'expirés ou à renouveler',
                icon: ShieldAlert,
              },
              {
                label: 'Financement',
                value: funds.length,
                subtitle: 'démarches à faire',
                icon: Banknote,
              },
            ]}
          />
          <div className="grid gap-5 xl:grid-cols-2">
            {quality && (
              <Block
                icon={CalendarClock}
                title="Étapes des sessions"
                loading={ms.isLoading}
                count={milestones.length}
                empty="Aucune étape en retard ni proche."
              >
                {milestones.map((m) => (
                  <Row
                    key={`${m.session_id}-${m.key}`}
                    href={`/formation/sessions/${m.session_id}`}
                    title={`${m.label} · ${m.session}`}
                    detail={`${formatDate(m.due_on)} · ${m.done}/${m.total}${m.missing.length ? ` · manque ${m.missing.map((x) => x.who).join(', ')}` : ''}`}
                    state={m.status}
                  />
                ))}
              </Block>
            )}
            {staff && (
              <Block
                icon={GraduationCap}
                title="Titres des formateurs"
                loading={titles.isLoading}
                count={quals.length}
                empty="Aucun titre expiré ni à renouveler dans les 90 jours."
              >
                {quals.map((q) => (
                  <Row
                    key={`${q.formateur_id}-${q.libelle}`}
                    href="/rh/qualifications"
                    title={`${q.libelle} · ${q.formateur}`}
                    detail={`${q.etat === 'EXPIRE' ? 'Expiré le' : 'Expire le'} ${formatDate(q.fin)}`}
                    state={q.etat}
                  />
                ))}
              </Block>
            )}
            {funding && !fund.isError && (
              <Block
                icon={Banknote}
                title="Démarches de financement"
                loading={fund.isLoading}
                count={funds.length}
                empty="Aucune démarche de financement à faire."
              >
                {funds.map((f) => (
                  <Row
                    key={`${f.source_id}-${f.action}`}
                    href="/commercial/financeurs"
                    title={`${f.libelle} · ${f.stagiaire}`}
                    detail={`${f.dispositif} · ${f.session} · ${formatDate(f.echeance)}${f.portail ? ` · ${f.portail}` : ''}`}
                    state={f.etat}
                  />
                ))}
              </Block>
            )}
          </div>
        </div>
      </Content>
    </>
  );
}
