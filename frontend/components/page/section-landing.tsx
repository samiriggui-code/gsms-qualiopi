'use client';

import type { ReactNode } from 'react';
import { BellRing } from 'lucide-react';
import { MAIN_NAV } from '@/config/menu.config';
import { useCarnet } from '@/lib/gsms/carnet';
import { useCan } from '@/lib/permissions';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { AlertListCard, type AlertItem } from './alert-list-card';
import { EngineCard } from './engine-card';
import { sectionIndicators } from './engine-states';
import { KpiRow, type KpiItem } from './kpi-row';
import { ModuleCard, type ModuleFigure } from './module-card';
import { PageHero } from './page-hero';
import { LandingRow } from './section-card';

// Page d'une section du menu (niveau 1, entre l'accueil global et les accueils de module) : bandeau, chiffres
// de la section, graphiques propres à la section, points à traiter à côté de ce que le moteur Qualiopi conclut
// des indicateurs de la section, puis une carte par module. Chaque page de section fournit ses chiffres (tirés
// de l'API) ; ce gabarit ne calcule rien.

// Mêmes teintes que les cartes de l'accueil global.
const TINTS = [
  'bg-sky-500/15 border-sky-500/25 text-sky-700 dark:text-sky-300',
  'bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 border-amber-500/25 text-amber-700 dark:text-amber-300',
  'bg-violet-500/15 border-violet-500/25 text-violet-700 dark:text-violet-300',
  'bg-rose-500/15 border-rose-500/25 text-rose-700 dark:text-rose-300',
] as const;

export type ModuleFigures = Record<
  string,
  { loading?: boolean; list: ModuleFigure[] }
>;

export function SectionLanding({
  sectionId,
  description,
  error,
  kpis,
  kpiLoading,
  charts,
  alerts,
  engine,
  figures,
  descriptions = {},
}: {
  sectionId: string;
  description: string;
  error?: unknown;
  kpis: KpiItem[];
  kpiLoading?: boolean;
  charts?: ReactNode;
  alerts: {
    subtitle: string;
    items: AlertItem[];
    loading?: boolean;
    empty: string;
  };
  // Remplace la carte « Moteur Qualiopi » (section Qualiopi : tous les indicateurs)
  engine?: ReactNode;
  figures: ModuleFigures;
  descriptions?: Record<string, string>;
}) {
  const section = MAIN_NAV.find((s) => s.id === sectionId)!;
  const Icon = section.icon;
  const quality = useCan()('read_quality');
  const carnet = useCarnet(undefined, quality);
  const fiches = carnet.data?.fiches ?? [];
  const indicators = sectionIndicators(section);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-primary" />}
          {section.title}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Section"
            icon={Icon}
            title={section.title}
            description={description}
          />
          <Refusal error={error} />

          <KpiRow loading={kpiLoading} items={kpis} />

          {charts}

          <LandingRow
            side={
              <AlertListCard
                title="À traiter"
                subtitle={alerts.subtitle}
                icon={BellRing}
                loading={alerts.loading}
                items={alerts.items}
                max={5}
                empty={alerts.empty}
              />
            }
            main={
              engine ?? (
                <EngineCard
                  indicators={indicators}
                  subtitle="Indicateurs alimentés par cette section, état calculé à partir des preuves"
                  fiches={fiches}
                  quality={quality}
                  loading={carnet.isLoading}
                />
              )
            }
          />

          <div className="space-y-1 pt-2">
            <h2 className="text-lg font-semibold text-foreground">
              Modules de la section
            </h2>
            <p className="text-sm text-muted-foreground">
              Une carte par module, avec ses chiffres et les indicateurs
              Qualiopi qu’il alimente.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {section.items.map((item, i) => (
              <ModuleCard
                key={item.id}
                item={item}
                tint={TINTS[i % TINTS.length]}
                description={descriptions[item.id]}
                figures={figures[item.id]?.list ?? []}
                loading={figures[item.id]?.loading}
                fiches={fiches}
                quality={quality}
                carnetLoading={carnet.isLoading}
              />
            ))}
          </div>
        </div>
      </Content>
    </>
  );
}
