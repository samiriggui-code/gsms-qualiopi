'use client';

// Vue d'ensemble « Parcours apprenant » : chiffres de la synthèse de l'API (mêmes états que les registres
// et que le dossier de chaque session), étapes en retard à traiter, puis une carte par module.
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Award,
  CircleCheck,
  ClipboardList,
  Users,
  UserX,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { STEP_LABEL } from '@/lib/gsms/labels';
import type { JourneyStepKey, StepState } from '@/lib/gsms/types';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AlertItem } from '@/components/page/alert-list-card';
import { DonutCard } from '@/components/page/chart-cards';
import { LandingRow } from '@/components/page/section-card';
import {
  SectionLanding,
  type ModuleFigures,
} from '@/components/page/section-landing';

interface Summary {
  etapes: Record<JourneyStepKey, Partial<Record<StepState, number>>>;
  inscriptions: Partial<
    Record<'INSCRIT' | 'CONFIRME' | 'TERMINE' | 'ABANDON' | 'ANNULE', number>
  >;
  examens: { presentes: number; reussis: number };
  en_retard: {
    stagiaire: string;
    session: string;
    session_id: string;
    etape: JourneyStepKey;
    echeance: string | null;
  }[];
}

// Module du menu → étape du parcours
const MODULE_STEP: Record<string, JourneyStepKey> = {
  'analyses-besoin': 'analyse_besoin',
  positionnements: 'positionnement',
  convocations: 'convocation',
  emargements: 'emargement',
  'evaluations-acquis': 'evaluations',
  attestations: 'attestation',
};
const ORDER: JourneyStepKey[] = [
  'analyse_besoin',
  'positionnement',
  'convention',
  'convocation',
  'emargement',
  'evaluations',
  'attestation',
  'satisfaction_chaud',
  'satisfaction_froid',
];

const n = (c: Partial<Record<string, number>> | undefined, k: string) =>
  c?.[k] ?? 0;

function StepsCard({ data, loading }: { data?: Summary; loading: boolean }) {
  return (
    <Card className="shadow-none h-full">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Avancement par étape
        </h2>
        <p className="text-xs text-muted-foreground">
          Stagiaires pour qui l’étape est faite, sur ceux qu’elle concerne
        </p>
      </div>
      <div className="p-5 space-y-3">
        {loading || !data
          ? Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))
          : ORDER.map((k) => {
              const c = data.etapes[k] ?? {};
              const applicable = Object.entries(c).reduce(
                (a, [state, v]) => a + (state === 'SANS_OBJET' ? 0 : (v ?? 0)),
                0,
              );
              const done = n(c, 'FAIT');
              const late = n(c, 'EN_RETARD');
              const pct = applicable
                ? Math.round((done / applicable) * 100)
                : 0;
              return (
                <div key={k} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{STEP_LABEL[k].label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {done}/{applicable}
                      {late ? (
                        <span className="ms-2 font-medium text-red-700 dark:text-red-400">
                          {late} en retard
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </Card>
  );
}

export default function ParcoursSectionPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['registres', 'synthese'],
    queryFn: () => api.get<Summary>('parcours/synthese'),
  });
  const ins = data?.inscriptions ?? {};
  const open = n(ins, 'INSCRIT') + n(ins, 'CONFIRME');
  const late = data?.en_retard ?? [];

  const alerts: AlertItem[] = late.map((r, i) => ({
    id: `${r.session_id}-${r.stagiaire}-${r.etape}-${i}`,
    title: `${STEP_LABEL[r.etape].label} · ${r.stagiaire}`,
    subtitle: r.session,
    when: r.echeance ? formatDate(r.echeance) : undefined,
    tone: 'danger',
    href: `/formation/sessions/${r.session_id}`,
  }));

  const figures: ModuleFigures = {
    inscriptions: {
      loading: isLoading,
      list: [
        { label: 'En cours', value: open },
        { label: 'À confirmer', value: n(ins, 'INSCRIT') },
      ],
    },
    certification: {
      loading: isLoading,
      list: [
        { label: 'Présentés', value: data?.examens.presentes ?? 0 },
        { label: 'Réussis', value: data?.examens.reussis ?? 0 },
      ],
    },
    abandons: {
      loading: isLoading,
      list: [
        { label: 'Abandons', value: n(ins, 'ABANDON') },
        { label: 'Annulations', value: n(ins, 'ANNULE') },
      ],
    },
  };
  for (const [module, step] of Object.entries(MODULE_STEP)) {
    const c = data?.etapes[step];
    figures[module] = {
      loading: isLoading,
      list: [
        { label: 'Faits', value: n(c, 'FAIT') },
        { label: 'En retard', value: n(c, 'EN_RETARD') },
      ],
    };
  }

  return (
    <SectionLanding
      sectionId="parcours"
      description="Le parcours de chaque stagiaire, de l’analyse du besoin à l’attestation : ce qui est fait, ce qui est en retard. Chaque carte ouvre le registre correspondant."
      error={error}
      kpiLoading={isLoading}
      kpis={[
        {
          label: 'Inscriptions en cours',
          value: open,
          subtitle: 'inscrites ou confirmées',
          icon: Users,
        },
        {
          label: 'Étapes en retard',
          value: late.length,
          subtitle: 'toutes étapes confondues',
          icon: AlarmClock,
        },
        {
          label: 'Terminées',
          value: n(ins, 'TERMINE'),
          subtitle: 'formation suivie',
          icon: CircleCheck,
        },
        {
          label: 'Certification',
          value: data?.examens.reussis ?? 0,
          subtitle: `réussite sur ${data?.examens.presentes ?? 0} présenté(s)`,
          icon: Award,
        },
        {
          label: 'Abandons',
          value: n(ins, 'ABANDON'),
          subtitle: `et ${n(ins, 'ANNULE')} annulation(s)`,
          icon: UserX,
        },
      ]}
      charts={
        <LandingRow
          side={
            <DonutCard
              title="Inscriptions"
              subtitle="Par statut"
              icon={ClipboardList}
              totalLabel="inscriptions"
              loading={isLoading}
              slices={[
                {
                  key: 'INSCRIT',
                  label: 'Inscrites',
                  value: n(ins, 'INSCRIT'),
                },
                {
                  key: 'CONFIRME',
                  label: 'Confirmées',
                  value: n(ins, 'CONFIRME'),
                },
                {
                  key: 'TERMINE',
                  label: 'Terminées',
                  value: n(ins, 'TERMINE'),
                },
                { key: 'ABANDON', label: 'Abandons', value: n(ins, 'ABANDON') },
                { key: 'ANNULE', label: 'Annulées', value: n(ins, 'ANNULE') },
              ]}
              empty="Aucune inscription pour l’instant."
            />
          }
          main={<StepsCard data={data} loading={isLoading} />}
        />
      }
      alerts={{
        subtitle: 'Étapes du parcours en retard',
        items: alerts,
        loading: isLoading,
        empty: 'Aucune étape en retard.',
      }}
      figures={figures}
    />
  );
}
