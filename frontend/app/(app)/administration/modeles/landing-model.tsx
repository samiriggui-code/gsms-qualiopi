'use client';

import { useState } from 'react';
import Link from 'next/link';
import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  BellRing,
  CalendarDays,
  GraduationCap,
  ListChecks,
} from 'lucide-react';
import { formatDate, formatDateRange } from '@/lib/format';
import { useMilestones } from '@/lib/gsms/dashboard';
import { MILESTONE, SESSION_STATUS } from '@/lib/gsms/labels';
import { useSessions } from '@/lib/gsms/sessions';
import { useBootstrap } from '@/lib/gsms/settings';
import type { SessionRow, SessionStatus } from '@/lib/gsms/types';
import { useCan } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertListCard } from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import {
  LandingRow,
  SectionCard,
  SectionEmpty,
} from '@/components/page/section-card';
import { WelcomeCallout } from '@/components/page/welcome-callout';
import { sessionKpis } from '../../formation/sessions/session-list';
import { Repere, RepereNote } from './repere';

const STATUS_ORDER: SessionStatus[] = [
  'PLANIFIEE',
  'CONFIRMEE',
  'EN_COURS',
  'TERMINEE',
  'CLOTUREE',
  'ANNULEE',
];
const STATUS_COLOR: Record<SessionStatus, string> = {
  PLANIFIEE: 'var(--color-slate-400)',
  CONFIRMEE: 'var(--color-sky-500)',
  EN_COURS: 'var(--color-violet-500)',
  TERMINEE: 'var(--color-amber-500)',
  CLOTUREE: 'var(--color-emerald-500)',
  ANNULEE: 'var(--color-rose-500)',
};
const UPCOMING: SessionStatus[] = ['PLANIFIEE', 'CONFIRMEE', 'EN_COURS'];

// Sessions et inscrits par mois de démarrage, sur la fenêtre choisie (mois passés + 3 mois à venir).
function byMonth(sessions: SessionRow[], months: number) {
  const first = startOfMonth(addMonths(new Date(), -(months - 4)));
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(first, i);
    const key = format(m, 'yyyy-MM');
    const inMonth = sessions.filter(
      (s) => s.status !== 'ANNULEE' && s.start_date.startsWith(key),
    );
    return {
      period: format(m, 'MMM yy', { locale: fr }),
      sessions: inMonth.length,
      inscrits: inMonth.reduce((n, s) => n + s.learners_count, 0),
    };
  });
}

// Modèle « accueil de module » (GSMS School : accueil Finance, Support, Pilotage), monté sur l'offre
// de formation : tout vient de l'API (sessions, échéancier, organisme, personne connectée).
export function LandingModel() {
  const can = useCan();
  const quality = can('read_quality');
  const { data: sessions = [], isLoading } = useSessions();
  const boot = useBootstrap();
  const milestones = useMilestones(15, quality);
  const [months, setMonths] = useState('12');

  const next = sessions
    .filter((s) => s.status === 'PLANIFIEE' || s.status === 'CONFIRMEE')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const upcoming = sessions
    .filter((s) => UPCOMING.includes(s.status))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const alerts = (milestones.data ?? [])
    .filter((m) => m.status === 'EN_RETARD' || m.status === 'A_ECHEANCE')
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .map((m) => ({
      id: `${m.session_id}-${m.key}`,
      title: m.label,
      subtitle: `${m.session} · ${m.done}/${m.total} fait${m.done > 1 ? 's' : ''}`,
      kind: MILESTONE[m.status]?.label,
      when: formatDate(m.due_on, 'd MMM'),
      tone:
        m.status === 'EN_RETARD' ? ('danger' as const) : ('warning' as const),
      href: `/formation/sessions/${m.session_id}`,
    }));
  const role = boot.data?.user.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <div className="space-y-8">
      <Repere n={1} name="Bandeau de titre">
        <RepereNote>
          En tête de chaque page : rubrique, titre, une phrase qui dit à quoi
          sert la page, actions à droite.
        </RepereNote>
        <PageHero
          eyebrow="Offre de formation"
          icon={GraduationCap}
          title="Formation"
          description="Les sessions de l’organisme, leurs inscrits et les échéances à tenir avant, pendant et après chaque session."
          actions={
            <Button asChild>
              <Link href="/formation/sessions">
                <CalendarDays /> Sessions
              </Link>
            </Button>
          }
        />
      </Repere>

      <Repere n={2} name="Cartes chiffres + encart d’accueil">
        <RepereNote>
          Colonne étroite : 4 chiffres comptés sur les données de l’API. Colonne
          large : à qui on parle, où, et l’information du jour.
        </RepereNote>
        <LandingRow
          side={
            <KpiRow
              tiles
              items={sessionKpis(sessions).slice(0, 4)}
              loading={isLoading}
            />
          }
          main={
            <WelcomeCallout
              icon={GraduationCap}
              organization={boot.data?.organization?.name}
              person={boot.data?.user.full_name}
              role={role}
              module="l’offre de formation"
              description="Planifiez les sessions, inscrivez les stagiaires et suivez leur parcours : l’échéancier signale ce qui est en retard ou arrive à échéance."
              footerLabel="Prochaine session"
              footerValue={
                next[0]
                  ? `${next[0].reference} · ${formatDate(next[0].start_date)}`
                  : 'Aucune session planifiée'
              }
              cta={{ label: 'Voir les sessions', href: '/formation/sessions' }}
            />
          }
        />
      </Repere>

      <Repere n={3} name="Graphiques : répartition + évolution">
        <RepereNote>
          Donut à gauche (une répartition, total au centre, légende en pied),
          courbe à droite (une évolution dans le temps, période au choix). Sans
          données, la carte le dit.
        </RepereNote>
        <LandingRow
          side={
            <DonutCard
              title="Sessions par statut"
              totalLabel="sessions"
              loading={isLoading}
              slices={STATUS_ORDER.map((st) => ({
                key: st,
                label: SESSION_STATUS[st].label,
                value: sessions.filter((s) => s.status === st).length,
                color: STATUS_COLOR[st],
              }))}
            />
          }
          main={
            <EvolutionCard
              title="Sessions et inscrits par mois"
              subtitle="Mois de démarrage ; les 3 prochains mois inclus"
              loading={isLoading}
              series={[
                { key: 'inscrits', label: 'Inscrits' },
                { key: 'sessions', label: 'Sessions' },
              ]}
              points={byMonth(sessions, Number(months))}
              toolbar={
                <Select value={months} onValueChange={setMonths}>
                  <SelectTrigger
                    size="sm"
                    className="w-28"
                    aria-label="Période"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 mois</SelectItem>
                    <SelectItem value="12">12 mois</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          }
        />
      </Repere>

      <Repere n={4} name="Alertes + tableau">
        <RepereNote>
          À gauche, ce qui demande une action (avec son échéance et un lien pour
          la traiter). À droite, les éléments récents ou à venir du module, avec
          un lien vers la liste complète.
        </RepereNote>
        <LandingRow
          side={
            <AlertListCard
              title="Échéances"
              subtitle="En retard ou à échéance sous 15 jours"
              icon={BellRing}
              loading={quality && milestones.isLoading}
              items={alerts}
              empty={
                quality
                  ? 'Aucune échéance en retard ni proche.'
                  : 'Réservé aux personnes qui suivent la qualité.'
              }
            />
          }
          main={
            <SectionCard
              title="Prochaines sessions"
              subtitle="À venir et en cours"
              icon={ListChecks}
              count={isLoading ? undefined : upcoming.length}
              contentClassName="p-0"
              toolbar={
                <Button variant="outline" size="sm" asChild>
                  <Link href="/formation/sessions">Toutes</Link>
                </Button>
              }
            >
              {upcoming.length === 0 ? (
                <SectionEmpty icon={CalendarDays}>
                  {isLoading ? 'Chargement…' : 'Aucune session à venir.'}
                </SectionEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dashed text-start text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-5 py-2.5 text-start font-medium">
                          Session
                        </th>
                        <th className="px-3 py-2.5 text-start font-medium">
                          Dates
                        </th>
                        <th className="px-3 py-2.5 text-start font-medium max-md:hidden">
                          Formateur
                        </th>
                        <th className="px-3 py-2.5 text-end font-medium">
                          Inscrits
                        </th>
                        <th className="px-5 py-2.5 text-end font-medium">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.slice(0, 6).map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-dashed last:border-0"
                        >
                          <td className="max-w-56 px-5 py-2.5">
                            <Link
                              href={`/formation/sessions/${s.id}`}
                              className="block truncate font-medium text-foreground hover:text-primary"
                            >
                              {s.program_title ?? s.reference}
                            </Link>
                            <span className="text-xs text-muted-foreground">
                              {s.reference}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-secondary-foreground">
                            {formatDateRange(s.start_date, s.end_date)}
                          </td>
                          <td className="px-3 py-2.5 max-md:hidden">
                            {s.trainer_name ?? (
                              <span className="text-destructive">
                                À affecter
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-end tabular-nums">
                            {s.learners_count}
                            {s.capacity ? `/${s.capacity}` : ''}
                          </td>
                          <td className="px-5 py-2.5 text-end">
                            <Badge
                              size="sm"
                              className={SESSION_STATUS[s.status].color}
                            >
                              {SESSION_STATUS[s.status].label}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          }
        />
      </Repere>
    </div>
  );
}
