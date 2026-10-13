'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  BellRing,
  FileCheck2,
  FilePen,
  FileSignature,
  FileText,
  ListChecks,
  Plus,
  Send,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  DOC_STATUS_COLOR,
  DOC_STATUS_TONE,
  useDocumentsOverview,
  type DocStatus,
} from '@/lib/gsms/documents';
import { useBootstrap } from '@/lib/gsms/settings';
import { useCan } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NewDocumentDialog } from '@/components/documents/new-document-dialog';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
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

const STATUS_ORDER: DocStatus[] = [
  'BROUILLON',
  'EN_RELECTURE',
  'VALIDE',
  'ENVOYE',
  'ARCHIVE',
  'ABANDONNE',
];

// Accueil du module Documents (modèle « accueil de module ») : tout est compté par l'API sur les documents
// enregistrés ; sans document, chaque carte le dit.
export default function DocumentsHomePage() {
  const can = useCan();
  const { data, isLoading, error } = useDocumentsOverview();
  const boot = useBootstrap();
  const [creating, setCreating] = useState(false);
  const statuts = data?.statuts;
  const role = boot.data?.user.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <FileText className="size-4 text-primary" />
          Documents
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Documents"
            icon={FileText}
            title="Documents professionnels"
            description="Les devis de l’organisme : préparés à partir des formations et des fiches clients, relus, validés puis archivés en version figée."
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href="/documents/liste">
                    <ListChecks /> Tous les documents
                  </Link>
                </Button>
                {can('write_documents') && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> Nouveau devis
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
                        label: 'Brouillons',
                        value: statuts?.BROUILLON ?? 0,
                        subtitle: 'en préparation',
                        icon: FilePen,
                      },
                      {
                        label: 'En relecture',
                        value: statuts?.EN_RELECTURE ?? 0,
                        subtitle: 'à valider',
                        icon: FileSignature,
                      },
                      {
                        label: 'Validés',
                        value: statuts?.VALIDE ?? 0,
                        subtitle: 'prêts à envoyer',
                        icon: FileCheck2,
                      },
                      {
                        label: 'Envoyés',
                        value: statuts?.ENVOYE ?? 0,
                        subtitle: 'au client',
                        icon: Send,
                      },
                    ]}
                  />
                }
                main={
                  <WelcomeCallout
                    icon={FileText}
                    organization={boot.data?.organization?.name}
                    person={boot.data?.user.full_name}
                    role={role}
                    module="les documents"
                    description="Un devis part de la fiche du client et des formations du catalogue. Ce qui manque (adresse, tarif à confirmer, régime de TVA) est signalé et bloque la validation ; chaque version validée est archivée avec son empreinte."
                    footerLabel="Documents enregistrés"
                    footerValue={isLoading ? '…' : String(data?.total ?? 0)}
                    cta={{ label: 'Voir la liste', href: '/documents/liste' }}
                  />
                }
              />
              <LandingRow
                side={
                  <DonutCard
                    title="Documents par statut"
                    totalLabel="documents"
                    loading={isLoading}
                    slices={STATUS_ORDER.map((s) => ({
                      key: s,
                      label: STATUS_LABEL[s],
                      value: statuts?.[s] ?? 0,
                      color: DOC_STATUS_COLOR[s],
                    }))}
                  />
                }
                main={
                  <EvolutionCard
                    title="Documents validés par mois"
                    subtitle="Six derniers mois"
                    loading={isLoading}
                    series={[{ key: 'valides', label: 'Validés' }]}
                    points={(data?.valides_par_mois ?? []).map((m) => ({
                      period: format(
                        parse(m.mois, 'yyyy-MM', new Date()),
                        'MMM yy',
                        {
                          locale: fr,
                        },
                      ),
                      valides: m.nombre,
                    }))}
                  />
                }
              />
              <LandingRow
                side={
                  <AlertListCard
                    title="À traiter"
                    subtitle="Relectures, points bloquants, validités"
                    icon={BellRing}
                    loading={isLoading}
                    items={(data?.alertes ?? []).map((a, i) => ({
                      id: `${a.id}-${i}`,
                      title: a.message,
                      tone:
                        a.niveau === 'danger'
                          ? ('danger' as const)
                          : a.niveau === 'warning'
                            ? ('warning' as const)
                            : ('muted' as const),
                      href: `/documents/liste?id=${a.id}`,
                    }))}
                    empty="Rien à traiter."
                  />
                }
                main={
                  <SectionCard
                    title="Derniers documents"
                    subtitle="Modifiés récemment"
                    icon={ListChecks}
                    count={isLoading ? undefined : data?.total}
                    contentClassName="p-0"
                    toolbar={
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/documents/liste">Tous</Link>
                      </Button>
                    }
                  >
                    {!data?.recents.length ? (
                      <SectionEmpty icon={FileText}>
                        {isLoading
                          ? 'Chargement…'
                          : 'Aucun document pour l’instant.'}
                      </SectionEmpty>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-dashed text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-5 py-2.5 text-start font-medium">
                                Document
                              </th>
                              <th className="px-3 py-2.5 text-start font-medium max-md:hidden">
                                Client
                              </th>
                              <th className="px-3 py-2.5 text-start font-medium max-sm:hidden">
                                Modifié
                              </th>
                              <th className="px-5 py-2.5 text-end font-medium">
                                Statut
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.recents.map((d) => (
                              <tr
                                key={d.id}
                                className="border-b border-dashed last:border-0"
                              >
                                <td className="max-w-64 px-5 py-2.5">
                                  <Link
                                    href={`/documents/liste?id=${d.id}`}
                                    className="block truncate font-medium text-foreground hover:text-primary"
                                  >
                                    {d.titre}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">
                                    {d.reference}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 max-md:hidden">
                                  {d.client?.nom ?? '—'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-secondary-foreground max-sm:hidden">
                                  {formatDate(d.modifie_le)}
                                </td>
                                <td className="px-5 py-2.5 text-end">
                                  <Badge
                                    size="sm"
                                    className={DOC_STATUS_TONE[d.statut]}
                                  >
                                    {d.statut_libelle}
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
            </>
          )}
        </div>
      </Content>
      <NewDocumentDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

const STATUS_LABEL: Record<DocStatus, string> = {
  BROUILLON: 'Brouillon',
  EN_RELECTURE: 'En relecture',
  VALIDE: 'Validé',
  ENVOYE: 'Envoyé',
  ARCHIVE: 'Archivé',
  ABANDONNE: 'Abandonné',
};
