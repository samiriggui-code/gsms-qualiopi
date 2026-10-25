'use client';

import Link from 'next/link';
import { Accessibility, ArrowRight, UserRound } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { useOrganization } from '@/lib/gsms/administration';
import { TONE } from '@/lib/gsms/labels';
import { useAdaptations, type Adaptation } from '@/lib/gsms/qualite';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DossierPanel } from '@/components/documents/dossier-panel';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

const STATUS: Record<Adaptation['statut'], { label: string; color: string }> = {
  A_TRAITER: { label: 'À traiter', color: TONE.warn },
  VALIDEE: { label: 'Validée', color: TONE.info },
  MISE_EN_OEUVRE: { label: 'Mise en œuvre', color: TONE.ok },
  AUCUNE: { label: 'Aucune', color: TONE.neutral },
};

function Referent({
  role,
  name,
  email,
}: {
  role: string;
  name: string | null;
  email?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UserRound className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{role}</span>
        <span
          className={cn(
            'block truncate text-sm font-medium',
            !name && 'text-destructive',
          )}
        >
          {name ?? 'Non désigné'}
        </span>
        {email && (
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        )}
      </span>
    </div>
  );
}

export default function HandicapPage() {
  const { data: org } = useOrganization();
  const { data: rows = [], isLoading, error } = useAdaptations();
  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <Accessibility className="size-4 text-primary" /> Handicap &
          accessibilité
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Qualité & amélioration"
            icon={Accessibility}
            title="Handicap & accessibilité"
            description="Les référents, les adaptations décidées pour les stagiaires qui en ont besoin, et les pièces qui le montrent. Indicateurs Qualiopi 20 et 26."
          />
          <Card className="shadow-none">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Référents</h2>
                <Link
                  href="/administration/organisme"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Modifier <ArrowRight className="size-3" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Referent
                  role="Référent handicap"
                  name={org?.disability_referent_name ?? null}
                  email={org?.disability_referent_email}
                />
                <Referent
                  role="Référent mobilité"
                  name={org?.mobility_referent_name ?? null}
                />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-none overflow-hidden [contain:inline-size]">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Adaptations demandées</h2>
              <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                {rows.filter((r) => r.statut === 'A_TRAITER').length} à traiter
              </span>
            </div>
            {error ? (
              <div className="p-4">
                <Refusal error={error} />
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Aucun besoin d’adaptation recueilli : ils se déclarent à
                l’analyse du besoin.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.inscription}>
                    <Link
                      href={`/formation/sessions/${r.session_id}`}
                      className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-muted/40"
                    >
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm font-medium">
                          {r.stagiaire}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.session}
                          {r.recueilli_le
                            ? ` · recueilli le ${formatDate(r.recueilli_le)}`
                            : ''}
                        </span>
                        {r.besoin && (
                          <span className="block truncate text-xs text-foreground/80">
                            {r.besoin}
                          </span>
                        )}
                      </span>
                      <Badge
                        size="sm"
                        className={cn('shrink-0', STATUS[r.statut].color)}
                      >
                        {STATUS[r.statut].label}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <DossierPanel
            subjectId={org?.id}
            indicators={[20, 26]}
            title="Pièces handicap et accessibilité"
          />
        </div>
      </Content>
    </>
  );
}
