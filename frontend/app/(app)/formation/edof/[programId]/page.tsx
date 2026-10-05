'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  Eye,
  FolderPlus,
  GraduationCap,
  Landmark,
  Library,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  edofApi,
  useEdofDossier,
  useEdofMutation,
  useFiche,
  type Anomaly,
} from '@/lib/gsms/edof';
import { useCan } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnomalyList } from '@/components/edof/anomaly-list';
import { DossierActions } from '@/components/edof/dossier-actions';
import { EdofJourney } from '@/components/edof/journey';
import { DOSSIER_STATUS, STEP_LABEL } from '@/components/edof/labels';
import { PiecesPanel } from '@/components/edof/pieces-panel';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { ApercuTab, SuiviTab } from './apercu-tab';
import { CertificationTab } from './certification-tab';
import { ContenusTab } from './contenus-tab';
import { ProgrammeTab } from './programme-tab';

const TAB_STEP: Record<string, number> = {
  programme: 3,
  contenus: 4,
  certification: 5,
  controles: 6,
  apercu: 8,
  transmission: 9,
  suivi: 4,
};
const STEP_TAB: Record<string, string> = {
  programme: 'programme',
  contenus: 'contenus',
  certification: 'certification',
  pieces: 'transmission',
  suivi: 'transmission',
};

export default function FormationEdofPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = use(params);
  const router = useRouter();
  const can = useCan();
  const fiche = useFiche(programId);
  const dossier = useEdofDossier(fiche.data?.dossier?.id);
  const create = useEdofMutation(() => edofApi.createDossier(programId));
  const [tab, setTab] = useState('controles');
  const [highlight, setHighlight] = useState<string | null>(null);
  const d = dossier.data;

  function go(a: Anomaly) {
    if (a.etape === 'etablissement') return router.push('/formation/edof');
    setTab(STEP_TAB[a.etape] ?? 'controles');
    const key = a.cible.code ?? a.cible.champ ?? a.cible.id ?? null;
    setHighlight(key);
    setTimeout(() => {
      const id =
        a.cible.type === 'piece'
          ? `piece-${key}`
          : a.cible.type === 'intervenant'
            ? `intervenant-${key}`
            : `champ-${key}`;
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }

  const program = fiche.data?.program;
  return (
    <>
      <ContentHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="ghost" mode="icon" size="sm" asChild>
            <Link href="/formation/edof" aria-label="Retour au référencement">
              <Landmark className="text-primary" />
            </Link>
          </Button>
          {program ? (
            <h1 className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold min-w-0">
              <span className="whitespace-nowrap">{program.code}</span>
              <span className="text-muted-foreground font-normal truncate max-sm:hidden">
                {program.title}
              </span>
              {d && (
                <Badge className={DOSSIER_STATUS[d.display_status].color}>
                  {d.display_label}
                </Badge>
              )}
            </h1>
          ) : (
            <Skeleton className="h-5 w-48 lg:w-96" />
          )}
        </div>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid min-w-0 space-y-5">
          {fiche.error ? (
            <Refusal error={fiche.error} />
          ) : !fiche.data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              <EdofJourney current={TAB_STEP[tab] ?? 3} />
              {!fiche.data.dossier && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Pas encore de dossier de référencement pour cette
                      formation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="grow text-muted-foreground">
                      La fiche se complète sans dossier ; le dossier ajoute les
                      contrôles EDOF et le suivi du dépôt.
                    </span>
                    {can('write_edof') && (
                      <Button
                        size="sm"
                        disabled={create.isPending}
                        onClick={() =>
                          create.mutate(undefined, {
                            onError: (e) => toast.error(e.message),
                          })
                        }
                      >
                        <FolderPlus /> Préparer son dossier
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
              <Tabs
                value={tab}
                onValueChange={setTab}
                className="text-sm min-w-0"
              >
                <TabsList
                  variant="line"
                  className="w-0 min-w-full gap-6 bg-transparent justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
                >
                  <TabsTrigger value="controles">
                    <ClipboardCheck /> Contrôles
                    {d && d.counts.BLOQUANT > 0 && (
                      <Badge size="sm" variant="destructive" appearance="light">
                        {d.counts.BLOQUANT}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="programme">
                    <BookOpen /> Programme
                  </TabsTrigger>
                  <TabsTrigger value="contenus">
                    <Library /> Contenus et intervenants
                  </TabsTrigger>
                  <TabsTrigger value="certification">
                    <Award /> Certification
                  </TabsTrigger>
                  <TabsTrigger value="apercu">
                    <Eye /> Documents et aperçu
                  </TabsTrigger>
                  <TabsTrigger value="transmission">
                    <Send /> Transmission et suivi
                  </TabsTrigger>
                  <TabsTrigger value="suivi">
                    <GraduationCap /> Suivi pédagogique
                  </TabsTrigger>
                </TabsList>
                <div className="pt-5">
                  <TabsContent value="controles">
                    {d ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Contrôles de la formation et du dossier commun ; «
                          Corriger » ouvre l’endroit à reprendre (
                          {Object.values(STEP_LABEL).join(', ').toLowerCase()}).
                        </p>
                        <AnomalyList anomalies={d.anomalies} onGo={go} />
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Préparez le dossier pour lancer les contrôles EDOF.
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="programme">
                    <ProgrammeTab fiche={fiche.data} highlight={highlight} />
                  </TabsContent>
                  <TabsContent value="contenus">
                    <ContenusTab fiche={fiche.data} highlight={highlight} />
                  </TabsContent>
                  <TabsContent value="certification">
                    <CertificationTab fiche={fiche.data} />
                  </TabsContent>
                  <TabsContent value="apercu">
                    <ApercuTab fiche={fiche.data} />
                  </TabsContent>
                  <TabsContent value="transmission">
                    {d ? (
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
                        <Card className="min-w-0">
                          <CardHeader>
                            <CardTitle>Pièces de la formation</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <PiecesPanel dossier={d} highlight={highlight} />
                            <p className="text-xs text-muted-foreground mt-4">
                              Les pièces communes (Kbis, identité du
                              représentant, attestations) sont dans le{' '}
                              <Link
                                className="text-primary underline"
                                href="/formation/edof"
                              >
                                dossier de l’établissement
                              </Link>
                              .
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="min-w-0">
                          <CardHeader>
                            <CardTitle>Dossier de la formation</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <DossierActions dossier={d} />
                          </CardContent>
                        </Card>
                      </div>
                    ) : dossier.error ? (
                      <Refusal error={dossier.error} />
                    ) : (
                      <p className="text-muted-foreground">
                        Préparez le dossier pour gérer ses pièces et sa
                        transmission.
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="suivi">
                    <SuiviTab programId={programId} />
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </div>
      </Content>
    </>
  );
}
