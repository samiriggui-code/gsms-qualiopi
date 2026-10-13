'use client';

// Accueil du module Programmes (modèle « accueil de module ») : état du catalogue, formations par filière,
// sessions programmées, points à arbitrer, ce que le moteur Qualiopi conclut des indicateurs du module, puis
// les prochaines formations. Le catalogue complet est à /formation/programmes/liste.
// Tout vient de /formation/catalogue, des sessions et du carnet ; la page compte et range.
import Link from 'next/link';
import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  CalendarDays,
  CircleCheckBig,
  ListChecks,
  Plus,
} from 'lucide-react';
import { MAIN_NAV } from '@/config/menu.config';
import { formatDate } from '@/lib/format';
import { useCarnet } from '@/lib/gsms/carnet';
import { hours, useCatalogue } from '@/lib/gsms/catalogue';
import { useSessions } from '@/lib/gsms/sessions';
import { useBootstrap } from '@/lib/gsms/settings';
import { useCan } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FICHE_STATE } from '@/components/catalogue/formation-sheet';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import {
  AlertListCard,
  type AlertItem,
} from '@/components/page/alert-list-card';
import { DonutCard, EvolutionCard } from '@/components/page/chart-cards';
import { EngineCard } from '@/components/page/engine-card';
import { itemIndicators } from '@/components/page/engine-states';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import {
  LandingRow,
  SectionCard,
  SectionEmpty,
} from '@/components/page/section-card';
import { WelcomeCallout } from '@/components/page/welcome-callout';

const LIST = '/formation/programmes/liste';
const ITEM = MAIN_NAV.flatMap((s) => s.items).find(
  (i) => i.id === 'programmes',
)!;
const INDICATORS = itemIndicators([ITEM]);

const plural = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

export default function ProgrammesHomePage() {
  const can = useCan();
  const quality = can('read_quality');
  const boot = useBootstrap();
  const { data, isLoading, error } = useCatalogue();
  const sessions = useSessions();
  const carnet = useCarnet(undefined, quality);

  const totaux = data?.totaux;
  const formations = data?.formations ?? [];
  const canEdit = Boolean(data?.capabilities.ecrire.allowed);
  const role = boot.data?.user.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ');

  // Sessions des six prochains mois, par mois de début, sessions annulées exclues.
  const months = Array.from({ length: 6 }, (_, i) =>
    addMonths(startOfMonth(new Date()), i),
  );
  const points = months.map((m) => {
    const key = format(m, 'yyyy-MM');
    const inMonth = (sessions.data ?? []).filter(
      (s) => s.status !== 'ANNULEE' && s.start_date.startsWith(key),
    );
    return {
      period: format(m, 'MMM yy', { locale: fr }),
      sessions: inMonth.length,
      stagiaires: inMonth.reduce((sum, s) => sum + s.learners_count, 0),
    };
  });

  const alerts: AlertItem[] = formations
    .filter(
      (f) =>
        f.points_a_arbitrer > 0 ||
        f.rubriques_manquantes > 0 ||
        f.fiche !== 'VALIDEE',
    )
    .sort(
      (a, b) =>
        b.points_a_arbitrer +
        b.rubriques_manquantes -
        (a.points_a_arbitrer + a.rubriques_manquantes),
    )
    .map((f) => ({
      id: f.id,
      title: f.title,
      subtitle: [
        f.points_a_arbitrer > 0 &&
          plural(f.points_a_arbitrer, 'point à arbitrer', 'points à arbitrer'),
        f.rubriques_manquantes > 0 &&
          plural(
            f.rubriques_manquantes,
            'rubrique manquante',
            'rubriques manquantes',
          ),
        f.fiche !== 'VALIDEE' && FICHE_STATE[f.fiche].label,
      ]
        .filter(Boolean)
        .join(' · '),
      tone:
        f.rubriques_manquantes > 0 ? ('danger' as const) : ('warning' as const),
      href: `${LIST}?id=${f.id}`,
    }));

  // Formations qui ont une session à venir, la plus proche d'abord.
  const next = formations
    .filter((f) => f.sessions.prochaine)
    .sort((a, b) =>
      a.sessions.prochaine!.start_date.localeCompare(
        b.sessions.prochaine!.start_date,
      ),
    );

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <BookOpen className="size-4 text-primary" />
          Programmes
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Programmes"
            icon={BookOpen}
            title="Programmes de formation"
            description="Les fiches formation du catalogue : objectifs, prérequis, contenus, modalités, tarifs et certification. Une fiche validée fige la version présentée aux stagiaires."
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href={LIST}>
                    <ListChecks /> Toutes les formations
                  </Link>
                </Button>
                {canEdit && (
                  <Button asChild>
                    <Link href={`${LIST}?nouveau=1`}>
                      <Plus /> Nouvelle formation
                    </Link>
                  </Button>
                )}
              </>
            }
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <>
              <LandingRow
                side={
                  <KpiRow
                    tiles
                    loading={isLoading}
                    items={[
                      {
                        label: 'Formations',
                        value: totaux?.formations ?? 0,
                        subtitle: plural(
                          data?.filieres.length ?? 0,
                          'filière',
                          'filières',
                        ),
                        icon: BookOpen,
                      },
                      {
                        label: 'Sessions à venir',
                        value: totaux?.sessions_a_venir ?? 0,
                        subtitle: 'planifiées ou confirmées',
                        icon: CalendarDays,
                      },
                      {
                        label: 'Fiches validées',
                        value: `${totaux?.fiches_validees ?? 0} / ${totaux?.formations ?? 0}`,
                        subtitle: 'version figée à jour',
                        icon: CircleCheckBig,
                      },
                      {
                        label: 'Points à arbitrer',
                        value: totaux?.points_a_arbitrer ?? 0,
                        subtitle: `sur ${plural(totaux?.formations_a_arbitrer ?? 0, 'formation', 'formations')}`,
                        icon: AlertTriangle,
                      },
                    ]}
                  />
                }
                main={
                  <WelcomeCallout
                    icon={BookOpen}
                    organization={boot.data?.organization?.name}
                    person={boot.data?.user.full_name}
                    role={role}
                    module="les programmes"
                    description={`Chaque formation a sa fiche : programme, prérequis, évaluation, sessions, ressources et points encore à arbitrer. Le moteur Qualiopi s’appuie sur ces fiches pour les indicateurs ${INDICATORS.join(', ')}.`}
                    footerLabel="Formations au catalogue"
                    footerValue={
                      isLoading ? '…' : String(totaux?.formations ?? 0)
                    }
                    cta={{ label: 'Voir le catalogue', href: LIST }}
                  />
                }
              />

              <LandingRow
                side={
                  <DonutCard
                    title="Formations par filière"
                    totalLabel="formations"
                    loading={isLoading}
                    slices={(data?.filieres ?? []).map((f) => ({
                      key: f.value,
                      label: f.label,
                      value: f.count,
                    }))}
                    empty="Aucune formation au catalogue pour l’instant."
                  />
                }
                main={
                  <EvolutionCard
                    title="Sessions programmées par mois"
                    subtitle="Six prochains mois, par mois de début, sessions annulées exclues"
                    series={[
                      { key: 'sessions', label: 'Sessions' },
                      { key: 'stagiaires', label: 'Stagiaires inscrits' },
                    ]}
                    points={points}
                    loading={sessions.isLoading}
                    empty="Aucune session programmée sur les six prochains mois."
                  />
                }
              />

              <LandingRow
                side={
                  <AlertListCard
                    title="À arbitrer"
                    subtitle="Fiches incomplètes, à valider ou avec des points ouverts"
                    icon={BellRing}
                    loading={isLoading}
                    items={alerts}
                    max={5}
                    empty="Toutes les fiches sont validées et complètes."
                  />
                }
                main={
                  <EngineCard
                    indicators={INDICATORS}
                    subtitle="Indicateurs alimentés par les fiches formation, état calculé à partir des preuves"
                    fiches={carnet.data?.fiches ?? []}
                    quality={quality}
                    loading={carnet.isLoading}
                  />
                }
              />

              <SectionCard
                title="Prochaines formations"
                subtitle="Formations qui ont une session à venir, la plus proche d’abord"
                icon={CalendarDays}
                count={isLoading ? undefined : next.length}
                contentClassName="p-0"
                toolbar={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={LIST}>Toutes</Link>
                  </Button>
                }
              >
                {next.length === 0 ? (
                  <SectionEmpty icon={CalendarDays}>
                    {isLoading
                      ? 'Chargement…'
                      : 'Aucune session à venir pour l’instant.'}
                  </SectionEmpty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dashed text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-5 py-2.5 text-start font-medium">
                            Formation
                          </th>
                          <th className="px-3 py-2.5 text-start font-medium max-lg:hidden">
                            Filière
                          </th>
                          <th className="px-3 py-2.5 text-start font-medium max-md:hidden">
                            Durée
                          </th>
                          <th className="px-3 py-2.5 text-start font-medium max-sm:hidden">
                            Prochaine session
                          </th>
                          <th className="px-5 py-2.5 text-end font-medium">
                            Fiche
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {next.slice(0, 8).map((f) => (
                          <tr
                            key={f.id}
                            className="border-b border-dashed last:border-0"
                          >
                            <td className="max-w-72 px-5 py-2.5">
                              <Link
                                href={`${LIST}?id=${f.id}`}
                                className="block truncate font-medium text-foreground hover:text-primary"
                              >
                                {f.title}
                              </Link>
                              <span className="text-xs text-muted-foreground">
                                {f.code}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-secondary-foreground max-lg:hidden">
                              {f.track_label}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-secondary-foreground max-md:hidden">
                              {hours(f.duration_hours) ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 max-sm:hidden">
                              <Link
                                href={`/formation/sessions/${f.sessions.prochaine!.id}`}
                                className="text-secondary-foreground hover:text-primary"
                              >
                                {formatDate(f.sessions.prochaine!.start_date)}
                              </Link>
                            </td>
                            <td className="px-5 py-2.5 text-end">
                              <Badge
                                size="sm"
                                className={FICHE_STATE[f.fiche].color}
                              >
                                {FICHE_STATE[f.fiche].label}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </Content>
    </>
  );
}
