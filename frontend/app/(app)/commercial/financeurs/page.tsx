'use client';

import {
  Banknote,
  CircleAlert,
  HandCoins,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { TONE } from '@/lib/gsms/labels';
import { useFundingCases, type FundingCase } from '@/lib/gsms/qualite';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';

// Statut calculé par l'API (cofinancement : jamais saisi)
const STATUS: Record<FundingCase['statut'], { label: string; color: string }> =
  {
    PENDING: { label: 'Accord en attente', color: TONE.info },
    UNFUNDED: { label: 'Non financé', color: TONE.danger },
    PARTIALLY_FUNDED: { label: 'Financé en partie', color: TONE.warn },
    FUNDED: { label: 'Financé', color: TONE.ok },
    OVERFUNDED: { label: 'Accords > coût', color: TONE.warn },
  };

const euros = (v: string | number | null | undefined) =>
  v == null
    ? '—'
    : Number(v).toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      });
const human = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ');
const sum = (
  rows: FundingCase[],
  key: 'cout' | 'accorde' | 'reste_a_financer',
) => rows.reduce((n, r) => n + Number(r[key]), 0);

export default function FundersPage() {
  const { data: rows = [], isLoading, error } = useFundingCases();
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Banknote className="size-4 text-primary" /> Financeurs & prises en
          charge
          {!isLoading && !error && (
            <Badge variant="secondary" size="sm">
              {rows.length}
            </Badge>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Clients & financement"
            icon={Banknote}
            title="Financeurs & prises en charge"
            description="Chaque dossier de financement : dispositifs (OPCO, CPF, France Travail…), financeurs, montants demandés, accordés et réglés. Le statut se calcule à partir des accords, il ne se saisit pas."
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <>
              <KpiRow
                loading={isLoading}
                items={[
                  {
                    label: 'Dossiers',
                    value: rows.length,
                    subtitle: 'ouverts',
                    icon: Wallet,
                  },
                  {
                    label: 'Coût des actions',
                    value: euros(sum(rows, 'cout')),
                    subtitle: 'à financer au total',
                    icon: PiggyBank,
                  },
                  {
                    label: 'Accordé',
                    value: euros(sum(rows, 'accorde')),
                    subtitle: 'par les financeurs',
                    icon: HandCoins,
                  },
                  {
                    label: 'Reste à financer',
                    value: euros(sum(rows, 'reste_a_financer')),
                    subtitle: 'sans accord à ce jour',
                    icon: CircleAlert,
                  },
                ]}
              />
              <Card className="shadow-none overflow-hidden [contain:inline-size]">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : rows.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Aucun dossier de financement ouvert.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.map((c) => (
                      <li key={c.id} className="px-4 py-3 space-y-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="min-w-0 grow">
                            <span className="block truncate text-sm font-medium">
                              {c.stagiaire}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.session} · coût {euros(c.cout)} · accordé{' '}
                              {euros(c.accorde)} · réglé {euros(c.regle)}
                            </span>
                          </span>
                          <Badge
                            size="sm"
                            className={cn('shrink-0', STATUS[c.statut].color)}
                          >
                            {STATUS[c.statut].label}
                          </Badge>
                        </div>
                        {c.sources.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {c.sources.map((s) => (
                              <span
                                key={s.id}
                                className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs"
                              >
                                <span className="font-medium">
                                  {s.financeur ?? s.libelle}
                                </span>
                                <span className="text-muted-foreground">
                                  {s.dispositif}
                                </span>
                                <span className="text-muted-foreground">
                                  · {human(s.etat)}
                                </span>
                                {s.montants.accorde && (
                                  <span>· {euros(s.montants.accorde)}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      </Content>
    </>
  );
}
